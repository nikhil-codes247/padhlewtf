import { esc, fmtPct } from "../dom.js?v=mwz8yitl";
import { chip, emptyState, metricCard, progressBlock, sectionCard, statusChip, tagChips, priorityChip, tierChip, scopeChip, deadlineChip } from "../components.js?v=mwz8yitl";
import { sessionRow, revisionHistory, noteCard } from "./_shared.js?v=mwz8yitl";
import { fmtDuration, fmtShort } from "../../core/dates.js?v=mwz8yitl";
import { chapterEstimate } from "../../core/recommend.js?v=mwz8yitl";
import { STATUSES } from "../../core/validate.js?v=mwz8yitl";
import { isVisibleSubject } from "../selection.js?v=mwz8yitl";

export default {
  id: "chapter",
  title: "Chapter",
  render(ctx) {
    const { store, today, ui } = ctx;
    const ch = store.chapter(ctx.params[0]);
    if (!ch) return emptyState({ icon: "🚫", title: "Chapter not found", text: "It may have been deleted.", action: `<a class="btn" href="#/syllabus">Back to the syllabus</a>`, mood: "oops" });
    if (!isVisibleSubject(store, ch.subjectId)) {
      return emptyState({
        icon: "🎯",
        title: "This chapter is outside your selection",
        text: "PADHLE.WTF is showing only the subjects you chose. Add this subject from Account → Change subjects if you need it.",
        action: `<a class="btn primary" href="#/choose-subjects">Change subjects</a> <a class="btn" href="#/syllabus">Back to my syllabus</a>`,
      });
    }
    const subject = store.subject(ch.subjectId);
    const st = store.progressOf(ch.id);
    const nodes = store.nodesOf(ch.id);
    const estimate = chapterEstimate(ch, store.state.nodes);
    const sessions = store.state.sessions.filter((s) => s.chapterId === ch.id).sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const notes = store.state.notes
      .filter((n) => n.chapterId === ch.id || (n.nodeId && nodeIds.has(n.nodeId)))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const doubtsOpen = notes.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved").length;
    const actual = st.minutes;
    const overrun = estimate && actual > estimate;

    /* ------------------------------------------------------------- header -- */
    const header = `<section class="card stripe" style="--stripe:${esc(subject?.color || "var(--accent)")}">
      <div class="row wrap gap-2 xs muted">
        ${subject ? `<a href="#/subject/${esc(subject.id)}">${esc(subject.name)}</a> · ` : ""}${esc(ch.unit || "no unit")}
      </div>
      <div class="row wrap between gap-4 mt-2">
        <div class="grow" style="min-width:240px">
          <h1 style="margin:0 0 6px">${esc(ch.name)}</h1>
          <div class="row wrap gap-2">
            ${scopeChip(ch.scope)}
            ${priorityChip(ch.priority)}
            ${tierChip(ch.globalTier, ch.tierLabel)}
            ${ch.difficulty ? chip(ch.difficulty, "plain") : ""}
            ${ch.marksLabel ? chip(ch.marksLabel, "soft") : ""}
            ${statusChip(st.status)}
            ${st.deadline ? deadlineChip(st.deadline, today) : ""}
            ${doubtsOpen ? chip(`${doubtsOpen} open doubt${doubtsOpen > 1 ? "s" : ""}`, "bad") : ""}
            ${tagChips(ch.tags, ui._tagIndex)}
          </div>
        </div>
        <div class="row wrap gap-2">
          <button class="btn sm" data-act="chapter-edit" data-id="${esc(ch.id)}">Edit details</button>
          <button class="btn sm ghost" data-act="chapter-delete" data-id="${esc(ch.id)}">Delete</button>
        </div>
      </div>
      <div class="mt-4">${progressBlock({ pct: st.pct, done: st.done, total: st.leaves, label: "Checklist completion", sub: nodes.length ? `${nodes.length} sub-items` : "chapter itself is the item" })}</div>
      <div class="row wrap gap-2 mt-3">
        <label class="check ${st.done === st.leaves && st.leaves > 0 ? "done" : ""}" style="padding:4px 8px;border:var(--border-w) solid var(--line);border-radius:var(--r-sm)">
          <input type="checkbox" ${st.done === st.leaves && st.leaves > 0 ? "checked" : ""} data-act="toggle-chapter" data-id="${esc(ch.id)}">
          <span class="box"></span><span class="label-text small strong">Mark the whole chapter complete</span>
        </label>
        <select class="select" style="width:auto" data-act="chapter-status" data-id="${esc(ch.id)}" aria-label="Chapter status">
          ${STATUSES.map((s) => `<option value="${esc(s)}"${st.status === s ? " selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
        <label class="row gap-2 small" style="border:var(--border-w) solid var(--line);border-radius:var(--r-sm);padding:6px 9px">
          <span class="muted">Deadline</span>
          <input type="date" class="input" style="width:auto;padding:4px 7px" value="${esc(ch.deadline || "")}" data-act="chapter-deadline" data-id="${esc(ch.id)}" aria-label="Chapter deadline">
        </label>
      </div>
    </section>`;

    /* -------------------------------------------------------------- facts -- */
    const facts = sectionCard({
      title: "Chapter details",
      subtitle: "What the syllabus says about this chapter, and how it is planned",
      body: `<dl class="kv">
        <dt>Board assessed</dt><dd>${esc(ch.assessedLabel || (ch.scope === "board" ? "Yes" : "No"))}${ch.scope !== "board" ? ` — ${esc(ch.scope === "internal" ? "school-assessed only" : "optional / excluded from the board paper")}` : ""}</dd>
        ${ch.marksLabel ? `<dt>Marks</dt><dd>${esc(ch.marksLabel)}</dd>` : ""}
        ${ch.difficulty ? `<dt>Difficulty</dt><dd>${esc(ch.difficulty)}</dd>` : ""}
        ${ch.priority ? `<dt>Priority in subject</dt><dd>${esc(ch.priority)}</dd>` : ""}
        ${ch.tierLabel ? `<dt>Planning tier</dt><dd>${esc(ch.tierLabel)}</dd>` : ""}
        ${ch.nextAction ? `<dt>Suggested next action</dt><dd>${esc(ch.nextAction)}</dd>` : ""}
      </dl>
      ${ch.ruleNote ? `<div class="callout warn mt-3"><b>Syllabus note:</b> ${esc(ch.ruleNote)}</div>` : ""}
      ${ch.notes ? `<div class="mt-3"><div class="xs strong muted">Your chapter note</div><div class="small">${esc(ch.notes)}</div></div>` : ""}`,
    });

    /* ---------------------------------------------------------- checklist -- */
    const checklist = sectionCard({
      title: "Checklist",
      subtitle: nodes.length
        ? `${st.done} of ${st.leaves} items done · progress is computed from the deepest items only, so parents are never double-counted`
        : "This chapter has no sub-items yet, so the chapter itself counts as one item",
      actions: `${nodes.length ? `<button class="btn sm ghost" data-act="chapter-tick-all" data-id="${esc(ch.id)}" data-value="1">Tick all</button>
                <button class="btn sm ghost" data-act="chapter-tick-all" data-id="${esc(ch.id)}" data-value="0">Clear all</button>` : ""}`,
      body: nodes.length
        ? `<ul class="tree">${renderLevel(store, ch.id, null, ctx, 0)}</ul>`
        : emptyState({
            icon: "🧩",
            title: "No checklist items",
            text: "This chapter has no sub-items, so the chapter itself counts as one item.",
          }),
    });

    /* ------------------------------------------------------------- effort -- */
    const effort = `<div class="metrics">
      ${metricCard({ k: "Items done", v: `${st.done}<span class="faint" style="font-size:var(--fs-lg)">/${st.leaves}</span>`, s: fmtPct(st.pct) })}
      ${metricCard({ k: "Time logged", v: esc(fmtDuration(actual)), s: sessions.length ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}` : "nothing logged yet", tone: overrun ? "warn" : "" })}
      ${metricCard({ k: "Estimate", v: esc(fmtDuration(estimate)), s: "sum of item estimates (fallback 30 min)" })}
      ${metricCard({ k: "Revision passes", v: String(st.passes), s: st.lastRevision ? `last on ${esc(fmtShort(st.lastRevision))}` : "never revised", tone: st.done === st.leaves && st.passes === 0 ? "warn" : "" })}
    </div>
    ${overrun ? `<div class="callout warn mt-4">This chapter has taken <b>${esc(fmtDuration(actual - estimate))}</b> longer than its estimate. Worth noting in your analytics — it usually means the estimates, not the study, need adjusting.</div>` : ""}`;

    /* ------------------------------------------------------------ sessions -- */
    const sessionsCard = sectionCard({
      title: "Study sessions",
      subtitle: sessions.length ? `${esc(fmtDuration(actual))} total` : "No time logged against this chapter yet",
      actions: `<button class="btn sm primary" data-act="session-add" data-chapter="${esc(ch.id)}">＋ Log time</button>
                <a class="btn sm ghost" href="#/timer">Use the timer</a>`,
      body: sessions.length
        ? `<div>${sessions.slice(0, 25).map((s) => sessionRow(s, ctx, { showChapter: false })).join("")}</div>`
        : `<p class="small muted">Time spent is stored separately from completion — logging an hour here will never tick an item for you.</p>`,
    });

    /* ------------------------------------------------------------ revision -- */
    const revisionCard = sectionCard({
      title: "Revision history",
      subtitle: "Every pass is recorded separately; the original study sessions stay untouched",
      actions: `<button class="btn sm primary" data-act="revision-add" data-chapter="${esc(ch.id)}">＋ Record revision</button>`,
      body: revisionHistory(ch.id, ctx),
    });

    /* --------------------------------------------------------------- notes -- */
    const notesCard = sectionCard({
      title: "Notes & doubts",
      subtitle: `${notes.length} item${notes.length === 1 ? "" : "s"}${doubtsOpen ? ` · ${doubtsOpen} unresolved` : ""}`,
      actions: `<button class="btn sm" data-act="note-add" data-chapter="${esc(ch.id)}" data-kind="note">＋ Note</button>
                <button class="btn sm ghost" data-act="note-add" data-chapter="${esc(ch.id)}" data-kind="doubt">＋ Doubt</button>`,
      body: notes.length
        ? `<div class="list">${notes.map((n) => noteCard(n, ctx)).join("")}</div>`
        : `<p class="small muted">Keep formulas, reminders and open questions here — they stay linked to this chapter (or to a specific item below).</p>`,
    });

    return [header, facts, effort, checklist, sessionsCard, revisionCard, notesCard].join("");
  },
};

/* ------------------------------------------------------------- rendering -- */
function renderLevel(store, chapterId, parentId, ctx, depth) {
  const kids = store.state.nodes
    .filter((n) => n.chapterId === chapterId && (n.parentId || null) === (parentId || null))
    .sort((a, b) => a.order - b.order);
  return kids.map((n) => {
    const children = store.childNodes(n.id);
    const childLeaves = countLeaves(store, n.id);
    const doneLeaves = countLeaves(store, n.id, true);
    return `<li>
      <div class="leaf" data-node-row="${esc(n.id)}">
        <label class="check ${n.done ? "done" : ""}">
          <input type="checkbox" ${n.done ? "checked" : ""} data-act="toggle-node" data-id="${esc(n.id)}" aria-label="${esc(n.done ? "Mark incomplete" : "Mark complete")}: ${esc(n.name)}">
          <span class="box" aria-hidden="true"></span>
        </label>
        <div class="grow">
          <div class="row wrap gap-2">
            <span class="strong ${n.done ? "muted" : ""}" style="${n.done ? "text-decoration:line-through" : ""}">${esc(n.name)}</span>
            ${chip(n.kind === "topic" ? "topic" : n.kind === "subtopic" ? "sub-topic" : "item", "plain")}
            ${statusChip(n.status)}
            ${n.estMin ? chip(`≈${esc(fmtDuration(n.estMin))}`, "soft") : ""}
            ${children.length ? chip(`${doneLeaves}/${childLeaves} inside`, doneLeaves === childLeaves ? "ok" : "soft") : ""}
            ${n.deadline ? deadlineChip(n.deadline, ctx.today) : ""}
            ${priorityChip(n.priority)}
            ${tagChips(n.tags, ctx.ui._tagIndex, { limit: 3 })}
          </div>
          ${n.notes ? `<div class="xs muted mt-2">${esc(n.notes)}</div>` : ""}
        </div>
        <div class="reorder" role="group" aria-label="Reorder">
          <button type="button" data-act="node-move" data-id="${esc(n.id)}" data-dir="up" title="Move up" aria-label="Move ${esc(n.name)} up">▲</button>
          <button type="button" data-act="node-move" data-id="${esc(n.id)}" data-dir="down" title="Move down" aria-label="Move ${esc(n.name)} down">▼</button>
        </div>
        <div class="row gap-1">
          <button class="btn sm ghost" data-act="node-edit" data-id="${esc(n.id)}" title="Edit">✎</button>
          <button class="btn sm ghost" data-act="node-delete" data-id="${esc(n.id)}" title="Delete">🗑</button>
        </div>
      </div>
      ${children.length ? `<ul>${renderLevel(store, chapterId, n.id, ctx, depth + 1)}</ul>` : ""}
    </li>`;
  }).join("");
}

function countLeaves(store, nodeId, onlyDone = false) {
  const children = store.childNodes(nodeId);
  if (!children.length) {
    const n = store.node(nodeId);
    return n && n.done ? 1 : (onlyDone ? 0 : 1);
  }
  return children.reduce((a, c) => a + countLeaves(store, c.id, onlyDone), 0);
}
