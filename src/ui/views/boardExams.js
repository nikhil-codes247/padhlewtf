/**
 * boardExams.js — Board Exam Countdown & Date Sheet view.
 *
 * Route: #/board-exams
 *
 * A creative, student-first feature that brings the official CBSE date sheet
 * into the app's daily workflow:
 *
 *   · Hero countdown to the next board paper (days, subject, date, time)
 *   · "Today is your exam!" alert when an exam falls on the current day
 *   · Full date sheet with days-remaining countdown per exam
 *   · Subject-chapter progress integrated — see how much of each examined
 *     subject you've finished before the paper
 *   · One-click "Plan revision" — creates planner tasks working backwards
 *     from each exam day (3 days before, 1 day before, exam eve)
 *   · Filter to show only your selected subjects or all board papers
 *   · CBSE circular info, general instructions and announcements
 *
 * Everything is pure HTML strings from data; interaction is via `data-act`.
 */

import { esc } from "../dom.js?v=mwz1jos9";
import { bar, chip } from "../components.js?v=mwz1jos9";
import { fmtShort, addDays } from "../../core/dates.js?v=mwz1jos9";
import { currentSelection } from "../selection.js?v=mwz1jos9";
import {
  getExams, getNextExam, getExamsForSelection,
  getCircular, getInstructions, getAnnouncements, getStats,
  EXAM_SCHEDULE_DATA,
} from "../../core/boardExams.js?v=mwz1jos9";


function progressForSubject(store, subjectId) {
  const s = store.subject(subjectId);
  if (!s) return null;
  const chs = store.chaptersOf(subjectId);
  if (!chs.length) return null;
  let done = 0, leaves = 0;
  for (const c of chs) {
    const st = store.progressOf(c.id);
    leaves += st?.leaves || 0;
    done += st?.done || 0;
  }
  return leaves ? { pct: Math.round((done / leaves) * 100), done, leaves } : null;
}

function revisionPlanDates(examDate) {
  // Create revision tasks at: exam-3, exam-1
  const d3 = addDays(examDate, -3);
  const d1 = addDays(examDate, -1);
  return [
    { dateISO: d3, label: "Revise — 3 days before board paper", priority: "P2", estMin: 60 },
    { dateISO: d1, label: "Final revision — day before board paper", priority: "P1", estMin: 90 },
  ];
}

