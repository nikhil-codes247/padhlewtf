import { esc, fmtNum, sum, sortBy } from "../dom.js?v=mwz1qwqk";
import { emptyState, metricCard, sectionCard, table, meter, bar } from "../components.js?v=mwz1qwqk";
import { donut, legend, barChart, lineChart, hBars } from "../charts.js?v=mwz1qwqk";
import { addDays, fmtDuration, fmtShort, diffDays } from "../../core/dates.js?v=mwz1qwqk";
import { chapterEstimate } from "../../core/recommend.js?v=mwz1qwqk";
import { summariseFlashcards, summariseQuestions } from "../../core/revisionStats.js?v=mwz1qwqk";
import { scopedTime, scopedScopes, currentSelection, visibleSubjects, visibleChapters, filterBySubject, taskSubjectId, isVisibleSubject } from "../selection.js?v=mwz1qwqk";

const ACTIVITY_COLOR = { learn: "var(--accent)", practice: "var(--accent-2)", revision: "var(--warn)", doubt: "var(--bad)" };
const ACTIVITY_LABEL = { learn: "Initial learning", practice: "Practice", revision: "Revision", doubt: "Doubt resolution" };

/** Group daily values into 7-day buckets so long ranges stay readable. */
function weekBuckets(days, byDate) {
  const out = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    out.push({
      label: `${fmtShort(chunk[0])} · ${fmtShort(chunk[chunk.length - 1])}`,
      short: fmtShort(chunk[0]),
      value: sum(chunk, (d) => byDate[d] || 0),
    });
  }
  return out;
}

/** A stacked done / remaining bar row for one subject. */
function subjectProgressRow(s, timeBySubject) {
  const done = s.scopes.board.done;
  const leaves = s.scopes.board.leaves;
  const remaining = Math.max(0, leaves - done);
  const pct = leaves ? Math.round((done / leaves) * 100) : 0;
  const bar = `<div style="height:13px;border:var(--border-w-thin) solid var(--ink);border-radius:999px;overflow:hidden;flex:1;min-width:0">
    <span style="width:${pct}%;background:var(--ok);height:100%"></span>
    <span style="width:${100 - pct}%;background:var(--surface-3);height:100%"></span>
  </div>`;
  const minutes = timeBySubject[s.id] || 0;
  return `<div class="row gap-3">
    <div class="small truncate" style="width:min(36%,170px)" title="${esc(s.name)}">${esc(s.short || s.name)}</div>
    <div class="grow" style="display:flex;align-items:center;gap:var(--sp-3);min-width:0">${bar}<span class="xs faint nowrap">${pct}% done</span></div>
    <div class="small nowrap right" style="width:72px;font-variant-numeric:tabular-nums">${esc(fmtDuration(minutes))}</div>
  </div>`;
}

