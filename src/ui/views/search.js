import { esc, fmtNum } from "../dom.js?v=mwz8hppl";
import { chip, emptyState, sectionCard, subjectMark } from "../components.js?v=mwz8hppl";
import { fmtDuration } from "../../core/dates.js?v=mwz8hppl";
import { filterBySubject, taskSubjectId } from "../selection.js?v=mwz8hppl";

const KINDS = [
  { id: "chapters", label: "Chapters" },
  { id: "items", label: "Topics & checklist items" },
  { id: "notes", label: "Notes & doubts" },
  { id: "sessions", label: "Session notes" },
  { id: "planner", label: "Planner tasks" },
];

export default {
  id: "search",
  title: "Search",
  render(ctx) {
    const { store, ui } = ctx;
    const q = (ui.q || "").trim();
    if (!q) {
      return sectionCard({ title: "Search", body: emptyState({ icon: "🔎", title: "Type something to search", text: "Search chapters, topics, notes, doubts, session notes and planner tasks. Use the box in the top bar.", mood: "curious" }) });
    }
    const needle = q.toLowerCase();
    const hit = (...vals) => vals.filter(Boolean).join(" ").toLowerCase().includes(needle);

    const results = {
      chapters: filterBySubject(store, store.state.chapters, (c) => c.subjectId)
        .filter((c) => hit(c.name, c.unit, c.ruleNote, c.nextAction, ...(c.tags || []))),
      items: filterBySubject(store, store.state.nodes, (n) => store.chapter(n.chapterId)?.subjectId)
        .filter((n) => hit(n.name, n.notes, ...(n.tags || []))),
      notes: filterBySubject(store, store.state.notes, (n) => n.subjectId)
        .filter((n) => hit(n.text)),
      sessions: filterBySubject(store, store.state.sessions, (s) => s.subjectId)
        .filter((s) => hit(s.notes, s.outcome)),
      planner: filterBySubject(store, store.state.planner, (p) => taskSubjectId(store, p))
        .filter((p) => hit(p.title, p.task, p.target, p.topicLabel)),
    };
    const total = Object.values(results).reduce((a, r) => a + r.length, 0);

    const blocks = KINDS.map((k) => {
      const list = results[k.id];
      if (!list.length) return "";
      return `<div class="mt-4"><h3>${esc(k.label)} <span class="faint small">${fmtNum(list.length)}</span></h3>
        <div class="stack gap-2">${list.slice(0, 40).map((rec) => rowFor(k.id, rec, ctx)).join("")}</div>
        ${list.length > 40 ? `<div class="xs faint mt-2">Showing the first 40 of ${fmtNum(list.length)}.</div>` : ""}</div>`;
    }).join("");

    return sectionCard({
      title: `“${q}”`,
      subtitle: `${fmtNum(total)} match${total === 1 ? "" : "es"} across your data`,
      body: total ? blocks : emptyState({ icon: "🕳", title: "No matches", text: "Nothing in your syllabus, notes, sessions or planner contains that text.", mood: "curious" }),
    });
  },
};

function rowFor(kind, rec, ctx) {
  const { store } = ctx;
  if (kind === "chapters") {
    const st = store.progressOf(rec.id);
    const subj = store.subject(rec.subjectId);
    return `<a class="list-item flat" style="box-shadow:none;padding:var(--sp-3)" href="#/chapter/${esc(rec.id)}">
      ${subjectMark(subj)}
      <div class="grow"><b>${esc(rec.name)}</b><div class="xs muted">${esc(subj?.name || "")}${rec.unit ? ` · ${esc(rec.unit)}` : ""}</div></div>
      <span class="chip soft">${st.done}/${st.leaves}</span>
    </a>`;
  }
  if (kind === "items") {
    const ch = store.chapter(rec.chapterId);
    return `<a class="list-item flat" style="box-shadow:none;padding:var(--sp-3)" href="#/chapter/${esc(rec.chapterId)}">
      <div class="grow"><b>${esc(rec.name)}</b><div class="xs muted">${esc(ch?.name || "")}</div>${rec.notes ? `<div class="small mt-2">${esc(rec.notes)}</div>` : ""}</div>
      ${chip(rec.done ? "done" : "open", rec.done ? "ok" : "plain")}
    </a>`;
  }
  if (kind === "notes") {
    const ch = rec.chapterId ? store.chapter(rec.chapterId) : null;
    const node = rec.nodeId ? store.node(rec.nodeId) : null;
    return `<div class="list-item flat" style="box-shadow:none;padding:var(--sp-3)">
      <div class="grow">${chip(rec.kind, rec.kind === "doubt" ? "bad" : "soft")} <span class="small">${esc(rec.text)}</span>
        <div class="xs muted mt-2">${ch ? `<a href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>` : "no chapter"}${node ? ` › ${esc(node.name)}` : ""}</div></div>
    </div>`;
  }
  if (kind === "sessions") {
    const ch = rec.chapterId ? store.chapter(rec.chapterId) : null;
    return `<div class="list-item flat" style="box-shadow:none;padding:var(--sp-3)">
      <div class="grow"><b>${esc(fmtDuration(rec.minutes))}</b> <span class="xs faint">${esc(rec.dateISO)}</span>
        <div class="small mt-2">${esc(rec.notes || rec.outcome || "")}</div>
        ${ch ? `<div class="xs muted">${esc(ch.name)}</div>` : ""}</div>
    </div>`;
  }
  const ch = rec.chapterId ? store.chapter(rec.chapterId) : null;
  return `<a class="list-item flat" style="box-shadow:none;padding:var(--sp-3)" href="#/planner/${esc(rec.dateISO)}">
    <div class="grow"><b>${esc(rec.title)}</b><div class="xs muted">${esc(rec.dateISO)}${ch ? ` · ${esc(ch.name)}` : ""}</div>
      ${rec.task ? `<div class="small mt-2">${esc(rec.task)}</div>` : ""}</div>
    ${chip(rec.done ? "done" : `${rec.estMin}m`, rec.done ? "ok" : "plain")}
  </a>`;
}
