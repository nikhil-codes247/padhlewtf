/** _shared.js — pieces used by the syllabus, subject and chapter views. */
import { esc, fmtPct, sum } from "../dom.js?v=mwz1qwqk";
import { bar, chip, deadlineChip, priorityChip, scopeChip, statusChip, tagChips, tierChip, iconBtn } from "../components.js?v=mwz1qwqk";
import { fmtDuration, fmtShort } from "../../core/dates.js?v=mwz1qwqk";

export const SORTS = [
  { value: "order", label: "Syllabus order" },
  { value: "progress", label: "Progress (low → high)" },
  { value: "priority", label: "Priority (P1 first)" },
  { value: "deadline", label: "Deadline (soonest)" },
  { value: "difficulty", label: "Difficulty (hardest)" },
  { value: "time", label: "Most time spent" },
];

export const STATUS_FILTERS = [
  { value: "all", label: "Any status" },
  { value: "open", label: "Not finished" },
  { value: "overdue", label: "Overdue" },
  { value: "unstarted", label: "Not started" },
  { value: "inprogress", label: "In progress" },
  { value: "done", label: "Fully done" },
  { value: "partial", label: "Partly done" },
  { value: "revise", label: "Needs revision" },
  { value: "doubt", label: "Has an open doubt" },
];

export const SCOPE_FILTERS = [
  { value: "all", label: "All content" },
  { value: "board", label: "Board-assessed only" },
  { value: "internal", label: "Internal / school-only" },
  { value: "optional", label: "Optional / excluded" },
];

const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2 };
const DIFF_RANK = { D1: 0, D2: 1, D3: 2, D4: 3 };