export default {
  id: "boardExams",
  title: "Board Exams",
  crumb: "Plan",

  render(ctx) {
    const { store, today } = ctx;
    const settings = store.state.settings;
    const selection = currentSelection(store);
    const selectedIds = selection ? [...selection.core, ...selection.optional] : null;
    const boardFilterOnly = ctx.ui.boardFilterOnly;
    let exams = getExams();
    if (boardFilterOnly && selectedIds) {
      exams = exams.filter((e) => e.subjectId && selectedIds.includes(e.subjectId));
    } else if (selectedIds && !boardFilterOnly) {
      exams = getExamsForSelection(selectedIds);
    }
    const next = getNextExam();

    // Today's exam alert
    const todaysExam = exams.find((e) => e.isToday);

    /* ---------------------------------------------------------------- hero --- */
    const hero = `
      <section class="card hero">
        <div class="row wrap between gap-5">
          <div class="stack gap-3 grow" style="min-width:250px">
            <div class="eyebrow">Next board paper</div>
            ${next ? `
              <div style="font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.1;letter-spacing:-0.02em">${next.daysUntil} days</div>
              <div class="hero-num">${esc(next.subject_name)}</div>
              <div class="small muted">${esc(fmtShort(next.exam_date))} · ${esc(next.day_of_week)} · ${esc(next.start_time)}–${esc(next.end_time)} IST</div>
              <div class="row wrap gap-2 mt-3">
                <a class="btn primary" href="#/board-exams" data-act="board-plan" data-exam="${esc(next.exam_id)}">Plan revision →</a>
                ${next.subjectId ? `<a class="btn ghost" href="#/subject/${esc(next.subjectId)}">Open subject</a>` : ""}
              </div>
            ` : `
              <div style="font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.1">—</div>
              <div class="hero-num">All done</div>
              <div class="small muted">No upcoming board papers found.</div>
            `}
          </div>
          <div class="stack gap-3" style="min-width:210px">
            <div class="stat-line"><span class="muted small">Exams remaining</span><b>${exams.filter((e) => e.isUpcoming).length}</b></div>
            <div class="stat-line"><span class="muted small">First paper</span><b>${exams.find((e) => e.isUpcoming)?.exam_date ? esc(fmtShort(exams.find((e) => e.isUpcoming).exam_date)) : "—"}</b></div>
            <div class="stat-line"><span class="muted small">Last paper</span><b>${exams.filter((e) => e.isUpcoming).pop()?.exam_date ? esc(fmtShort(exams.filter((e) => e.isUpcoming).pop().exam_date)) : "—"}</b></div>
          </div>
        </div>
      </section>
    `;

    /* ------------------------------------------------- today exam alert --- */
    const todayAlert = todaysExam ? `
      <section class="card stripe" style="--stripe:var(--bad)">
        <div class="row wrap gap-3">
          <div class="grow">
            <div class="row between gap-2 xs strong">📝 Today is your board exam</div>
            <div class="row gap-2">
              <span class="chip bad">${esc(todaysExam.subject_name)} (${esc(todaysExam.subject_code)})</span>
              <span class="chip soft">${esc(fmtShort(todaysExam.exam_date))} · ${esc(todaysExam.day_of_week)}</span>
              <span class="chip soft">${esc(todaysExam.start_time)}–${esc(todaysExam.end_time)} IST · ${todaysExam.duration_minutes} min</span>
            </div>
            ${todaysExam.subject_specific_instructions?.length ? `<div class="mt-2 small muted">${esc(todaysExam.subject_specific_instructions.join("; "))}</div>` : ""}
          </div>
          <div class="row gap-2">
            <a class="btn danger" href="#/calendar">View in calendar</a>
            <a class="btn ghost" href="#/planner/${esc(today)}">Today's planner</a>
          </div>
        </div>
      </section>
    ` : "";

    /* ------------------------------------------------------ date sheet ---- */
    const upcoming = exams.filter((e) => e.isUpcoming);
    const past = exams.filter((e) => !e.isUpcoming && !e.isToday);

    const examRows = upcoming.map((e) => {
      const prog = e.subjectId ? progressForSubject(store, e.subjectId) : null;
      const inSelection = e.inSelection !== undefined ? e.inSelection : !selectedIds;
      const tone = e.daysUntil <= 7 ? "bad" : e.daysUntil <= 14 ? "warn" : "ok";
      // Bright fills for decoration, readable ink for the number itself.
      const toneInk = tone === "bad" ? "bad-ink" : tone === "warn" ? "warn-ink" : "ok-ink";
      const planDates = revisionPlanDates(e.exam_date);
      return `
        <div class="card tight exam-row mt-3" style="border-left:4px solid var(--${tone})">
          <div class="row between gap-3">
            <div class="grow">
              <div class="row wrap gap-2">
                <span class="chip ${tone}">${e.subject_name}</span>
                <span class="chip soft">${esc(e.subject_code)}</span>
                ${!inSelection ? `<span class="chip plain">Not in your selection</span>` : ""}
              </div>
              <div class="row gap-2 mt-1">
                <span class="small muted">${esc(fmtShort(e.exam_date))} · ${esc(e.day_of_week)}</span>
                <span class="small muted">${esc(e.start_time)}–${esc(e.end_time)} IST</span>
                <span class="small muted">${e.duration_minutes} min</span>
              </div>
              <div class="mt-2 stack gap-1">
                <div class="row between small">
                  <span>Days remaining</span>
                  <b style="color:var(--${toneInk});font-variant-numeric:tabular-nums">${e.daysUntil}</b>
                </div>
                ${prog ? `<div class="row between small"><span>Subject completion</span>${bar(prog.pct, { thin: true, cls: prog.pct >= 80 ? "ok" : prog.pct >= 40 ? "" : "warn" })}</div>` : ""}
                <div class="row between xs muted">
                  <span>${prog ? `${prog.done}/${prog.leaves}` : "—"} items</span>
                </div>
              </div>
            </div>
            <div class="row gap-2">
              ${inSelection
                ? `<button class="btn primary sm" data-act="board-plan" data-exam="${esc(e.exam_id)}" data-date="${esc(e.exam_date)}" data-subject="${esc(e.subjectId)}">Plan revision</button>`
                : `<a class="btn ghost sm" href="#/choose-subjects">Add subject</a>`}
              <a class="btn ghost sm" href="#/calendar">Calendar</a>
            </div>
          </div>
        </div>
      `;
    }).join("");

    const pastRows = past.map((e) => `
      <div class="card tight mt-2" style="opacity:0.6">
        <div class="row gap-3">
          <span class="chip ok">Done</span>
          <span class="grow small">${esc(e.subject_name)} (${esc(e.subject_code)}) · ${esc(fmtShort(e.exam_date))} · ${esc(e.day_of_week)}</span>
        </div>
      </div>
    `).join("");

    const dateSheet = `
      <section class="card">
        <div class="row between gap-4">
          <div>
            <div class="eyebrow">CBSE Class 10 Date Sheet — 2027</div>
            <h1 style="margin:2px 0 0">Board Exam Schedule</h1>
            <div class="small muted">${upcoming.length} upcoming · ${past.length} completed · ${EXAM_SCHEDULE_DATA?.metadata?.total_records || 0} total papers</div>
          </div>
          <div class="row gap-2">
            <button class="btn sm ${ctx.ui.boardFilterOnly ? "primary" : "ghost"}" data-act="board-filter">Only my subjects ${ctx.ui.boardFilterOnly ? "✓" : ""}</button>
            <button class="btn sm ${ctx.ui.boardFilterOnly ? "ghost" : "primary"}" data-act="board-filter">All papers</button>
          </div>
        </div>
        ${upcoming.length ? `<div class="stack gap-1">${examRows}</div>` : `<p class="small muted">No upcoming board papers.</p>`}
        ${past.length ? `<div class="mt-4 stack gap-1">${pastRows}</div>` : ""}
      </section>
    `;

    /* ------------------------------------------------------- revision plan -- */
    const planCard = selectedIds && upcoming.length ? `
      <section class="card">
        <div class="row between gap-4">
          <div>
            <div class="eyebrow">Smart revision planner</div>
            <h2 style="margin:2px 0 0">Plan revision before exams</h2>
            <div class="small muted">One-click creates planner tasks 3 days and 1 day before each of your selected exams.</div>
          </div>
        </div>
        <div class="row gap-2 mt-3">
          ${upcoming.slice(0, 4).map((e) => `
            <button class="btn primary sm" data-act="board-plan" data-exam="${esc(e.exam_id)}" data-date="${esc(e.exam_date)}" data-subject="${esc(e.subjectId || "")}">Plan: ${esc(e.subject_name)}</button>
          `).join("")}
          ${upcoming.length > 4 ? `<button class="btn ghost sm" data-act="board-plan-all">Plan all ${upcoming.length} exams</button>` : ""}
        </div>
        <div class="mt-3 small muted">
          Tasks created:<br>
          • <b>3 days before</b> — full revision (60 min)<br>
          • <b>1 day before</b> — final review (90 min)<br>
          All tasks carry the subject tag so they count toward your daily target.
        </div>
      </section>
    ` : "";

    /* --------------------------------------------------------- cbse info --- */
    const circular = getCircular();
    const instructions = getInstructions();
    const announcements = getAnnouncements();
    const stats = getStats();

    const cbseInfo = `
      <section class="card">
        <div class="row between gap-4">
          <div>
            <div class="eyebrow">CBSE circular</div>
            <h2 style="margin:2px 0 0">Date Sheet — Official Notice</h2>
          </div>
        </div>
        <div class="row gap-3 mt-3">
          <div class="grow">
            <div class="row wrap gap-2">
              <span class="chip soft">${esc(circular?.issuing_organisation || "CBSE")}</span>
              <span class="chip soft">${esc(circular?.circular_id || "")}</span>
              <span class="chip soft">Issued ${esc(circular?.issue_date || "")}</span>
            </div>
            <div class="mt-2 small">${esc(circular?.subject || "")}</div>
            ${stats ? `<div class="mt-2 small muted">${esc(stats.wording || "")}</div>` : ""}
          </div>
          <div>
            <div class="xs strong muted">Quick facts</div>
            <div class="stat-line"><span>Exams commence</span><span class="grow"></span><b>${esc(instructions?.examinations_commence_on || "")}</b></div>
            <div class="stat-line"><span>Class 10 last exam</span><span class="grow"></span><b>${esc(instructions?.class_10_last_exam_date || "")}</b></div>
            <div class="stat-line"><span>Common start time</span><span class="grow"></span><b>${esc(instructions?.common_start_time || "")} IST</b></div>
          </div>
        </div>
        <div class="mt-3">
          <div class="xs strong muted">General instructions</div>
          <div class="stack gap-1 small muted">
            ${(instructions?.general_instructions || []).map((gi) => `<div>• ${esc(gi.text)}</div>`).join("")}
          </div>
        </div>
        <div class="mt-3">
          <div class="xs strong muted">CBSE announcements</div>
          <div class="stack gap-1 small muted">
            ${(announcements || []).map((a) => `<div>“${esc(a.text)}”</div>`).join("")}
          </div>
        </div>
      </section>
    `;

    return [hero, todayAlert, dateSheet, planCard, cbseInfo].filter(Boolean).join("");
  },

  mount(ctx) {
    // nothing to wire up yet; all actions are delegated via data-act
  },
};

