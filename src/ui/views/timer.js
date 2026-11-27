import { esc, fmtNum, sum } from "../dom.js?v=mwz1jos9";
import { bar, emptyState, metricCard, sectionCard, subjectMark } from "../components.js?v=mwz1jos9";
import { sessionRow } from "./_shared.js?v=mwz1jos9";
import { fmtDuration, fmtShort, addDays } from "../../core/dates.js?v=mwz1jos9";
import { ACTIVITIES } from "../../core/validate.js?v=mwz1jos9";
import { filterBySubject, visibleSubjects, isVisibleSubject, scopedTime } from "../selection.js?v=mwz1jos9";

export default {
  id: "timer",
  title: "Study Timer",
  render(ctx) {
    const { store, ui, today } = ctx;
    const t = store.state.settings.timer;
    const running = !!t.running;
    const paused = !!t.paused;
    const elapsedMs = store.timerElapsedMs();
    const elapsedMin = elapsedMs / 60000;

    const subjects = visibleSubjects(store);
    const subj = t.subjectId && isVisibleSubject(store, t.subjectId) ? store.subject(t.subjectId) : null;
    const ch = t.chapterId ? store.chapter(t.chapterId) : null;
    const node = t.nodeId ? store.node(t.nodeId) : null;
    const chapters = subj ? store.chaptersOf(subj.id) : [];
    const topics = ch ? store.nodesOf(ch.id) : [];
    const time = scopedTime(store);

    const blockMin = Number(ui.timerBlock) || (node?.estMin || ch?.estMin || 30);
    const ringPct = Math.max(0, Math.min(100, (elapsedMin / blockMin) * 100));

    const todaySessions = filterBySubject(store, store.sessionsOn(today), (s) => s.subjectId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const todayMin = sum(todaySessions, (s) => s.minutes);
    const weekMin = sum(filterBySubject(store, store.state.sessions.filter((s) => s.dateISO >= addDays(today, -6)), (s) => s.subjectId), (s) => s.minutes);
    const target = Number(store.state.settings.dailyTargetMin) || 0;

    /* ---------------------------------------------------------- timer face -- */
    const face = `<section class="card">
      <div class="card-title">
        <div><h2>${running ? (paused ? "Paused" : "Recording") : "Ready when you are"}</h2>
        <p class="small muted" style="margin:0">The timer writes a real session record when you stop it. It is not a decoration — nothing is saved unless you stop (or discard deliberately).</p></div>
        <div class="row gap-2">
          ${running ? `<button class="btn sm ghost" data-act="timer-discard">Discard</button>` : ""}
        </div>
      </div>
      <div class="row wrap gap-6" style="align-items:center;justify-content:center">
        <div class="timer-face grow" style="min-width:260px">
          <div class="timer-dial" data-timer-dial data-timer-block="${esc(blockMin)}" style="--p:${ringPct}" role="img" aria-label="Block progress ${Math.round(ringPct)} percent">
            <div class="timer-dial-inner">
              <div class="timer-state ${running && !paused ? "pulse" : ""}">${running ? (paused ? "paused" : "recording") : "idle"}</div>
              <div class="timer-clock" data-timer-clock>${esc(clock(elapsedMs))}</div>
              <div class="timer-dial-label" data-timer-ring-label>${Math.round(ringPct)}% of block</div>
            </div>
          </div>
          <div class="small muted">
            ${subj ? `${subjectMark(subj, ";width:20px;height:20px;font-size:9px")} ${esc(subj.short)}` : "no subject selected"}
            ${ch ? ` · <a href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>` : ""}${node ? ` › ${esc(node.name)}` : ""}
          </div>
          <div class="row wrap gap-2" style="justify-content:center">
            ${!running ? `<button class="btn primary" data-act="timer-start">▶ Start session</button>` : ""}
            ${running && !paused ? `<button class="btn" data-act="timer-pause">❙❙ Pause</button>` : ""}
            ${running && paused ? `<button class="btn primary" data-act="timer-resume">▶ Resume</button>` : ""}
            ${running ? `<button class="btn ok" data-act="timer-stop">■ Stop &amp; save</button>` : ""}
          </div>
        </div>
        <div class="stack gap-3" style="min-width:300px;max-width:420px">
          <div class="field">
            <label for="timer-subject">Subject</label>
            <select class="select" id="timer-subject" data-act="timer-target" data-field="subjectId">
              <option value="">— choose a subject —</option>
              ${subjects.map((s) => `<option value="${esc(s.id)}"${t.subjectId === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="timer-chapter">Chapter</label>
            <select class="select" id="timer-chapter" data-act="timer-target" data-field="chapterId" ${subj ? "" : "disabled"}>
              <option value="">— ${subj ? "choose a chapter" : "pick a subject first"} —</option>
              ${chapters.map((c) => `<option value="${esc(c.id)}"${t.chapterId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="timer-node">Topic / item (optional)</label>
            <select class="select" id="timer-node" data-act="timer-target" data-field="nodeId" ${ch ? "" : "disabled"}>
              <option value="">— ${ch ? "whole chapter" : "pick a chapter first"} —</option>
              ${topics.map((n) => `<option value="${esc(n.id)}"${t.nodeId === n.id ? " selected" : ""}>${esc(n.name)}</option>`).join("")}
            </select>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="timer-activity">Activity</label>
              <select class="select" id="timer-activity" data-act="timer-target" data-field="activity">
                ${ACTIVITIES.map((a) => `<option value="${esc(a.id)}"${t.activity === a.id ? " selected" : ""}>${esc(a.label)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="timer-block">Block length (min)</label>
              <input class="input" id="timer-block" type="number" min="5" max="240" step="5" value="${esc(blockMin)}" data-act="timer-block">
            </div>
          </div>
          <div class="field">
            <label for="timer-note">Session note (optional)</label>
            <input class="input" id="timer-note" type="text" placeholder="e.g. 12 MCQs, 3 silly mistakes" value="${esc(t.note || "")}" data-act="timer-note">
          </div>
          <div>
            <div class="row between small"><span>Block progress</span><span data-timer-block-label>${esc(fmtDuration(Math.round(elapsedMin)))} / ${esc(fmtDuration(blockMin))}</span></div>
            ${bar(ringPct, { cls: ringPct >= 100 ? "ok" : "" })}
          </div>
        </div>
      </div>
      ${running ? `<div class="callout info mt-4">Started ${esc(String(t.startedAt || "").slice(11, 16) || "just now")}${paused ? " and paused" : ""}. If you close the tab, the timer keeps its state and this page will show the right elapsed time when you come back.</div>` : ""}
    </section>`;

    /* ------------------------------------------------------------- today's --- */
    const stats = `<div class="metrics">
      ${metricCard({ k: "Logged today", v: esc(fmtDuration(todayMin)), s: target ? `${Math.round((todayMin / target) * 100)}% of ${esc(fmtDuration(target))} target` : "no target set", tone: todayMin >= target && target ? "ok" : "" })}
      ${metricCard({ k: "Sessions today", v: fmtNum(todaySessions.length), s: todaySessions.length ? `longest ${esc(fmtDuration(Math.max(...todaySessions.map((s) => s.minutes))))}` : "nothing yet" })}
      ${metricCard({ k: "This week", v: esc(fmtDuration(weekMin)), s: "last 7 days" })}
      ${metricCard({ k: "Lifetime", v: esc(fmtDuration(time.total)), s: esc(pluralise(filterBySubject(store, store.state.sessions, (s) => s.subjectId).length, "session")) })}
    </div>`;

    const logCard = sectionCard({
      title: "Today's sessions",
      subtitle: `${esc(fmtShort(today))} · every session is stored separately and can be edited or deleted`,
      actions: `<button class="btn sm primary" data-act="session-add">＋ Log time manually</button>`,
      body: todaySessions.length
        ? `<div>${todaySessions.map((s) => sessionRow(s, ctx)).join("")}</div>`
        : emptyState({ icon: "⏱", title: "No sessions logged today", text: "Start the timer above, or add a session by hand if you studied away from the screen.", action: `<button class="btn primary" data-act="timer-start">▶ Start the timer</button>`, mood: "ready" }),
    });

    const recent = sectionCard({
      title: "Recent sessions",
      subtitle: "Last 12 records for your subjects",
      actions: `<a class="btn sm ghost" href="#/analytics">Analytics</a>`,
      body: (() => {
        const list = filterBySubject(store, store.state.sessions, (s) => s.subjectId).sort((a, b) => String(b.dateISO + (b.createdAt || "")).localeCompare(String(a.dateISO + (a.createdAt || "")))).slice(0, 12);
        return list.length ? `<div>${list.map((s) => sessionRow(s, ctx)).join("")}</div>` : `<p class="small muted">Nothing logged yet.</p>`;
      })(),
    });

    return [face, stats, logCard, recent].join("");
  },

  mount(ctx) {
    // one interval updates only the clock text — no re-render, no focus loss
    const tick = () => {
      const el = document.querySelector("[data-timer-clock]");
      if (!el) return;
      const ms = ctx.store.timerElapsedMs();
      el.textContent = clock(ms);
      const lbl = document.querySelector("[data-timer-block-label]");
      const block = Number(ctx.ui.timerBlock) || 30;
      if (lbl) lbl.textContent = `${fmtDuration(Math.round(ms / 60000))} / ${fmtDuration(block)}`;
      // The dial around the clock fills in step with the block, using the same
      // block length the view rendered with (stored on the element itself).
      const dial = document.querySelector("[data-timer-dial]");
      if (dial) {
        const dialBlock = Number(dial.dataset.timerBlock) || block;
        const pct = Math.max(0, Math.min(100, (ms / 60000 / dialBlock) * 100));
        dial.style.setProperty("--p", String(pct));
        const ringLabel = dial.querySelector("[data-timer-ring-label]");
        if (ringLabel) ringLabel.textContent = `${Math.round(pct)}% of block`;
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  },
};

function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function pluralise(n, one) { return `${n} ${n === 1 ? one : one + "s"}`; }