/** Apply the toolbar filters to a chapter list. */
export function filterChapters(chapters, ui, ctx) {
  const { store, today } = ctx;
  const q = (ui.q || "").trim().toLowerCase();
  let list = chapters.filter((c) => {
    if (ui.scope && ui.scope !== "all" && (c.scope || "board") !== ui.scope) return false;
    if (ui.tag && ui.tag !== "all" && !(c.tags || []).includes(ui.tag)) return false;
    const st = store.progressOf(c.id);
    switch (ui.status) {
      case "open": if (st.pct === 100) return false; break;
      case "overdue": if (st.deadlineStatus !== "overdue" || st.pct === 100) return false; break;
      case "unstarted": if (st.done > 0) return false; break;
      case "inprogress": if (!(st.done > 0 && st.pct < 100)) return false; break;
      case "done": if (st.pct < 100) return false; break;
      case "partial": if (!(st.done > 0 && st.pct < 100)) return false; break;
      case "revise": if (st.passes < 1) return false; break;
      case "doubt": if (!st.doubt) return false; break;
      default: break;
    }
    if (q) {
      const hay = [c.name, c.unit, c.subjectId, ...(c.tags || []), store.subject(c.subjectId)?.name || ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorters = {
    order: (a, b) => a.order - b.order,
    progress: (a, b) => store.progressOf(a.id).pct - store.progressOf(b.id).pct,
    priority: (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || a.order - b.order,
    deadline: (a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")),
    difficulty: (a, b) => (DIFF_RANK[b.difficulty] ?? -1) - (DIFF_RANK[a.difficulty] ?? -1),
    time: (a, b) => (store.progressOf(b.id)?.minutes || 0) - (store.progressOf(a.id)?.minutes || 0),
  };
  list = [...list].sort(sorters[ui.sort] || sorters.order);
  void today;
  return list;
}

export function chapterFiltersHtml(ui, { showSubject = false, subjects = [] } = {}) {
  return `<div class="row wrap gap-2" data-filter-bar>
    <input class="input grow" type="search" style="min-width:190px;max-width:290px" placeholder="Search chapters…"
      value="${esc(ui.q || "")}" data-act="filter-input" data-filter="q" aria-label="Search chapters">
    ${showSubject ? `<select class="select" style="width:auto" data-act="filter-change" data-filter="subject" aria-label="Filter by subject">
      <option value="all"${ui.subject === "all" ? " selected" : ""}>All subjects</option>
      ${subjects.map((s) => `<option value="${esc(s.id)}"${ui.subject === s.id ? " selected" : ""}>${esc(s.short)}</option>`).join("")}
    </select>` : ""}
    <select class="select" style="width:auto" data-act="filter-change" data-filter="status" aria-label="Filter by status">
      ${STATUS_FILTERS.map((o) => `<option value="${esc(o.value)}"${ui.status === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select>
    <select class="select" style="width:auto" data-act="filter-change" data-filter="scope" aria-label="Filter by scope">
      ${SCOPE_FILTERS.map((o) => `<option value="${esc(o.value)}"${ui.scope === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select>
    <select class="select" style="width:auto" data-act="filter-change" data-filter="tag" aria-label="Filter by tag">
      <option value="all">Any tag</option>
      ${(ui._tags || []).map((t) => `<option value="${esc(t.label)}"${ui.tag === t.label ? " selected" : ""}>${esc(t.label)}</option>`).join("")}
    </select>
    <select class="select" style="width:auto" data-act="filter-change" data-filter="sort" aria-label="Sort by">
      ${SORTS.map((o) => `<option value="${esc(o.value)}"${ui.sort === o.value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select>
    <button class="btn sm ghost" data-act="filters-reset" type="button">Reset</button>
  </div>`;
}

/**
 * One chapter row. `compact` hides the checklist preview (used for long lists).
 */
export function chapterRow(ch, ctx, { showSubject = false } = {}) {
  const { store, today, ui } = ctx;
  const st = store.progressOf(ch.id);
  const subject = store.subject(ch.subjectId);
  const nodes = store.nodesOf(ch.id);
  const hasKids = nodes.length > 0;
  const doneKids = nodes.filter((n) => n.done).length;
  const openKey = `ch-${ch.id}`;
  const expanded = ui.open?.has(openKey);

  return `<div class="card tight" data-chapter-card="${esc(ch.id)}">
    <div class="row gap-3" style="align-items:flex-start">
      ${subject && showSubject ? `<span class="dot" style="background:${esc(subject.color)};margin-top:7px"></span>` : ""}
      ${hasKids ? `<button class="btn sm ghost" type="button" data-act="open-toggle" data-key="${esc(openKey)}" aria-expanded="${expanded ? "true" : "false"}" title="${expanded ? "Collapse" : "Expand"} checklist">${expanded ? "▾" : "▸"}</button>`
        : `<label class="check" style="margin-top:4px"><input type="checkbox" ${st.done === st.leaves && st.leaves > 0 ? "checked" : ""} data-act="toggle-chapter" data-id="${esc(ch.id)}" aria-label="Mark chapter complete"><span class="box"></span></label>`}
      <div class="grow">
        <div class="row wrap gap-2">
          <a class="strong" href="#/chapter/${esc(ch.id)}" style="font-size:var(--fs-lg)">${esc(ch.name)}</a>
          ${scopeChip(ch.scope)}
          ${priorityChip(ch.priority)}
          ${tierChip(ch.globalTier, ch.tierLabel)}
          ${st.deadline ? deadlineChip(ch.deadline, today) : ""}
          ${st.doubt ? chip("doubt open", "bad") : ""}
        </div>
        <div class="xs faint mt-2">${esc(ch.unit || "")}${ch.unit ? " · " : ""}${ch.marksLabel ? esc(ch.marksLabel) : ""}${ch.difficulty ? ` · ${esc(ch.difficulty)}` : ""}${hasKids ? ` · ${doneKids}/${nodes.length} sub-items` : ""}${st.minutes ? ` · ${esc(fmtDuration(st.minutes))} logged` : ""}</div>
        <div class="mt-3">${bar(st.pct, { cls: st.pct === 100 ? "ok" : st.pct > 0 ? "warn" : "", striped: st.pct > 0 && st.pct < 100 })}</div>
        <div class="row wrap gap-2 mt-2">
          <span class="xs faint">${st.done}/${st.leaves} items · ${fmtPct(st.pct)}</span>
          ${st.passes ? chip(st.passes >= 2 ? `revision ×${st.passes}` : "revised once", "acc") : ""}
          ${tagChips(ch.tags, ui._tagIndex)}
        </div>
        ${ch.nextAction ? `<div class="xs muted mt-2">Next: ${esc(ch.nextAction)}</div>` : ""}
        ${expanded && hasKids ? `<div class="mt-3">${nodes.map((n) => {
          const kids = store.childNodes(n.id);
          return `<div class="row gap-2" style="padding:4px 0">
            <label class="check ${n.done ? "done" : ""}"><input type="checkbox" ${n.done ? "checked" : ""} data-act="toggle-node" data-id="${esc(n.id)}"><span class="box"></span>
              <span class="label-text small">${esc(n.name)}${kids.length ? ` <span class="xs faint">(${kids.filter((k) => k.done).length}/${kids.length})</span>` : ""}</span></label>
            <span class="grow"></span>
            ${statusChip(n.status)}
          </div>`;
        }).join("")}</div>` : ""}
      </div>
      <div class="row gap-1">
        <a class="btn sm" href="#/chapter/${esc(ch.id)}">Open</a>
        ${iconBtn("chapter-edit", ch.id, "✎", "Edit chapter")}
        ${iconBtn("chapter-delete", ch.id, "🗑", "Delete chapter", "ghost")}
      </div>
    </div>
  </div>`;
}

export function subjectSummary(subject, ctx) {
  const { store } = ctx;
  const sp = store.subjectProgress(subject.id);
  const chapters = store.chaptersOf(subject.id);
  return `<div class="card tight stripe" style="--stripe:${esc(subject.color)}">
    <div class="row wrap gap-4 between">
      <div class="row gap-3">
        <span class="tile-mark" style="background:${esc(subject.color)}">${esc((subject.short || subject.name).slice(0, 2).toUpperCase())}</span>
        <div>
          <div class="strong" style="font-size:var(--fs-lg)">${esc(subject.name)}</div>
          <div class="xs muted">${esc(subject.code || "")}${subject.code ? " · " : ""}${chapters.length} chapters · ${sp.scopes.board.leaves} board items</div>
        </div>
      </div>
      <div class="row gap-5 wrap">
        <div class="metric"><div class="k">Board</div><div class="v" style="font-size:var(--fs-xl)">${fmtPct(sp.scopes.board.pct)}</div></div>
        <div class="metric"><div class="k">Chapters done</div><div class="v" style="font-size:var(--fs-xl)">${sp.scopes.board.chaptersDone}/${sp.scopes.board.chapters}</div></div>
        <div class="metric"><div class="k">Studied</div><div class="v" style="font-size:var(--fs-xl)">${esc(fmtDuration(sp.minutes))}</div></div>
      </div>
    </div>
  </div>`;
}

export function scopeNote() {
  return `<div class="callout info">Optional, practical and school-assessed (periodic/project) items are tracked and can be ticked, but they are <b>never</b> counted as unfinished board-exam work. Use the “All content” filter to see them.</div>`;
}

/* --------------------------------------------------- sessions & revisions -- */
const ACT_LABEL = { learn: "Initial learning", practice: "Practice", revision: "Revision", doubt: "Doubt resolution" };

/** One logged study session, used by the chapter view, the timer and the planner. */
export function sessionRow(s, ctx, { showDate = true, showChapter = true } = {}) {
  const { store } = ctx;
  const ch = s.chapterId ? store.chapter(s.chapterId) : null;
  const node = s.nodeId ? store.node(s.nodeId) : null;
  const subj = s.subjectId ? store.subject(s.subjectId) : null;
  const evt = store.state.revisions.some((r) => r.sessionId === s.id);
  return `<div class="row gap-3" style="align-items:flex-start;padding:8px 0;border-bottom:1px dashed var(--line)">
    <div class="grow">
      <div class="row wrap gap-2">
        <b>${esc(fmtDuration(s.minutes))}</b>
        ${chip(ACT_LABEL[s.activity] || s.activity, s.activity === "revision" ? "warn" : s.activity === "practice" ? "info" : "soft")}
        ${s.source === "timer" ? chip("timer", "plain") : chip("manual", "plain")}
        ${showDate ? `<span class="xs faint">${esc(s.dateISO)}${s.startISO ? ` · ${esc(String(s.startISO).slice(11, 16))}` : ""}</span>` : ""}
        ${evt ? chip("has revision record", "acc") : ""}
      </div>
      ${showChapter && ch ? `<div class="xs muted mt-2">${subj ? `${esc(subj.short)} · ` : ""}<a href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>${node ? ` › ${esc(node.name)}` : ""}</div>` : ""}
      ${s.notes ? `<div class="small mt-2">${esc(s.notes)}</div>` : ""}
      ${s.outcome ? `<div class="xs muted">Outcome: ${esc(s.outcome)}</div>` : ""}
    </div>
    <div class="row gap-1">
      <button class="btn sm ghost" data-act="session-edit" data-id="${esc(s.id)}" title="Edit this session">✎</button>
      <button class="btn sm ghost" data-act="session-delete" data-id="${esc(s.id)}" title="Delete this session">🗑</button>
    </div>
  </div>`;
}

export function revisionHistory(chapterId, ctx) {
  const { store } = ctx;
  const nodeIds = new Set(store.nodesOf(chapterId).map((n) => n.id));
  const revs = store.state.revisions
    .filter((r) => (r.targetType === "chapter" && r.targetId === chapterId) || (r.targetType === "node" && nodeIds.has(r.targetId)))
    .sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)));
  if (!revs.length) return `<p class="small muted">No revision passes recorded yet.</p>`;
  return `<div class="stack gap-2">${revs.map((r) => {
    const node = r.targetType === "node" ? store.node(r.targetId) : null;
    return `<div class="row gap-3" style="align-items:flex-start;padding:7px 0;border-bottom:1px dashed var(--line)">
      <span class="badge ${r.pass >= 2 ? "green" : "blue"}">R${esc(r.pass)}</span>
      <div class="grow">
        <div class="row wrap gap-2"><b>${esc(r.dateISO)}</b>${node ? `<span class="xs muted">on ${esc(node.name)}</span>` : `<span class="xs muted">chapter-level</span>`}${r.score !== null && r.score !== undefined ? chip(`self-score ${r.score}/5`, "soft") : ""}</div>
        ${r.notes ? `<div class="small mt-2">${esc(r.notes)}</div>` : ""}
      </div>
      <button class="btn sm ghost" data-act="revision-delete" data-id="${esc(r.id)}" title="Delete this revision record">🗑</button>
    </div>`;
  }).join("")}</div>`;
}

export { sum };

/** A note / doubt / formula / reminder card, shared by the chapter and notes views. */
export function noteCard(n, ctx, { showLink = true } = {}) {
  const node = n.nodeId ? ctx.store.node(n.nodeId) : null;
  const ch = n.chapterId ? ctx.store.chapter(n.chapterId) : null;
  const kinds = { note: "note", doubt: "doubt", formula: "formula", reminder: "reminder" };
  const statusCls = n.doubtStatus === "resolved" ? "ok" : n.doubtStatus === "inprogress" ? "warn" : "bad";
  const subj = n.subjectId ? ctx.store.subject(n.subjectId) : null;
  return `<article class="list-item flat ${n.pinned ? "pinned" : ""}" style="padding:var(--sp-3)">
    <div class="grow">
      <div class="row wrap gap-2">
        ${chip(kinds[n.kind] || n.kind, n.kind === "doubt" ? statusCls : "soft")}
        ${n.kind === "doubt" ? chip(n.doubtStatus, statusCls) : ""}
        ${n.pinned ? chip("pinned", "acc") : ""}
        ${showLink && ch ? `<span class="xs muted">${subj ? `${esc(subj.short)} · ` : ""}<a href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>${node ? ` › ${esc(node.name)}` : ""}</span>` : node ? `<span class="xs muted">on ${esc(node.name)}</span>` : ""}
        <span class="xs faint">updated ${esc(fmtShort(String(n.updatedAt || n.createdAt).slice(0, 10)))}</span>
      </div>
      <div class="small mt-2" style="white-space:pre-wrap">${esc(n.text)}</div>
    </div>
    <div class="row gap-1">
      ${n.kind === "doubt" ? `<button class="btn sm ${n.doubtStatus === "resolved" ? "ghost" : "ok"}" data-act="doubt-toggle" data-id="${esc(n.id)}" title="Toggle resolved">${n.doubtStatus === "resolved" ? "Reopen" : "Resolve"}</button>` : ""}
      <button class="btn sm ghost" data-act="note-pin" data-id="${esc(n.id)}" title="${n.pinned ? "Unpin" : "Pin"}">${n.pinned ? "★" : "☆"}</button>
      <button class="btn sm ghost" data-act="note-edit" data-id="${esc(n.id)}" title="Edit">✎</button>
      <button class="btn sm ghost" data-act="note-delete" data-id="${esc(n.id)}" title="Delete">🗑</button>
    </div>
  </article>`;
}
