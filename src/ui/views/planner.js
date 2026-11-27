import { esc, fmtNum, sum } from "../dom.js?v=mwz1qwqk";
import { bar, emptyState, metricCard, sectionCard, subjectMark, priorityChip, iconBtn } from "../components.js?v=mwz1qwqk";
import { addDays, fmtDuration, fmtShort, weekdayName, diffDays, weekDates, relative } from "../../core/dates.js?v=mwz1qwqk";
import {
  currentSelection, scopedTime, filterBySubject, taskSubjectId,
} from "../selection.js?v=mwz1qwqk";

export default {
  id: "planner",
  title: "Daily Planner",
  render(ctx) {
    const { store, ui, today } = ctx;
    const date = ctx.params[0] && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params[0]) ? ctx.params[0] : today;
    const selection = currentSelection(store);
    const time = scopedTime(store);
    const tasks = filterBySubject(store, store.plannerOn(date), (t) => taskSubjectId(store, t));
    const settings = store.state.settings;
    const target = Number(settings.dailyTargetMin) || 0;
    const plannedMin = sum(tasks, (t) => t.estMin);
    const openTasks = tasks.filter((t) => !t.done);
    const openMin = sum(openTasks, (t) => t.estMin);
    const doneMin = sum(tasks.filter((t) => t.done), (t) => t.estMin);
    const logged = time.byDate[date] || 0;
    const overload = target > 0 && openMin > target;
    const overBy = Math.max(0, openMin - target);
    const overdueCarry = filterBySubject(store, store.state.planner, (t) => taskSubjectId(store, t))
      .filter((t) => !t.done && t.dateISO < date)
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

    /* ------------------------------------------------------------ day head -- */
    const head = `<section class="card stripe" style="--stripe:var(--accent-2)">
      <div class="row wrap between gap-4">
        <div>
          <div class="eyebrow">${esc(weekdayName(date))}${date === today ? " · Today" : ""}${diffDays(today, date) < 0 ? " · Past" : diffDays(today, date) > 0 ? " · Future" : ""}</div>
          <h1 style="margin:2px 0 0">${esc(fmtShort(date))}</h1>
          <div class="small muted">${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${esc(fmtDuration(plannedMin))} planned · ${esc(fmtDuration(logged))} logged${selection ? " · your subjects only" : ""}</div>
        </div>
        <div class="row wrap gap-2">
          <a class="btn sm" href="#/planner/${esc(addDays(date, -1))}" aria-label="Previous day">←</a>
          <a class="btn sm" href="#/planner/${esc(today)}">Today</a>
          <a class="btn sm" href="#/planner/${esc(addDays(date, 1))}" aria-label="Next day">→</a>
          <input type="date" class="input" style="width:auto" value="${esc(date)}" data-act="planner-goto" aria-label="Jump to date">
        </div>
      </div>
      ${tasks.length ? `<div class="row wrap gap-2 mt-3">
        <span class="chip ${openTasks.length === 0 ? "ok" : "soft"}">${openTasks.length === 0 ? "✓ every task done" : `${openTasks.length} open`}</span>
        <span class="chip plain">${tasks.length - openTasks.length}/${tasks.length} ticked</span>
        ${openMin ? `<span class="chip warn">${esc(fmtDuration(openMin))} left</span>` : ""}
      </div>` : ""}
      <div class="mt-4 stack gap-3" style="max-width:640px">
        <div>
          <div class="row between small"><span>Open work vs daily target</span><span class="strong">${esc(fmtDuration(openMin))} / ${target ? esc(fmtDuration(target)) : "no target"}</span></div>
          ${bar(target ? Math.min(100, (openMin / target) * 100) : (openMin ? 100 : 0), { cls: overload ? "bad" : openMin === 0 ? "ok" : "warn" })}
        </div>
        <div>
          <div class="row between small"><span>Actually logged</span><span class="strong">${esc(fmtDuration(logged))}</span></div>
          ${bar(target ? Math.min(100, (logged / target) * 100) : (logged ? 100 : 0), { cls: "ok" })}
        </div>
      </div>
      ${overload ? `<div class="callout warn mt-3">⚠️ This day is overloaded by <b>${esc(fmtDuration(overBy))}</b>. Lowest-priority moves first — usually the “Daily 20” style blocks, or anything with no deadline. <button class="btn sm mt-2" data-act="planner-move-open" data-date="${esc(date)}" data-target="${esc(addDays(date, 1))}">Move my lowest-priority tasks to ${esc(fmtShort(addDays(date, 1)))}</button></div>` : ""}
      ${tasks.length && openTasks.length === 0 ? `<div class="callout ok mt-3">✓ Every task on this day is done. If you studied, log the time in the <a href="#/timer">timer</a> — then close the book without guilt.</div>` : ""}
    </section>`;

    /* ---------------------------------------------------------- week strip -- */
    const week = weekDates(date).map((iso) => {
      const t = filterBySubject(store, store.plannerOn(iso), (x) => taskSubjectId(store, x));
      const open = t.filter((x) => !x.done);
      const mins = sum(t, (x) => x.estMin);
      const loggedM = time.byDate[iso] || 0;
      const isToday = iso === today;
      return `<a class="tile ${iso === date ? "today" : ""}" href="#/planner/${esc(iso)}" style="padding:var(--sp-3)">
        <div class="row between"><span class="xs strong">${esc(weekdayName(iso))}</span>${isToday ? `<span class="chip">today</span>` : ""}</div>
        <div class="strong">${esc(fmtShort(iso).replace(/ \d{4}$/, ""))}</div>
        <div class="xs muted">${open.length} open · ${esc(fmtDuration(mins))}</div>
        ${bar(target ? Math.min(100, (loggedM / target) * 100) : (loggedM ? 100 : 0), { thin: true, cls: "ok" })}
        <div class="xs faint">${esc(fmtDuration(loggedM))} logged</div>
      </a>`;
    }).join("");

    /* --------------------------------------------------------------- list -- */
    const listCard = sectionCard({
      title: "Plan for this day",
      subtitle: "Tick things off here, or track the time with the timer — the two are kept separate",
      actions: `<button class="btn sm primary" data-act="planner-add" data-date="${esc(date)}">＋ Task</button>
                ${overdueCarry.length ? `<button class="btn sm" data-act="planner-carry" data-date="${esc(date)}" data-from="${esc(addDays(date, -1))}">Pull yesterday's ${overdueCarry.length} unfinished</button>` : ""}`,
      body: tasks.length === 0
        ? emptyState({ icon: "🗓", title: "Nothing planned for this day", text: "Add a task, or pick one from the recommendations and it will land here.", action: `<button class="btn primary" data-act="planner-add" data-date="${esc(date)}">＋ Add a task</button>`, mood: "curious" })
        : `<div class="stack gap-2">${tasks.map((t) => {
            const ch = t.chapterId ? store.chapter(t.chapterId) : null;
            const subj = t.subjectId ? store.subject(t.subjectId) : (ch ? store.subject(ch.subjectId) : null);
            return `<div class="list-item flat" style="box-shadow:none;padding:var(--sp-3);${t.done ? "opacity:.62" : ""}">
              <label class="check ${t.done ? "done" : ""}">
                <input type="checkbox" ${t.done ? "checked" : ""} data-act="planner-toggle" data-id="${esc(t.id)}" aria-label="Complete ${esc(t.title)}">
                <span class="box"></span>
              </label>
              <div class="grow">
                <div class="row wrap gap-2">
                  <b style="${t.done ? "text-decoration:line-through" : ""}">${esc(t.title)}</b>
                  ${subj ? `<span class="chip soft">${subjectMark(subj, ";width:16px;height:16px;font-size:8px")} ${esc(subj.short)}</span>` : t.subjectLabel ? `<span class="chip plain">${esc(t.subjectLabel)}</span>` : ""}
                  ${priorityChip(t.priority)}
                  <span class="chip soft">≈${esc(fmtDuration(t.estMin))}</span>
                  ${t.slot ? `<span class="chip plain">${esc(t.slot)}</span>` : ""}
                  ${t.day ? `<span class="chip plain">plan day ${esc(t.day)}</span>` : ""}
                  ${t.movedFrom ? `<span class="chip warn" title="Rescheduled from ${esc(t.movedFrom)}">moved from ${esc(fmtShort(t.movedFrom))}</span>` : ""}
                  ${ch ? `<a class="chip acc" href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>` : ""}
                </div>
                ${t.task ? `<div class="small muted mt-2">${esc(t.task)}</div>` : ""}
                ${t.target ? `<div class="xs faint">Target output: ${esc(t.target)}</div>` : ""}
              </div>
              <div class="row gap-1">
                <button class="btn sm ghost" data-act="planner-move" data-id="${esc(t.id)}" data-date="${esc(addDays(date, 1))}" title="Move to tomorrow">→1d</button>
                ${iconBtn("planner-edit", t.id, "✎", "Edit task")}
                ${iconBtn("planner-delete", t.id, "🗑", "Delete task")}
              </div>
            </div>`;
          }).join("")}</div>`,
    });

    /* ----------------------------------------------------------- carry over -- */
    const carryCard = overdueCarry.length
      ? sectionCard({
          title: `Unfinished from previous days (${overdueCarry.length})`,
          subtitle: "Reschedule them deliberately — nothing moves on its own",
          actions: `<button class="btn sm" data-act="planner-carry" data-date="${esc(date)}" data-from="all">Move all to ${esc(fmtShort(date))}</button>`,
          body: `<div class="stack gap-2">${overdueCarry.slice(0, 12).map((t) => `<div class="row gap-3">
            <span class="chip bad">${esc(relative(t.dateISO, today))}</span>
            <span class="grow truncate">${esc(t.title)}</span>
            <span class="chip soft">${esc(fmtDuration(t.estMin))}</span>
            <button class="btn sm" data-act="planner-move" data-id="${esc(t.id)}" data-date="${esc(date)}">Bring here</button>
            <button class="btn sm ghost" data-act="planner-delete" data-id="${esc(t.id)}" title="Drop it">🗑</button>
          </div>`).join("")}</div>`,
        })
      : "";

    /* ------------------------------------------------------------- suggest -- */
    const rec = store.derived.recommendations;
    const suggestions = filterBySubject(store, rec.suggestions, (s) => s.subjectId);
    const suggestCard = sectionCard({
      title: "What should I study next?",
      subtitle: `From your data · ${esc(fmtDuration(rec.utilization.availableMin))} free today`,
      body: suggestions.length
        ? `<div class="suggest">${suggestions.slice(0, 5).map((s, i) => `<div class="suggest-item">
            <div class="row gap-3" style="align-items:flex-start">
              <div class="suggest-rank">${i + 1}</div>
              <div class="grow">
                <div class="row wrap gap-2"><b>${esc(s.title)}</b><span class="chip plain">${esc(s.type)}</span><span class="chip soft">≈${esc(fmtDuration(s.estMin))}</span></div>
                <div class="why">${s.signals.slice(0, 4).map((sig) => `<span class="chip plain">${sig.points >= 0 ? "＋" : "－"} ${esc(sig.label)}</span>`).join("")}</div>
              </div>
              <button class="btn sm primary" data-act="plan-quick-add" data-chapter="${esc(s.chapterId || "")}" data-title="${esc(s.title)}" data-est="${esc(s.estMin)}" data-date="${esc(date)}">Add</button>
            </div>
          </div>`).join("")}</div>`
        : `<p class="small muted">No recommendations yet — they appear once you have deadlines, plan items or started chapters.</p>`,
    });

    const stats = `<div class="metrics">
      ${metricCard({ k: "Open tasks", v: fmtNum(openTasks.length), s: esc(fmtDuration(openMin)) })}
      ${metricCard({ k: "Completed on this day", v: fmtNum(tasks.length - openTasks.length), s: esc(fmtDuration(doneMin)) })}
      ${metricCard({ k: "Logged", v: esc(fmtDuration(logged)), s: `${esc(pluralise(logged ? Math.max(1, filterBySubject(store, store.sessionsOn(date), (s) => s.subjectId).length) : 0, "session"))} on ${esc(fmtShort(date))}` })}
      ${metricCard({ k: "Unfinished before this day", v: fmtNum(overdueCarry.length), s: "waiting to be rescheduled", tone: overdueCarry.length ? "warn" : "ok" })}
    </div>`;

    return [head, stats, sectionCard({ title: "This week", body: `<div class="tiles">${week}</div>` }), listCard, carryCard, suggestCard].join("");
  },
};

function pluralise(n, one) { return `${n} ${n === 1 ? one : one + "s"}`; }
