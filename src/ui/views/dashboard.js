import { esc, fmtNum, fmtPct, sum, pluralise } from "../dom.js?v=mwz6nuk5";
import { bar, chip, emptyState, metricCard, meter, questBoard, sectionCard, subjectMark, deadlineChip, priorityChip } from "../components.js?v=mwz6nuk5";
import { donut, legend, barChart, hBars } from "../charts.js?v=mwz6nuk5";
import { fmtDuration, fmtShort, addDays, diffDays, relative } from "../../core/dates.js?v=mwz6nuk5";
import {
  currentSelection, scopedScopes, scopedTime, visibleChapters,
  filterBySubject, taskSubjectId, revisionSubjectId, isVisibleSubject,
} from "../selection.js?v=mwz6nuk5";
import { getExams } from "../../core/boardExams.js?v=mwz6nuk5";
import { inkUnderline } from "../ink.js?v=mwz6nuk5";
import { mascotBubble } from "../mascot.js?v=mwz6nuk5";

const ACTIVITY_COLOR = { learn: "var(--accent)", practice: "var(--accent-2)", revision: "var(--warn)", doubt: "var(--bad)" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A short, honest nudge from the study buddy. Never invents progress. */
function buddyLine({ daysToExam, openPlan, plannedMin, minutesToday, streak, nothingYet, boardPct }) {
  const tasks = openPlan.length;
  if (nothingYet) return "New notebook, fresh start. Load the plan or open a chapter — I'll keep watch.";
  if (daysToExam !== null && daysToExam >= 0 && daysToExam <= 3) {
    return `${daysToExam} day${daysToExam === 1 ? "" : "s"} to the first paper. One block at a time — no 2am heroics.`;
  }
  if (tasks && minutesToday === 0) {
    return `${tasks} task${tasks === 1 ? "" : "s"} on today's list and no minutes yet. Start with the shortest one.`;
  }
  if (tasks) return `${tasks} left today. Finish one, then take the win.`;
  if (minutesToday > 0) {
    const logged = fmtDuration(minutesToday);
    const streakBit = streak >= 2 ? ` ${streak}-day streak alive.` : " That counts.";
    return `${logged} logged today.${streakBit} Stop while it still feels good.`;
  }
  if (plannedMin === 0) return "Nothing planned yet. A 20-minute block is enough to make today count.";
  return boardPct >= 50
    ? "The page is filling in. Keep going — small steps compound."
    : "Small steps, every day. That's the whole trick.";
}

/** Gen-Z Hinglish rumour copy for the board exam countdown. */
function rumourCopy(daysLeft) {
  if (daysLeft <= 0) return "AA GAYA PAPER! ⚡️😱 Jaldi jao centre pe!";
  if (daysLeft === 1) return "KAL PAPER HAI! 😱 Ab mat chhodna study, raat-bhar jagna padega.";
  if (daysLeft <= 3) return "Rumour: paper tough hone wala hai. Sirf " + daysLeft + " din bache! 😳";
  if (daysLeft <= 7) return "ABHI SHURU KAR DO! 😭 " + daysLeft + " din baad paper hai.";
  if (daysLeft <= 14) return "Bhai, abhi se start karo... " + daysLeft + " din baad board paper. 👀";
  return "Bhai, abhi se panic mat karna... lekin paper aa raha hai. 🤐";
}

export default {
  id: "dashboard",
  title: "Dashboard",
  render(ctx) {
    const { store, today } = ctx;
    const d = store.derived;
    const p = d.progress;
    const settings = store.state.settings;
    const scopes = scopedScopes(store);
    const board = scopes.board;
    const all = scopes.all;
    const time = scopedTime(store);

    /* ---------------------------------------------------- personal scope -- */
    // The selection is the student's own account choice. When no selection
    // exists yet, everything stays visible.
    const selection = currentSelection(store);
    const isVisible = (id) => isVisibleSubject(store, id);
    const pctOf = (x) => (x && x.leaves ? (x.done / x.leaves) * 100 : 0);
    const boardView = board;
    const internalView = scopes.internal;
    const optionalView = scopes.optional;
    const boardPct = selection ? pctOf(boardView) : board.pct;
    const chosenSubjects = store.subjectsSorted().filter((s) => isVisible(s.id));

    const planDay = settings.planLoadedFor ? diffDays(settings.planLoadedFor, today) + 1 : null;
    const daysToExam = settings.targetDate ? diffDays(today, settings.targetDate) : null;
    const todayPlan = filterBySubject(store, store.plannerOn(today), (t) => taskSubjectId(store, t));
    const plannedMin = sum(todayPlan, (t) => t.estMin);
    const openPlan = todayPlan.filter((t) => !t.done);
    const dailyTarget = Number(settings.dailyTargetMin) || 0;
    const overload = plannedMin > dailyTarget && dailyTarget > 0;

    const allPlanner = filterBySubject(store, store.state.planner, (t) => taskSubjectId(store, t));
    const overduePlanner = allPlanner.filter((t) => !t.done && t.dateISO < today);
    const overdueDeadlines = store.allDeadlines().filter((x) => isVisible(x.subjectId) && x.deadline < today && x.status !== "Done" && x.status !== "Revise" && x.status !== "Second Revision");
    const allSessions = filterBySubject(store, store.state.sessions, (s) => s.subjectId);
    const scopedRevisions = filterBySubject(store, store.state.revisions, (r) => revisionSubjectId(store, r));
    const revDue = filterBySubject(store, d.revisionDue, (x) => x.subjectId || store.chapter(x.chapterId)?.subjectId).length;
    const soonDeadlines = store.allDeadlines().filter((x) => isVisible(x.subjectId) && x.deadline >= today).slice(0, 6);

    const totalLogged = sum(allSessions, (s) => s.minutes);
    const weekLogged = Object.entries(time.byDate)
      .filter(([iso]) => iso >= addDays(today, -6))
      .reduce((n, [, mins]) => n + mins, 0);
    const scopedNotes = filterBySubject(store, store.state.notes, (n) => n.subjectId);
    const openDoubts = scopedNotes.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved").length;
    const totalDoubts = scopedNotes.filter((n) => n.kind === "doubt").length;
    const visibleCh = visibleChapters(store);
    const revStats = visibleCh.reduce((a, c) => {
      const st = store.progressOf(c.id);
      if (st.leaves > 0 && st.done === st.leaves) {
        a.doneChapters += 1;
        if ((st.passes || 0) >= 1) a.rev1 += 1;
        if ((st.passes || 0) >= 2) a.rev2 += 1;
      }
      return a;
    }, { doneChapters: 0, rev1: 0, rev2: 0 });
    const revision = selection ? revStats : p.revision;
    const nothingYet = allSessions.length === 0 && board.done === 0 && allPlanner.length === 0 && scopedRevisions.length === 0;

    /* ------------------------------------------------------------- hero --- */
    const g = d.gamification;
    const buddy = buddyLine({
      daysToExam,
      openPlan,
      plannedMin,
      minutesToday: time.today,
      streak: g.streak.current,
      nothingYet,
      boardPct,
    });
    const buddyMood = daysToExam !== null && daysToExam <= 7
      ? "focused"
      : g.streak.current >= 3 || boardPct >= 50
        ? "cheer"
        : "ready";
    const heroTitle = boardPct >= 80
      ? "Revision territory. Keep it warm."
      : boardPct >= 40
        ? "Halfway there. Keep the pencil moving."
        : boardPct > 0
          ? "Momentum looks good on you."
          : "Blank page? Best place to start.";
    const xpPct = Math.max(0, Math.min(100, (g.level.intoLevel / Math.max(1, g.level.needed)) * 100));

    const hero = `<section class="card hero dash-hero">
      <div class="dash-hero-grid">
        <div class="dash-hero-main">
          <span class="eyebrow">Board-exam readiness</span>
          <div class="dash-hero-readiness">
            <div class="readiness-ring" style="--p:${Math.max(0, Math.min(100, Math.round(boardPct)))}" role="img" aria-label="${fmtPct(boardPct)} of board-scope items ticked">
              <div class="readiness-ring-inner">
                <span class="hero-num">${fmtPct(boardPct)}</span>
                ${inkUnderline({ width: 104, height: 9, seed: "hero", className: "ink-hero" })}
                <span class="xs faint">board scope</span>
              </div>
            </div>
            <div class="dash-hero-lede">
              <h2 class="dash-hero-title">${heroTitle}</h2>
              <p class="small muted">${fmtNum(boardView.done)} of ${fmtNum(boardView.leaves)} board-scope items ticked${(internalView.leaves + optionalView.leaves) ? ` · ${pluralise(internalView.leaves + optionalView.leaves, "internal/optional item")} tracked separately` : ""}</p>
              ${bar(boardPct, { tall: true, cls: boardPct >= 80 ? "ok" : boardPct >= 40 ? "" : "warn" })}
              <div class="hero-actions">
                <a class="btn primary" href="#/planner">Today's plan${openPlan.length ? ` (${openPlan.length})` : ""}</a>
                <a class="btn" href="#/timer">Start a session</a>
                <a class="btn ghost" href="#/calendar">60-day calendar</a>
                <a class="btn ghost" href="#/curriculum">Syllabus map</a>
                <a class="btn ghost" href="#/pyq">PYQ insights</a>
              </div>
            </div>
          </div>
        </div>

        <aside class="dash-hero-side" aria-label="Today at a glance">
          ${mascotBubble({ mood: buddyMood, size: 84, title: "Chotu says", text: buddy, className: "dash-buddy" })}
          <div class="hero-statgrid">
            <div class="stat-line"><span class="muted small">Today</span><b>${esc(fmtShort(today))}</b></div>
            <div class="stat-line"><span class="muted small">First paper (target)</span><b>${settings.targetDate ? `${esc(fmtShort(settings.targetDate))}` : "not set"}</b></div>
            <div class="stat-line"><span class="muted small">Days remaining</span><b>${daysToExam === null ? "—" : fmtNum(daysToExam)}</b></div>
            <div class="stat-line"><span class="muted small">Plan day</span><b>${planDay && planDay >= 1 && planDay <= 90 ? `${planDay} of 60` : "not loaded"}</b></div>
            <div class="stat-line"><span class="muted small">Level</span><b>${esc(g.level.title)} · ${fmtNum(g.points)} XP</b></div>
            <div class="stat-line"><span class="muted small">Streak</span><b>${fmtNum(g.streak.current)} day${g.streak.current === 1 ? "" : "s"}${g.todayQualified ? " 🔥" : ""}</b></div>
            <div class="stat-line"><span class="muted small">Logged today</span><b>${esc(fmtDuration(time.today))}${dailyTarget ? ` <span class="faint xs">/ ${esc(fmtDuration(dailyTarget))}</span>` : ""}</b></div>
          </div>
          <div class="xp-card">
            <div class="row between gap-2 xs">
              <span class="small muted">Level ${esc(g.level.level)} · ${esc(g.level.title)}</span>
              <span class="small muted">${fmtNum(g.level.intoLevel)}/${fmtNum(g.level.needed)} XP</span>
            </div>
            <div class="xp-bar" role="progressbar" aria-label="Level progress" aria-valuenow="${Math.round(xpPct)}" aria-valuemin="0" aria-valuemax="100">
              <span style="width: ${xpPct}%"></span>
            </div>
          </div>
        </aside>
      </div>
      ${overload ? `<div class="callout warn mt-4">⚠️ Today's plan asks for <b>${esc(fmtDuration(plannedMin))}</b> but your daily target is <b>${esc(fmtDuration(dailyTarget))}</b>. Move ${esc(fmtDuration(plannedMin - dailyTarget))} to another day, or raise today's target in Settings. <a href="#/planner">Open the planner →</a></div>` : ""}
    </section>`;

    /* ------------------------------------------------ board exam countdown --- */
    const allExams = getExams();
    let nextExam = allExams.find((e) => e.isUpcoming);
    if (!nextExam) {
      allExams.sort((a, b) => a.exam_date.localeCompare(b.exam_date) || a.start_time.localeCompare(b.start_time));
      nextExam = allExams[0] || null;
    }
    const boardExamCard = nextExam ? `
      <section class="card stripe board-countdown" style="--stripe:var(--bad)">
        <div class="row between gap-3">
          <div class="grow">
            <div class="eyebrow" style="letter-spacing:.2em;text-transform:uppercase;color:var(--bad-ink)">Board Exam D-Day</div>
            <div class="countdown-big" style="font-size:clamp(1.5rem,4vw,2.5rem);font-weight:900;line-height:1;color:var(--bad-ink);letter-spacing:-0.03em" id="bd-countdown" data-target="${nextExam.exam_date}|${nextExam.start_time}">${nextExam.daysUntil}d left</div>
            <div class="countdown-subj" style="font-size:1.1rem;font-weight:700;margin-top:6px">${esc(nextExam.subject_name)}</div>
            <div class="countdown-rumour" style="font-size:.85rem;color:var(--muted);margin-top:4px">${rumourCopy(nextExam.daysUntil)}</div>
          </div>
          <div class="row gap-2">
            <a class="btn danger" href="#/board-exams">View all exams →</a>
            ${nextExam.subjectId ? `<a class="btn ghost" href="#/subject/${esc(nextExam.subjectId)}">Open subject</a>` : ""}
          </div>
        </div>
      </section>` : "";

    const streakDays = store.state.settings.streakDays || d.gamification.streak.current;
    const recentDays = [];
    for (let i = 6; i >= 0; i--) {
      const d0 = addDays(today, -i);
      const s = store.state.sessions.filter((s) => s.dateISO === d0 && isVisibleSubject(store, s.subjectId));
      recentDays.push({ date: d0, done: s.length > 0, mins: sum(s, (t) => t.minutes) });
    }
    const streakCalendar = `
      <section class="card tight streak-card">
        <div class="row wrap between gap-3">
          <span class="eyebrow">Last 7 days</span>
          <span class="small faint">${streakDays} day streak${streakDays === 1 ? "" : "s"}</span>
        </div>
        <div class="streak-calendar">
          ${recentDays.map((d) => {
            const isDone = d.done;
            const isCurrent = d.date === today && d.done;
            const [yy, mm, dd] = d.date.split("-").map(Number);
            const dow = WEEKDAYS[new Date(yy, mm - 1, dd).getDay()] || "";
            return `<div class="streak-day ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}" title="${d.date}: ${d.mins} min" aria-label="${d.date}: ${d.mins} minutes">
              <span class="streak-day-dow" aria-hidden="true">${dow.slice(0, 1)}</span>
              <span class="streak-day-num">${dd}</span>
              ${isDone ? `<span class="streak-day-flame" aria-hidden="true">🔥</span>` : ""}
            </div>`;
          }).join("")}
        </div>
      </section>`;

    const subjectStrip = selection ? `<section class="card tight dash-subjects" aria-label="Your chosen subjects">
      <div class="row wrap between gap-3">
        <div class="row wrap gap-2" style="align-items:center">
          <span class="eyebrow" style="margin:0">Your subjects</span>
          ${chosenSubjects.map((s) => `<a class="chip soft" href="#/subject/${esc(s.id)}"><span class="dot" style="background:${esc(s.color)}"></span> ${esc(s.short || s.name)}</a>`).join("")}
        </div>
        <a class="btn sm ghost" href="#/choose-subjects">Manage subjects</a>
      </div>
    </section>` : "";

    /* ----------------------------------------------------------- subjects -- */
    const tiles = sectionCard({
      title: "Subjects",
      subtitle: selection ? "Only the subjects you chose — with chapters, checklists and notes" : "Click through to chapters, checklists and notes",
      actions: `${selection ? `<a class="btn sm ghost" href="#/choose-subjects">Manage</a>` : ""}<a class="btn sm ghost" href="#/syllabus">Open syllabus</a>`,
      body: `<div class="tiles tinted">${p.subjects.filter((s) => isVisible(s.id)).map((s) => {
        const sc = s.scopes?.board || { pct: 0, done: 0, leaves: 0, chapters: 0, chaptersDone: 0 };
        const mins = time.bySubject[s.id] || 0;
        const doubts = store.state.notes.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved" && n.subjectId === s.id).length;
        return `<a class="tile" href="#/subject/${esc(s.id)}">
          <div class="tile-top">${subjectMark(s)}<div class="grow"><h3>${esc(s.short || s.name)}</h3><div class="xs muted truncate">${esc(s.name)}${s.code ? ` · ${esc(s.code)}` : ""}</div></div></div>
          ${meter(sc.pct, { cls: sc.pct >= 80 ? "ok" : sc.pct >= 40 ? "" : "warn" })}
          <div class="stats">
            <span><b>${sc.chaptersDone}/${sc.chapters}</b>chapters</span>
            <span><b>${sc.done}/${sc.leaves}</b>items</span>
            <span><b>${esc(fmtDuration(mins))}</b>studied</span>
            ${doubts ? `<span><b style="color:var(--warn-ink)">${doubts}</b>doubts</span>` : ""}
          </div>
        </a>`;
      }).join("")}</div>`,
    });

    /* ---------------------------------------------------------------- notes --- */
    const recentNotes = store.state.notes
      .filter((n) => isVisible(n.subjectId))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 5);
    const notesCard = sectionCard({
      title: "Subject notes",
      subtitle: selection ? "Your latest notes and doubts for these subjects" : "Your latest notes and doubts",
      actions: `<a class="btn sm ghost" href="#/notes">All notes</a>`,
      body: recentNotes.length
        ? `<div class="dash-note-list">${recentNotes.map((n) => {
            const subj = n.subjectId ? store.subject(n.subjectId) : null;
            const ch = n.chapterId ? store.chapter(n.chapterId) : null;
            const href = n.chapterId ? `#/chapter/${esc(n.chapterId)}` : "#/notes";
            return `<a class="dash-note" href="${href}">
              <span class="dot" style="background:${esc(subj?.color || "var(--faint)")}"></span>
              <span class="grow" style="min-width:0"><span class="truncate" style="display:block">${esc(n.text)}</span><span class="xs faint">${esc(subj?.short || "General")}${ch ? ` · ${esc(ch.name)}` : ""}</span></span>
              ${chip(n.kind, n.kind === "doubt" ? "warn" : "plain")}
            </a>`;
          }).join("")}</div>`
        : emptyState({ icon: "✎", title: "No notes yet", text: "Capture a formula, a doubt or a reminder and it will appear here, attached to its subject.", action: `<a class="btn sm" href="#/notes">Open notes</a>` }),
    });

    const support = notesCard;

    if (nothingYet) {
      return hero + boardExamCard + subjectStrip + (selection ? tiles + support : "") + sectionCard({
        title: "Nothing logged yet",
        body: `<p class="muted">The syllabus (${fmtNum(store.state.subjects.length)} subjects, ${fmtNum(store.state.chapters.length)} chapters and the topic checklist for each) is ready to use. Everything else appears as you use it: tick items in <a href="#/syllabus">My Syllabus</a>, plan a day in the <a href="#/planner">Daily Planner</a>, run the <a href="#/timer">Study Timer</a>.</p>
        ${emptyState({
          icon: "🌱",
          title: "Suggested first moves",
          text: "Load the 60-day plan, then start with the two setup blocks the plan begins with.",
          action: `<button class="btn primary" data-act="plan-load" data-date="${esc(today)}">Load the 60-day plan</button>
                   <a class="btn" href="#/syllabus">Browse the syllabus</a>`,
        })}`,
      });
    }

    /* ---------------------------------------------------------- metrics --- */
    const metrics = `<div class="metrics">
      ${metricCard({ k: "Board items done", v: `${fmtNum(boardView.done)}<span class="faint" style="font-size:var(--fs-lg)">/${fmtNum(boardView.leaves)}</span>`, s: esc(fmtPct(boardPct, 1)), href: "#/syllabus" })}
      ${metricCard({ k: "Chapters complete", v: `${fmtNum(boardView.chaptersDone)}<span class="faint" style="font-size:var(--fs-lg)">/${fmtNum(boardView.chapters)}</span>`, s: `board-assessed chapters`, href: "#/analytics" })}
      ${metricCard({ k: "Studied today", v: esc(fmtDuration(time.today)), s: dailyTarget ? `${fmtPct(dailyTarget ? (time.today / dailyTarget) * 100 : 0)} of ${esc(fmtDuration(dailyTarget))} target` : "no daily target set", tone: time.today >= dailyTarget && dailyTarget ? "ok" : "" })}
      ${metricCard({ k: "This week", v: esc(fmtDuration(weekLogged)), s: `${pluralise(allSessions.filter((s) => s.dateISO >= addDays(today, -6)).length, "session")} in the last 7 days` })}
      ${metricCard({ k: "Total logged", v: esc(fmtDuration(totalLogged)), s: esc(pluralise(allSessions.length, "session")) })}
      ${metricCard({ k: "Overdue", v: fmtNum(overduePlanner.length + overdueDeadlines.length), s: `${overduePlanner.length} planned · ${overdueDeadlines.length} deadlines`, tone: overduePlanner.length + overdueDeadlines.length ? "bad" : "ok", href: "#/planner" })}
      ${metricCard({ k: "Revision due", v: fmtNum(revDue), s: `${fmtPct(revision.doneChapters ? (revision.rev1 / revision.doneChapters) * 100 : 0)} of finished chapters revised`, tone: revDue ? "warn" : "ok", href: "#/revision" })}
      ${metricCard({ k: "Open doubts", v: fmtNum(openDoubts), s: `${totalDoubts} recorded in total`, tone: openDoubts ? "warn" : "ok", href: "#/notes" })}
    </div>`;

    /* ----------------------------------------------------------- charts --- */
    const charts = `<div class="grid-3" style="align-items:start">
      ${sectionCard({
        title: "Board work",
        subtitle: "Ticked vs remaining, board scope only",
        body: donut({
          segments: [
            { label: "Done", value: boardView.done, color: "var(--ok)" },
            { label: "Remaining", value: Math.max(0, boardView.leaves - boardView.done), color: "var(--surface-3)" },
          ],
          center: fmtPct(boardPct), sub: `${boardView.done}/${boardView.leaves} items`,
        }) + legend([{ label: "Done", color: "var(--ok)", value: boardView.done }, { label: "Remaining", color: "var(--surface-3)", value: Math.max(0, boardView.leaves - boardView.done) }]),
      })}
      ${sectionCard({
        title: "Every scope",
        subtitle: "Board, internal and optional work never mixed together",
        body: hBars({
          data: [
            { label: "Board (exam)", value: boardView.leaves, pct: boardPct, color: "var(--accent)" },
            { label: "Internal (school)", value: internalView.leaves, pct: selection ? pctOf(internalView) : internalView.pct, color: "var(--info)" },
            { label: "Optional / excluded", value: optionalView.leaves, pct: selection ? pctOf(optionalView) : optionalView.pct, color: "var(--faint)" },
          ],
          valueFormat: (v) => `${fmtNum(v)} items`, showPct: true,
        }) + `<div class="card-note">Percentages on the right are the share of each scope's items that are ticked.</div>`,
      })}
      ${sectionCard({
        title: "Revision ladder",
        subtitle: "Of finished chapters, how many have been revised",
        body: donut({
          segments: [
            { label: "Rev 2+", value: revision.rev2, color: "var(--accent)" },
            { label: "Rev 1", value: Math.max(0, revision.rev1 - revision.rev2), color: "var(--warn)" },
            { label: "Never revised", value: Math.max(0, revision.doneChapters - revision.rev1), color: "var(--surface-3)" },
          ],
          center: fmtNum(revDue), sub: "awaiting first revision",
        }) + legend([
          { label: "Revised twice or more", color: "var(--accent)", value: revision.rev2 },
          { label: "Revised once", color: "var(--warn)", value: Math.max(0, revision.rev1 - revision.rev2) },
          { label: "Not yet revised", color: "var(--surface-3)", value: Math.max(0, revision.doneChapters - revision.rev1) },
        ]),
      })}
    </div>`;

    /* --------------------------------------------------------------- next -- */
    const rec = d.recommendations;
    const suggestions = rec.suggestions.filter((s) => isVisible(s.subjectId));
    const next = sectionCard({
      title: "What should I study next?",
      subtitle: `Ranked from your own data · assumes ${fmtDuration(rec.utilization.availableMin)} of free time today`,
      actions: `<a class="btn sm ghost" href="#/analytics">How this is calculated</a>`,
      body: suggestions.length === 0
        ? emptyState({ icon: "🧭", title: "Nothing to recommend yet", text: "Tick something as done, set a deadline, or add a task to today's plan — recommendations come only from your records." })
        : `<div class="suggest">${suggestions.map((s, i) => {
            const subj = s.subjectId ? store.subject(s.subjectId) : null;
            return `<div class="suggest-item">
              <div class="row gap-3" style="align-items:flex-start">
                <div class="suggest-rank">${i + 1}</div>
                <div class="grow">
                  <div class="row wrap gap-2">
                    ${subj ? subjectMark(subj, ";width:22px;height:22px;font-size:10px") : ""}
                    <b>${esc(s.title)}</b>
                    <span class="chip plain">${esc(s.type)}</span>
                    ${s.deadline ? deadlineChip(s.deadline, today) : ""}
                    ${s.chapterId ? priorityChip(store.chapter(s.chapterId)?.priority) : ""}
                    <span class="chip soft">≈${esc(fmtDuration(s.estMin))}</span>
                    <span class="chip soft" title="Score from the transparent weighting rules">score ${esc(s.score)}</span>
                  </div>
                  ${s.subtitle ? `<div class="xs muted mt-2">${esc(s.subtitle)}</div>` : ""}
                  <div class="why">${s.signals.map((sig) => `<span class="chip plain" title="${sig.points >= 0 ? "+" : ""}${esc(sig.points)}">${sig.points >= 0 ? "＋" : "－"} ${esc(sig.label)}</span>`).join("")}</div>
                </div>
                <div class="row gap-1">
                  ${s.chapterId ? `<a class="btn sm" href="#/chapter/${esc(s.chapterId)}">Open</a>` : ""}
                  <button class="btn sm primary" data-act="plan-quick-add" data-chapter="${esc(s.chapterId || "")}" data-title="${esc(s.title)}" data-est="${esc(s.estMin)}" data-date="${esc(today)}">Add to today</button>
                </div>
              </div>
            </div>`;
          }).join("")}</div>
          <div class="card-note">Suggestions only — nothing is scheduled for you. Weights: overdue 100+, deadline 60+, priority P1 30, tier 1 25, in-progress 20, doubt 22, unblocks later chapters 15, blocks on earlier work −30, already studied in the last 2 days −15.</div>`,
    });

    /* -------------------------------------------------------------- today -- */
    const todayCard = sectionCard({
      title: "Today",
      subtitle: esc(fmtShort(today)),
      cls: "dash-today",
      actions: `<a class="btn sm" href="#/planner">Open planner</a>`,
      body: `<div class="stack gap-3">
        <div class="row between"><span class="small">Planned</span><b>${esc(fmtDuration(plannedMin))}</b></div>
        ${bar(dailyTarget ? Math.min(100, (plannedMin / dailyTarget) * 100) : 0, { cls: overload ? "bad" : "ok" })}
        <div class="row between"><span class="small">Actually logged</span><b>${esc(fmtDuration(time.today))}</b></div>
        ${bar(dailyTarget ? Math.min(100, (time.today / dailyTarget) * 100) : 0, { cls: "ok" })}
        ${openPlan.length === 0
          ? `<p class="small muted">Nothing left open on today's plan.</p>`
          : `<ul class="list" style="list-style:none">${openPlan.slice(0, 5).map((t) => `<li class="row gap-2"><label class="check"><input type="checkbox" data-act="planner-toggle" data-id="${esc(t.id)}"><span class="box"></span><span class="label-text small">${esc(t.title)}</span></label><span class="grow"></span><span class="chip soft">${esc(fmtDuration(t.estMin))}</span></li>`).join("")}</ul>
             ${openPlan.length > 5 ? `<div class="xs faint">+ ${openPlan.length - 5} more…</div>` : ""}`}
      </div>`,
    });

    /* ---------------------------------------------------------- quests ----- */
    const q = d.gamification.quests;
    const questCard = questBoard({
      title: "Today's quests",
      subtitle: `${q.dailyDoneCount}/${q.daily.length} done · ${q.xpAvailable ? `+${fmtNum(q.xpAvailable)} XP still up for grabs` : "board cleared"}`,
      cls: "dash-quests",
      actions: `<a class="btn sm ghost" href="#/profile">Weekly quests →</a>`,
      quests: q.daily,
      note: "Quests reset each day. A quest's XP is paid once, straight into the same level as everything else — nothing here can be farmed by refreshing.",
    });

    const deadlinesCard = sectionCard({
      title: "Upcoming deadlines",
      subtitle: "Derived from the plan; edit any of them per chapter",
      body: soonDeadlines.length === 0
        ? `<p class="small muted">No deadlines in the future. Set a target date, or give a chapter its own deadline.</p>`
        : `<div class="stack gap-2">${soonDeadlines.map((x) => {
            const ch = x.type === "chapter" ? store.chapter(x.id) : null;
            const subj = store.subject(x.subjectId);
            const days = diffDays(today, x.deadline);
            return `<div class="row gap-3">
              ${subj ? subjectMark(subj, ";width:24px;height:24px;font-size:10px") : ""}
              <div class="grow truncate">${ch ? `<a href="#/chapter/${esc(ch.id)}">${esc(x.name)}</a>` : esc(x.name)}</div>
              <span class="chip ${days <= 3 ? "warn" : "soft"}">${esc(relative(x.deadline, today))}</span>
            </div>`;
          }).join("")}</div>`,
    });

    const timeChart = sectionCard({
      title: "Study time, last 14 days",
      subtitle: "Minutes logged per day (dashed line = daily target)",
      actions: `<a class="btn sm ghost" href="#/analytics">Full analytics</a>`,
      body: (() => {
        const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
        const data = days.map((iso) => ({ label: iso, short: iso.slice(8), value: time.byDate[iso] || 0 }));
        const has = data.some((x) => x.value > 0);
        if (!has) return emptyState({ icon: "⏱", title: "No sessions logged in the last 14 days", text: "Run the timer or add a session by hand and this chart fills in.", action: `<a class="btn primary" href="#/timer">Open the timer</a>` });
        return barChart({ data, goal: dailyTarget || null, valueFormat: (v) => `${Math.round(v)}m`, ariaLabel: "Daily study minutes for the last 14 days" });
      })(),
    });

    const activityCard = sectionCard({
      title: "Where the time goes",
      subtitle: "Initial learning vs practice vs revision",
      body: (() => {
        const entries = Object.entries(time.byActivity);
        if (!entries.length) return `<p class="small muted">No session minutes recorded yet.</p>`;
        return hBars({
          data: entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
            label: k === "learn" ? "Initial learning" : k === "practice" ? "Practice" : k === "revision" ? "Revision" : "Doubt resolution",
            value: v, color: ACTIVITY_COLOR[k] || "var(--accent)",
          })),
          valueFormat: (v) => fmtDuration(v),
        });
      })(),
    });

    const focusGrid = `<div class="dash-focus-grid">${todayCard}${questCard}${streakCalendar}</div>`;

    return [hero, boardExamCard, subjectStrip, metrics, focusGrid, next, charts, tiles, support, deadlinesCard, timeChart, activityCard].join("");
  },

  mount(ctx) {
    let timer = null;
    let retry = null;
    try {
      const startTimer = (el) => {
        const target = el.getAttribute("data-target");
        if (!target) {
          el.textContent = "exam soon";
          return;
        }
        const [datePart, timePart] = target.split("|");
        const [hy, hm, hd] = datePart.split("-").map(Number);
        const [hh, mm] = timePart.split(":").map(Number);
        if (!hy || !hm || !hd || hh === undefined || mm === undefined) {
          el.textContent = "exam soon";
          return;
        }
        const targetMs = new Date(hy, hm - 1, hd, hh, mm, 0).getTime();

        const tick = () => {
          try {
            const now = Date.now();
            const diff = targetMs - now;
            if (diff <= 0) {
              el.textContent = "PAPER AA GAYA! ⚡️";
              el.style.color = "var(--bad-ink)";
              if (timer) clearInterval(timer);
              timer = null;
              return;
            }
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            el.textContent = `${d}d ${h}h ${m}m ${s}s`;
            if (d <= 1) el.style.opacity = Math.random() > 0.85 ? "0.6" : "1";
          } catch (e) {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
        tick();
        timer = setInterval(tick, 1000);
        // In Node (tests) a live interval would stop the process from exiting;
        // browsers return a number here, so this is a harmless no-op there.
        if (timer && typeof timer.unref === "function") timer.unref();
      };

      let attempts = 0;
      const tryInit = () => {
        const el = document.getElementById("bd-countdown");
        if (!el) {
          attempts++;
          if (attempts > 20) return;
          retry = setTimeout(tryInit, 30);
          return;
        }
        startTimer(el);
      };
      tryInit();
    } catch (e) {
      console.error("[board-exams] timer mount failed", e);
    }

    return () => {
      if (timer) clearInterval(timer);
      if (retry) clearTimeout(retry);
      timer = null;
      retry = null;
    };
  },
};