export default {
  id: "analytics",
  title: "Analytics",
  render(ctx) {
    const { store, ui, today } = ctx;
    const p = store.derived.progress;
    const time = scopedTime(store);
    const selection = currentSelection(store);
    const scopes = scopedScopes(store);
    const subjects = visibleSubjects(store);
    const chapters = visibleChapters(store);
    const rangeDays = ui.range || "14";
    const days = rangeDays === "all"
      ? (() => {
          const scopedSessions = filterBySubject(store, store.state.sessions, (s) => s.subjectId);
          const first = scopedSessions.reduce((a, s) => (!a || s.dateISO < a ? s.dateISO : a), null);
          const start = first || today;
          const n = Math.min(400, Math.max(1, diffDays(start, today) + 1));
          return Array.from({ length: n }, (_, i) => addDays(start, i));
        })()
      : Array.from({ length: Number(rangeDays) }, (_, i) => addDays(today, i - (Number(rangeDays) - 1)));

    const scopedSessions = filterBySubject(store, store.state.sessions, (s) => s.subjectId);
    const inRange = scopedSessions.filter((s) => s.dateISO >= days[0] && s.dateISO <= days[days.length - 1]);
    const rangeMin = sum(inRange, (s) => s.minutes);
    const activeDays = days.filter((d) => (time.byDate[d] || 0) > 0).length;
    const target = Number(store.state.settings.dailyTargetMin) || 0;

    const hasAny = scopedSessions.length > 0 || scopes.board.done > 0;

    if (!hasAny) {
      return sectionCard({
        title: "No data to analyse yet",
        body: emptyState({
          icon: "📈",
          title: "Analytics appear as soon as you log something",
          text: "Every chart here is computed from your own sessions, checklists and revisions — nothing is estimated or filled in.",
          action: `<a class="btn primary" href="#/timer">Log your first session</a><a class="btn" href="#/syllabus">Tick some items</a>`,
          mood: "curious",
        }),
      });
    }

    /* -------------------------------------------------------- insight metrics -- */
    let streak = 0, cursor = today;
    while ((time.byDate[cursor] || 0) > 0) { streak++; cursor = addDays(cursor, -1); }
    const consistency = days.length ? Math.round((activeDays / days.length) * 100) : 0;
    const boardLeaves = scopes.board.leaves;
    const boardPct = boardLeaves ? Math.round((scopes.board.done / boardLeaves) * 100) : 0;
    const avgSession = inRange.length ? Math.round(rangeMin / inRange.length) : 0;
    let peakDay = days[0], peakMin = time.byDate[days[0]] || 0;
    for (const d of days) { const v = time.byDate[d] || 0; if (v > peakMin) { peakMin = v; peakDay = d; } }
    const mid = Math.ceil(days.length / 2);
    const firstHalf = sum(days.slice(0, mid), (d) => time.byDate[d] || 0);
    const secondHalf = sum(days.slice(mid), (d) => time.byDate[d] || 0);
    const momentum = firstHalf ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;

    /* ------------------------------------------------------------ headline -- */
    const head = `<section class="card stripe" style="--stripe:var(--extra)">
      <div class="row wrap between gap-4">
        <div class="grow" style="min-width:250px">
          <div class="eyebrow">Analytics · Review</div>
          <h1 style="margin:6px 0">Progress &amp; time investment</h1>
          <p class="small muted" style="margin:0">All figures come from your saved records. Percentages always show the denominator they are computed from.</p>
        </div>
        <div class="btn-group" role="group" aria-label="Time range">
          ${[["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["60", "60 days"], ["all", "All time"]].map(([v, l]) =>
            `<button type="button" class="btn sm ${rangeDays === v ? "active" : ""}" data-act="range-set" data-range="${v}">${l}</button>`).join("")}
        </div>
      </div>
    </section>`;

    /* ---------------------------------------------------------- metrics -- */
    const metrics = `<div class="metrics">
      ${metricCard({ k: "Logged this range", v: esc(fmtDuration(rangeMin)), s: `${fmtShort(days[0])} → ${fmtShort(days[days.length - 1])}` })}
      ${metricCard({ k: "Active days", v: fmtNum(activeDays), s: `${consistency}% of days in range` })}
      ${metricCard({ k: "Current streak", v: `${fmtNum(streak)} days`, s: streak ? "Sessions every day up to today" : "No session today yet" })}
      ${metricCard({ k: "Average / session", v: esc(fmtDuration(avgSession)), s: `over ${fmtNum(inRange.length)} sessions` })}
      ${metricCard({ k: "Peak day", v: esc(fmtDuration(peakMin)), s: fmtShort(peakDay) })}
      ${metricCard({ k: "Board completion", v: `${boardPct}%`, s: `${p.scopes.board.done}/${boardLeaves} items`, tone: boardPct >= 80 ? "ok" : boardPct >= 40 ? "warn" : "bad" })}
      ${metricCard({ k: "Lifetime logged", v: esc(fmtDuration(time.total)), s: `${fmtNum(scopedSessions.length)} sessions` })}
      ${metricCard({ k: "Target hit rate", v: target ? `${Math.round((activeDays ? days.filter((d) => (time.byDate[d] || 0) >= target).length / days.length : 0) * 100)}%` : "—", s: target ? `days reaching ${esc(fmtDuration(target))}` : "set a daily target in Settings", href: "#/settings" })}
    </div>`;

    /* ------------------------------------------------- revision analytics -- */
    const visibleChapterIds = new Set(chapters.map((c) => c.id));
    const inSelection = (row) => !row.chapterId || visibleChapterIds.has(row.chapterId);
    const flashRows = (store.state.flashcardProgress || []).filter(inSelection);
    const questionRows = (store.state.questionAttempts || []).filter(inSelection);
    const fc = summariseFlashcards(flashRows, { since: days[0] });
    const pq = summariseQuestions(questionRows, { since: days[0] });

    const dailyFrom = (byDate) => {
      const raw = days.map((iso) => ({
        label: iso,
        short: rangeDays === "all" ? iso.slice(5) : iso.slice(8),
        value: byDate[iso] || 0,
      }));
      return days.length > 60 ? weekBuckets(days, byDate) : raw;
    };

    const flashcardsCard = sectionCard({
      title: "Flashcards",
      subtitle: "Cards reviewed, review volume and retention from your saved progress",
      actions: `<a class="btn sm ghost" href="#/revision">Open Revision Centre →</a>`,
      body: fc.reviewed
        ? `<div class="grid-2">
            <div class="metric"><div class="k">Cards reviewed</div><div class="v">${fmtNum(fc.reviewed)}</div><div class="s">distinct cards</div></div>
            <div class="metric"><div class="k">Reviews logged</div><div class="v">${fmtNum(fc.reviews)}</div><div class="s">all-time repetitions</div></div>
            <div class="metric"><div class="k">Mastered</div><div class="v">${fmtNum(fc.mastered)}</div><div class="s">${fmtNum(fc.mastery)}% of reviewed cards</div></div>
            <div class="metric"><div class="k">Retention</div><div class="v">${fmtNum(fc.accuracy)}%</div><div class="s">correct answers ÷ reviews</div></div>
          </div>
          <div class="row between small mt-4"><span class="strong">Learning progress</span><span class="faint">${fmtNum(fc.mastered)} mastered · ${fmtNum(Math.max(0, fc.reviewed - fc.mastered))} still learning · ${fmtNum(fc.due)} due now</span></div>
          <div class="mt-2">${bar(fc.mastery, { cls: fc.mastery >= 70 ? "ok" : fc.mastery >= 30 ? "warn" : "bad" })}</div>
          <div class="grid-2 card-pair mt-4">
            <div>${donut({
              segments: [
                { label: "Mastered", value: fc.mastered, color: "var(--ok)" },
                { label: "Still learning", value: Math.max(0, fc.reviewed - fc.mastered), color: "var(--warn)" },
              ],
              center: `${fmtNum(fc.mastery)}%`, sub: "mastery", size: 180, thickness: 26,
            })}${legend([
              { label: "Mastered", color: "var(--ok)", value: fmtNum(fc.mastered) },
              { label: "Still learning", color: "var(--warn)", value: fmtNum(Math.max(0, fc.reviewed - fc.mastered)) },
            ])}</div>
            <div>
              <div class="small strong mb-2">Reviews per day</div>
              ${barChart({ data: dailyFrom(fc.byDate), valueFormat: (v) => fmtNum(v), ariaLabel: "Flashcard reviews per day" })}
              <div class="card-note">A card contributes to the day it was last reviewed; ${fmtNum(fc.due)} card${fc.due === 1 ? "" : "s"} are due now.</div>
            </div>
          </div>`
        : emptyState({ icon: "▥", title: "No flashcards reviewed yet", text: "Study a deck in the Revision Centre and this panel fills with real review volume, retention and mastery.", action: `<a class="btn primary" href="#/revision">Open Revision Centre</a>` }),
    });

    const accuracyTone = pq.accuracy >= 75 ? "ok" : pq.accuracy >= 50 ? "warn" : "bad";
    const questionsCard = sectionCard({
      title: "Practice questions",
      subtitle: "Attempts, correct vs incorrect answers and accuracy from saved attempts",
      actions: `<a class="btn sm ghost" href="#/practice-questions">Practise →</a>`,
      body: pq.attempted
        ? `<div class="grid-2">
            <div class="metric"><div class="k">Attempted</div><div class="v">${fmtNum(pq.attempted)}</div><div class="s">distinct questions</div></div>
            <div class="metric"><div class="k">Correct</div><div class="v" style="color:var(--ok-ink)">${fmtNum(pq.correct)}</div><div class="s">answers right</div></div>
            <div class="metric"><div class="k">Incorrect</div><div class="v" style="color:var(--bad-ink)">${fmtNum(pq.incorrect)}</div><div class="s">${fmtNum(pq.unanswered)} marked for review</div></div>
            <div class="metric"><div class="k">Accuracy</div><div class="v">${fmtNum(pq.accuracy)}%</div><div class="s">correct ÷ attempted</div></div>
          </div>
          <div class="row between small mt-4"><span class="strong">Answer mix</span><span class="faint">${fmtNum(pq.correct)} correct · ${fmtNum(pq.incorrect)} incorrect · ${fmtNum(pq.unanswered)} unanswered</span></div>
          <div class="mt-2">${bar(pq.accuracy, { cls: accuracyTone })}</div>
          <div class="grid-2 card-pair mt-4">
            <div>${donut({
              segments: [
                { label: "Correct", value: pq.correct, color: "var(--ok)" },
                { label: "Incorrect", value: pq.incorrect, color: "var(--bad)" },
                { label: "Unanswered", value: pq.unanswered, color: "var(--surface-3)" },
              ],
              center: `${fmtNum(pq.accuracy)}%`, sub: "accuracy", size: 180, thickness: 26,
            })}${legend([
              { label: "Correct", color: "var(--ok)", value: fmtNum(pq.correct) },
              { label: "Incorrect", color: "var(--bad)", value: fmtNum(pq.incorrect) },
              { label: "Unanswered", color: "var(--surface-3)", value: fmtNum(pq.unanswered) },
            ])}</div>
            <div>
              <div class="small strong mb-2">Practice activity</div>
              ${barChart({ data: dailyFrom(pq.byDate), valueFormat: (v) => fmtNum(v), ariaLabel: "Practice questions attempted per day" })}
              <div class="card-note">The compact store keeps the latest attempt per question, so this counts distinct questions answered.</div>
            </div>
          </div>`
        : emptyState({ icon: "?", title: "No practice attempts yet", text: "Answer a few practice questions and this panel will show your accuracy, answer mix and daily activity.", action: `<a class="btn primary" href="#/practice-questions">Start practising</a>` }),
    });

    /* ---------------------------------------------------------- insights -- */
    const insights = [];
    if (momentum > 15) insights.push({ cls: "ok", text: `Study time is up ${momentum}% compared with the first half of this range — keep the rhythm.` });
    else if (momentum < -15) insights.push({ cls: "warn", text: `Study time is down ${Math.abs(momentum)}% compared with the first half of this range.` });
    const boardChapters = chapters.filter((c) => (c.scope || "board") === "board");
    const overdueHi = boardChapters.filter((c) => c.priority === "P1" && p.chapters[c.id]?.deadlineStatus === "overdue");
    if (overdueHi.length) insights.push({ cls: "bad", text: `${overdueHi.length} high-priority (P1) chapter${overdueHi.length > 1 ? "s" : ""} past their deadline: ${overdueHi.slice(0, 3).map((c) => esc(c.name)).join(", ")}.` });
    const notStarted = boardChapters.filter((c) => p.chapters[c.id]?.done === 0);
    if (notStarted.length) insights.push({ cls: "warn", text: `${notStarted.length} board chapter${notStarted.length > 1 ? "s" : ""} not started at all.` });
    const dueCount = boardChapters.filter((c) => { const st = p.chapters[c.id]; return st && st.done === st.leaves && st.leaves > 0 && st.passes === 0; }).length;
    const scopedNotes = filterBySubject(store, store.state.notes, (n) => n.subjectId);
    const openDoubts = scopedNotes.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved").length;
    if (dueCount) insights.push({ cls: "warn", text: `${dueCount} finished chapter${dueCount > 1 ? "s" : ""} have never been revised. The first revision is the highest-value revision.` });
    if (openDoubts) insights.push({ cls: "info", text: `${openDoubts} unresolved doubt${openDoubts > 1 ? "s" : ""} — clear them before they pile up.` });
    if (time.longVsEstimate.length) insights.push({ cls: "info", text: `${time.longVsEstimate.length} item${time.longVsEstimate.length > 1 ? "s" : ""} ran over estimate; the biggest overrun is ${esc(time.longVsEstimate[0].name)} (+${esc(fmtDuration(time.longVsEstimate[0].over))}).` });
    if (activeDays === 0) insights.push({ cls: "info", text: "No sessions logged in this range — that is data too. Either you are resting deliberately, or the timer is not being used." });

    const insightsCard = sectionCard({
      title: "Actionable insights",
      subtitle: "Generated from the current numbers, in plain language",
      body: insights.length
        ? `<div class="stack gap-2">${insights.map((i) => `<div class="callout ${i.cls}">${i.text}</div>`).join("")}</div>`
        : `<p class="small muted">Nothing to flag right now.</p>`,
    });

    /* -------------------------------------------------------------- charts -- */
    const plotDays = days.length > 60 ? weekBuckets(days, time.byDate) : days.map((iso) => ({
      label: iso,
      short: rangeDays === "all" ? iso.slice(5) : iso.slice(8),
      value: time.byDate[iso] || 0,
      colorClass: (iso === today || (target && (time.byDate[iso] || 0) >= target)) ? "bar-ok" : "",
    }));

    const timeChart = sectionCard({
      title: "Study time per day",
      subtitle: `Minutes logged each day · dashed line is your ${esc(fmtDuration(target))} target · today is highlighted`,
      body: barChart({
        data: plotDays,
        goal: target || null,
        valueFormat: (v) => `${Math.round(v)}m`,
        ariaLabel: "Minutes studied per day",
      }) + `<div class="card-note">${days.length > 60 ? "View shows weekly totals so long ranges stay readable." : "Gaps are real rest days, not missing data."}</div>`,
    });

    const cumulative = (() => {
      const doneLeaves = [];
      for (const c of chapters) {
        const kids = store.nodesOf(c.id);
        if (!kids.length) { if (c.done && c.doneAt) doneLeaves.push(c.doneAt); }
        else for (const n of kids) { const hasKids = store.childNodes(n.id).length; if (!hasKids && n.done && n.doneAt) doneLeaves.push(n.doneAt); }
      }
      if (!doneLeaves.length) return "";
      const first = doneLeaves.reduce((a, b) => (a < b ? a : b));
      const span = first ? Math.min(180, Math.max(7, diffDays(first, today) + 1)) : 7;
      const pts = Array.from({ length: span }, (_, i) => {
        const iso = addDays(first, i);
        const count = doneLeaves.filter((d) => d <= (iso || "")).length;
        return { label: iso, short: iso ? iso.slice(5) : "", value: count };
      });
      return sectionCard({
        title: "Checklist items completed over time",
        subtitle: `Cumulative ticked items, from your first completion (${esc(first)}) to today`,
        body: lineChart({ points: pts, valueFormat: (v) => fmtNum(v), ariaLabel: "Cumulative completed items over time" }),
      });
    })();

    const subjectRows = p.subjects.filter((s) => isVisibleSubject(store, s.id) && ((time.bySubject[s.id] || 0) > 0 || s.scopes.board.leaves > 0))
      .map((s) => subjectProgressRow(s, time.bySubject)).join("");
    const bySubject = sectionCard({
      title: "Where the time went",
      subtitle: "Logged minutes per subject, next to board-scope completion",
      body: subjectRows
        ? `<div class="stack gap-2">${subjectRows}</div>`
        : `<p class="small muted">No subjects have logged time yet.</p>` +
        `<div class="card-note mt-4">Minutes come from your sessions; percentages are board-scope checklist completion, not a share of time.</div>`,
    });

    const byActivity = sectionCard({
      title: "Initial learning vs practice vs revision",
      subtitle: "Minutes by activity type, from the session records",
      body: (() => {
        const entries = Object.entries(time.byActivity).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return `<p class="small muted">No sessions in range.</p>`;
        return donut({
          segments: entries.map(([k, v]) => ({ label: ACTIVITY_LABEL[k] || k, value: v, color: ACTIVITY_COLOR[k] || "var(--accent)" })),
          center: esc(fmtDuration(time.total)), sub: "lifetime", size: 210, thickness: 30,
        }) + legend(entries.map(([k, v]) => ({ label: ACTIVITY_LABEL[k] || k, color: ACTIVITY_COLOR[k], value: fmtDuration(v) })));
      })(),
    });

    /* ------------------------------------------------------------ progress -- */
    const progressChart = sectionCard({
      title: "Board progress by subject",
      subtitle: "Ticked board-scope items ÷ all board-scope items",
      body: hBars({
        data: subjects.map((s) => { const ps = p.subjects.find((x) => x.id === s.id); return { label: s.short || s.name, value: ps?.scopes.board.done || 0, pct: ps?.scopes.board.pct || 0, color: s.color }; }),
        max: Math.max(1, ...subjects.map((s) => { const ps = p.subjects.find((x) => x.id === s.id); return ps?.scopes.board.leaves || 0; })),
        valueFormat: (v) => `${fmtNum(v)} items`, showPct: true,
      }),
    });

    const chapterBands = sectionCard({
      title: "Chapter completion bands",
      subtitle: `${boardChapters.length} board-assessed chapters`,
      body: (() => {
        const bands = [
          { label: "Complete (100%)", color: "var(--ok)", test: (x) => x.pct === 100 && x.leaves > 0 },
          { label: "Started (1–99%)", color: "var(--warn)", test: (x) => x.pct > 0 && x.pct < 100 },
          { label: "Not started", color: "var(--bad)", test: (x) => x.pct === 0 },
        ];
        const stats = bands.map((b) => ({ ...b, value: boardChapters.filter((c) => b.test(p.chapters[c.id])).length }));
        return donut({ segments: stats.map((s) => ({ label: s.label, value: s.value, color: s.color })), center: fmtNum(stats[0].value), sub: "chapters complete", size: 210, thickness: 30 })
          + legend(stats.map((s) => ({ label: s.label, color: s.color, value: s.value })));
      })(),
    });

    const revStats = boardChapters.reduce((a, c) => {
      const st = p.chapters[c.id];
      if (st && st.done === st.leaves && st.leaves > 0) {
        a.done += 1;
        if ((st.passes || 0) >= 1) a.rev1 += 1;
        if ((st.passes || 0) >= 2) a.rev2 += 1;
      }
      return a;
    }, { done: 0, rev1: 0, rev2: 0 });
    const rev1Pct = revStats.done ? (revStats.rev1 / revStats.done) * 100 : 0;
    const revisionDist = sectionCard({
      title: "Revision status",
      subtitle: "Of the finished board chapters",
      body: (() => {
        if (!revStats.done) return `<p class="small muted">No chapter is fully finished yet — revision tracking starts after the first pass.</p>`;
        const segs = [
          { label: "Revised twice or more", color: "var(--accent)", value: revStats.rev2 },
          { label: "Revised once", color: "var(--warn)", value: Math.max(0, revStats.rev1 - revStats.rev2) },
          { label: "Never revised", color: "var(--bad)", value: Math.max(0, revStats.done - revStats.rev1) },
        ];
        return donut({ segments: segs, center: `${fmtNum(rev1Pct)}%`, sub: "revised at least once", size: 210, thickness: 30 }) + legend(segs.map((s) => ({ label: s.label, color: s.color, value: s.value })));
      })(),
    });

    /* ------------------------------------------------------------ tables --- */
    const weakest = sortBy(
      boardChapters.map((c) => ({ c, st: p.chapters[c.id] })),
      (x) => x.st.pct, 1
    ).filter((x) => x.st.leaves > 0).slice(0, 12);

    const weakestTable = sectionCard({
      title: "Lowest completion",
      subtitle: "Board chapters with the least done — the most useful list on this page",
      body: table(
        [{ label: "Chapter" }, { label: "Subject" }, { label: "Progress", cls: "num" }, { label: "Items" }, { label: "Priority" }, { label: "Deadline" }],
        weakest.map(({ c, st }) => [
          `<a href="#/chapter/${esc(c.id)}">${esc(c.name)}</a>`,
          esc(store.subject(c.subjectId)?.short || ""),
          meter(st.pct, { cls: st.pct === 100 ? "ok" : st.pct > 0 ? "warn" : "bad" }),
          `${st.done}/${st.leaves}`,
          esc(c.priority || "—"),
          st.deadline ? esc(st.deadline) : "—",
        ])
      ),
    });

    const mostTime = sortBy(
      chapters.map((c) => ({ c, st: p.chapters[c.id] })),
      (x) => x.st.minutes, -1
    ).filter((x) => x.st.minutes > 0).slice(0, 12);

    const mostTimeTable = sectionCard({
      title: "Time per chapter",
      subtitle: "Where the hours actually went",
      body: mostTime.length
        ? table(
            [{ label: "Chapter" }, { label: "Time", cls: "num" }, { label: "Progress", cls: "num" }, { label: "Estimate", cls: "num" }, { label: "Time / item", cls: "num" }],
            mostTime.map(({ c, st }) => {
              const est = chapterEstimate(c, store.state.nodes);
              return [
                `<a href="#/chapter/${esc(c.id)}">${esc(c.name)}</a>`,
                esc(fmtDuration(st.minutes)),
                `${fmtNum(st.pct)}%`,
                esc(fmtDuration(est)),
                st.done ? esc(fmtDuration(Math.round(st.minutes / st.done))) : "—",
              ];
            })
          )
        : `<p class="small muted">No chapter has logged time yet.</p>`,
    });

    const overruns = sectionCard({
      title: "Overrunning their estimate",
      subtitle: "Items and chapters that have taken longer than planned — a signal to fix the estimate, not the study",
      body: time.longVsEstimate.length
        ? table(
            [{ label: "Item" }, { label: "Estimated", cls: "num" }, { label: "Actual", cls: "num" }, { label: "Over", cls: "num" }],
            time.longVsEstimate.slice(0, 12).map((x) => [
              x.chapterId && x.id !== x.chapterId ? `<a href="#/chapter/${esc(x.chapterId)}">${esc(x.name)}</a> <span class="xs faint">(item)</span>` : `<a href="#/chapter/${esc(x.id)}">${esc(x.name)}</a>`,
              esc(fmtDuration(x.estMin)),
              esc(fmtDuration(x.actual)),
              `<span class="badge warn">+${esc(fmtDuration(x.over))}</span>`,
            ])
          )
        : `<p class="small muted">Nothing has overrun yet — either your estimates are good or you are still early on.</p>`,
    });

    const plannedVsActual = sectionCard({
      title: "Planned vs actually logged",
      subtitle: "Last 10 days · planned minutes come from the planner, logged minutes from sessions",
      body: table(
        [{ label: "Day" }, { label: "Planned", cls: "num" }, { label: "Logged", cls: "num" }, { label: "Difference", cls: "num" }, { label: "Tasks done" }],
        days.slice(-10).map((iso) => {
          const tasks = filterBySubject(store, store.plannerOn(iso), (t) => taskSubjectId(store, t));
          const planned = sum(tasks, (t) => t.estMin);
          const logged = time.byDate[iso] || 0;
          const diff = logged - planned;
          return [
            `<a href="#/planner/${esc(iso)}">${esc(fmtShort(iso))}</a>`,
            planned ? esc(fmtDuration(planned)) : "—",
            logged ? esc(fmtDuration(logged)) : "—",
            planned === 0 && logged === 0 ? "—" : `<span class="badge ${diff >= 0 ? "ok" : "warn"}">${diff >= 0 ? "+" : ""}${esc(fmtDuration(Math.abs(diff)))}</span>`,
            tasks.length ? `${tasks.filter((t) => t.done).length}/${tasks.length}` : "—",
          ];
        })
      ),
    });

    /* --------------------------------------------------------- manageability */
    const manage = (() => {
      let remainingMin = 0, remainingItems = 0;
      for (const c of boardChapters) {
        const st = p.chapters[c.id];
        if (!st || st.done >= st.leaves) continue;
        const est = chapterEstimate(c, store.state.nodes);
        const share = st.leaves ? (st.leaves - st.done) / st.leaves : 1;
        remainingMin += est * share;
        remainingItems += st.leaves - st.done;
      }
      const daysToTarget = store.state.settings.targetDate ? diffDays(today, store.state.settings.targetDate) : null;
      const capacityPerDay = target || 0;
      const daysNeeded = capacityPerDay ? Math.ceil(remainingMin / capacityPerDay) : null;
      const verdict = daysNeeded === null || daysToTarget === null
        ? null
        : daysNeeded <= daysToTarget * 0.8 ? { cls: "ok", text: "Comfortably manageable — you have room for revision and mocks." }
        : daysNeeded <= daysToTarget ? { cls: "warn", text: "Tight but feasible if you keep the daily target. Protect revision time." }
        : { cls: "bad", text: "Not manageable at the current target — raise the daily target or cut lower-priority work (see the contingency ladder)." };

      return sectionCard({
        title: "Is the remaining workload manageable?",
        subtitle: "Estimate-based, using each chapter's own item estimates (fallback 30 min per unfinished chapter)",
        body: `<div class="grid-3">
          <div class="metric"><div class="k">Unfinished board items</div><div class="v">${fmtNum(remainingItems)}</div><div class="s">of ${fmtNum(scopes.board.leaves)}</div></div>
          <div class="metric"><div class="k">Estimated work left</div><div class="v">${esc(fmtDuration(Math.round(remainingMin)))}</div><div class="s">first pass only</div></div>
          <div class="metric"><div class="k">Days needed at target</div><div class="v">${daysNeeded === null ? "—" : fmtNum(daysNeeded)}</div><div class="s">${capacityPerDay ? `at ${esc(fmtDuration(capacityPerDay))}/day` : "no daily target set"}</div></div>
        </div>
        ${verdict ? `<div class="callout ${verdict.cls} mt-4"><b>${daysNeeded} days</b> of work left vs <b>${daysToTarget} days</b> until ${esc(store.state.settings.targetDate)}. ${esc(verdict.text)}</div>` : `<div class="callout info mt-4">Set a daily target and an exam date in <a href="#/settings">Settings</a> to get a manageability verdict.</div>`}
        <div class="card-note">Estimate only: it excludes revision rounds and mock tests. A realistic plan keeps ~30% of your time for revision.</div>`,
      });
    })();

    return [head, metrics, insightsCard,
      `<div class="grid-2 card-pair">${timeChart}${cumulative}</div>`,
      `<div class="grid-2 card-pair">${bySubject}${byActivity}</div>`,
      `<div class="grid-2 card-pair">${flashcardsCard}${questionsCard}</div>`,
      progressChart,
      `<div class="grid-2 card-pair">${chapterBands}${revisionDist}</div>`,
      weakestTable, mostTimeTable, overruns, plannedVsActual, manage].join("");
  },
};
