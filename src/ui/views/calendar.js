import { esc, sum } from "../dom.js?v=mwz7i9p1";
import { bar, sectionCard, subjectMark } from "../components.js?v=mwz7i9p1";
import { fmtDuration, fmtShort, monthGrid, monthName, weekdayName } from "../../core/dates.js?v=mwz7i9p1";
import {
  scopedTime, filterBySubject, taskSubjectId, isVisibleSubject,
} from "../selection.js?v=mwz7i9p1";
import { getExams } from "../../core/boardExams.js?v=mwz7i9p1";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default {
  id: "calendar",
  title: "Calendar",
  render(ctx) {
    const { store, ui, today } = ctx;
    const anchor = ui.calMonth && /^\d{4}-\d{2}$/.test(ui.calMonth) ? ui.calMonth : today.slice(0, 7);
    const [y, m] = anchor.split("-").map(Number);
    const grid = monthGrid(y, m - 1);
    const selected = ui.calSelected || today;
    const time = scopedTime(store);
    const exams = getExams();

    const dayInfo = (iso) => {
      const tasks = filterBySubject(store, store.plannerOn(iso), (t) => taskSubjectId(store, t));
      const open = tasks.filter((t) => !t.done);
      const mins = sum(tasks, (t) => t.estMin);
      const logged = time.byDate[iso] || 0;
      const deadlines = store.allDeadlines().filter((x) => x.deadline === iso && isVisibleSubject(store, x.subjectId));
      const sessions = filterBySubject(store, store.sessionsOn(iso), (s) => s.subjectId);
      const dayExams = exams.filter((e) => e.exam_date === iso);
      return { tasks, open, mins, logged, deadlines, sessions, dayExams };
    };

    const allPlanner = filterBySubject(store, store.state.planner, (t) => taskSubjectId(store, t));
    const totalOpen = allPlanner.filter((t) => !t.done).length;
    const allSessions = filterBySubject(store, store.state.sessions, (s) => s.subjectId);

    const head = `<section class="card">
      <div class="row wrap between gap-4">
        <div>
          <div class="xs strong muted" style="letter-spacing:.16em;text-transform:uppercase">Schedule & deadlines</div>
          <h1 style="margin:2px 0 0">${esc(monthName(m - 1))} ${y}</h1>
          <div class="small muted">${esc(pluralise(totalOpen, "open task"))} in the planner · ${esc(pluralise(allSessions.length, "session"))} logged in total</div>
        </div>
        <div class="row wrap gap-2">
          <button class="btn sm" data-act="cal-nav" data-month="${esc(shiftMonth(anchor, -1))}">← Prev</button>
          <button class="btn sm" data-act="cal-nav" data-month="${esc(today.slice(0, 7))}">This month</button>
          <button class="btn sm" data-act="cal-nav" data-month="${esc(shiftMonth(anchor, 1))}">Next →</button>
        </div>
      </div>
    </section>`;

    const cal = `<section class="card">
      <div class="cal">${DOW.map((d) => `<div class="cal-head">${d}</div>`).join("")}
        ${grid.map((iso) => {
          if (!iso) return `<div class="cal-cell out"></div>`;
          const info = dayInfo(iso);
          const isToday = iso === today;
          const isSel = iso === selected;
          const events = [
            ...info.deadlines.map((d) => ({ label: d.name, color: "var(--bad)", kind: "deadline" })),
            ...info.tasks.map((t) => ({ label: t.title, color: t.done ? "var(--ok)" : "var(--accent)", kind: "task" })),
            ...info.dayExams.map((e) => ({ label: `📝 ${e.subject_name}`, color: "var(--bad)", kind: "exam" })),
          ].slice(0, 3);
          return `<button type="button" class="cal-cell ${isToday ? "today" : ""} ${isSel ? "sel" : ""}" data-act="cal-select" data-date="${esc(iso)}" aria-label="${esc(fmtShort(iso))}: ${info.open.length} open tasks, ${esc(fmtDuration(info.logged))} logged">
            <div class="row between"><span class="dnum">${Number(iso.slice(8))}</span>${info.logged ? `<span class="xs faint">${esc(fmtDuration(info.logged))}</span>` : ""}</div>
            ${events.map((e) => `<div class="ev"><span class="dot" style="background:${e.color}"></span><span class="truncate">${esc(e.label)}</span></div>`).join("")}
            ${info.tasks.length + info.deadlines.length + info.dayExams.length > 3 ? `<div class="more">+${info.tasks.length + info.deadlines.length + info.dayExams.length - 3} more</div>` : ""}
            ${info.logged ? `<div class="mt-2">${bar(Math.min(100, (info.logged / (Number(store.state.settings.dailyTargetMin) || 240)) * 100), { thin: true, cls: "ok" })}</div>` : ""}
          </button>`;
        }).join("")}
      </div>
      <div class="chart-legend mt-3">
        <span class="item"><span class="swatch" style="background:var(--bad)"></span>Deadline</span>
        <span class="item"><span class="swatch" style="background:var(--accent)"></span>Planned task</span>
        <span class="item"><span class="swatch" style="background:var(--ok)"></span>Completed task</span>
        <span class="item"><span class="swatch" style="background:var(--bad)"></span>Board exam</span>
      </div>
    </section>`;

    const info = dayInfo(selected);
    const detail = sectionCard({
      title: fmtShort(selected),
      subtitle: `${esc(weekdayName(selected))} · ${info.open.length} open · ${esc(fmtDuration(info.mins))} planned · ${esc(fmtDuration(info.logged))} logged`,
      actions: `<button class="btn sm primary" data-act="planner-add" data-date="${esc(selected)}">＋ Task on this day</button>
                <a class="btn sm" href="#/planner/${esc(selected)}">Open in planner</a>`,
      body: `<div class="stack gap-3">
        ${info.deadlines.length ? `<div><div class="xs strong muted">Deadlines</div>${info.deadlines.map((d) => {
          const ch = d.type === "chapter" ? store.chapter(d.id) : null;
          return `<div class="stat-line">${ch ? `<a href="#/chapter/${esc(ch.id)}">${esc(d.name)}</a>` : esc(d.name)}<span class="chip bad">due this day</span></div>`;
        }).join("")}</div>` : ""}
        ${info.dayExams.length ? `<div><div class="xs strong muted">Board exams today</div>${info.dayExams.map((e) => `<div class="stat-line">${esc(e.subject_name)} (${esc(e.subject_code)})<span class="chip bad">${esc(e.start_time)}–${esc(e.end_time)} IST</span></div>`).join("")}</div>` : ""}
        ${info.tasks.length ? `<div><div class="xs strong muted">Planned</div>${info.tasks.map((t) => `<div class="row gap-2" style="padding:5px 0">
            <label class="check ${t.done ? "done" : ""}"><input type="checkbox" ${t.done ? "checked" : ""} data-act="planner-toggle" data-id="${esc(t.id)}"><span class="box"></span><span class="label-text small">${esc(t.title)}</span></label>
            <span class="grow"></span><span class="chip soft">${esc(fmtDuration(t.estMin))}</span>
          </div>`).join("")}</div>` : `<p class="small muted">Nothing planned.</p>`}
        ${info.sessions.length ? `<div><div class="xs strong muted">Logged study time</div>${info.sessions.map((s) => {
          const subj = s.subjectId ? store.subject(s.subjectId) : null;
          const ch = s.chapterId ? store.chapter(s.chapterId) : null;
          return `<div class="stat-line"><span>${subj ? `${subjectMark(subj, ";width:16px;height:16px;font-size:8px")} ` : ""}${ch ? `<a href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>` : esc(s.activity)}</span><b>${esc(fmtDuration(s.minutes))}</b></div>`;
        }).join("")}</div>` : ""}
        ${!info.tasks.length && !info.sessions.length && !info.deadlines.length ? `<p class="small muted">Nothing scheduled and nothing logged. A rest day is legitimate — but say so deliberately.</p>` : ""}
      </div>`,
    });

    return [head, cal, detail].join("");
  },
};

export function shiftMonth(anchor, delta) {
  const [y, m] = anchor.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pluralise(n, one) { return `${n} ${n === 1 ? one : one + "s"}`; }