export const BoardExamActions = {
  "board-filter": (el, ctx) => {
    const only = el.textContent.includes("Only");
    ctx.ui.boardFilterOnly = only;
    ctx.rerender();
  },
  "board-plan": async (el, ctx) => {
    const { store } = ctx;
    const examId = el.dataset.exam;
    const examDate = el.dataset.date;
    const subjectId = el.dataset.subject || null;
    if (!examDate) return;
    const planDates = revisionPlanDates(examDate);
    for (const p of planDates) {
      try {
        await store.addPlannedTask({
          title: p.label,
          dateISO: p.dateISO,
          subjectId,
          estMin: p.estMin,
          priority: p.priority,
          task: `Revision for board exam ${esc(examId)}`,
        });
      } catch (err) {
        console.error("[boardExams] plan task failed", err);
      }
    }
    ctx.toast(`Revision tasks planned for ${esc(examId)}`, "ok");
    ctx.rerender();
  },
  "board-plan-all": async (el, ctx) => {
    const { store } = ctx;
    const upcoming = getExams().filter((e) => e.isUpcoming);
    let count = 0;
    for (const e of upcoming) {
      if (!e.subjectId) continue;
      const planDates = revisionPlanDates(e.exam_date);
      for (const p of planDates) {
        try {
          await store.addPlannedTask({
            title: p.label,
            dateISO: p.dateISO,
            subjectId: e.subjectId,
            estMin: p.estMin,
            priority: p.priority,
            task: `Revision for board exam ${esc(e.subject_name)}`,
          });
          count++;
        } catch (err) {
          console.error("[boardExams] plan task failed", err);
        }
      }
    }
    ctx.toast(`Planned revision for ${count} exam tasks`, "ok");
    ctx.rerender();
  },
};
