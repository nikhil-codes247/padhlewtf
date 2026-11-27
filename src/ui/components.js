/**
 * components.js — reusable UI building blocks. Each returns an HTML string so
 * views stay declarative; interaction is wired once by the app's event layer
 * (`data-act` / `data-*`), never by per-component listeners.
 */
import { esc, fmtPct, fmtNum, initials, pctTone } from "./dom.js?v=mwz855jx";
import { deadlineStatus, relative, fmtShort } from "../core/dates.js?v=mwz855jx";
import { mascot } from "./mascot.js?v=mwz855jx";

/* --------------------------------------------------------------- quests --- */
/**
 * One quest as a self-contained tile: title, an XP chip (✓ once it has been paid),
 * a progress meter and its note. Used by both the dashboard (daily board) and the
 * profile (weekly board) so the two can never render a quest differently.
 */
export function questTile(quest) {
  const shown = quest.unit === "min" ? `${fmtNum(quest.progress)} / ${fmtNum(quest.target)} min`
    : quest.unit === "days" ? `${fmtNum(quest.progress)} / ${fmtNum(quest.target)} days`
    : `${fmtNum(quest.progress)} / ${fmtNum(quest.target)}`;
  return `<div class="quest ${quest.done ? "done" : ""}">
    <div class="quest-top">
      <span class="quest-ico" aria-hidden="true">${quest.icon}</span>
      <b class="grow">${esc(quest.title)}</b>
      <span class="quest-xp" title="${quest.earned ? "Already earned" : "Earn this by finishing the quest"}">${quest.earned ? "✓ " : "+"}${fmtNum(quest.xp)} XP</span>
    </div>
    ${meter(quest.pct * 100, { cls: quest.done ? "ok" : "" })}
    <div class="row between xs muted"><span class="truncate">${esc(quest.note)}</span><span class="nowrap">${shown}</span></div>
  </div>`;
}

export function questBoard({ title, subtitle, actions = "", quests = [], note = "", cls = "" }) {
  return sectionCard({
    title, subtitle, actions, cls,
    body: `<div class="quest-list">${quests.map(questTile).join("")}</div>${note ? `<div class="card-note">${note}</div>` : ""}`,
  });
}

/* ------------------------------------------------------------- progress --- */
export function bar(pct, { cls = "", thin = false, tall = false, striped = false } = {}) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="bar ${thin ? "thin" : ""} ${tall ? "tall" : ""} ${cls} ${striped ? "striped" : ""}"
    role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><span style="width:${v}%"></span></div>`;
}

export function meter(pct, { cls = "", showCounts = null, label = "" } = {}) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="meter" ${label ? `aria-label="${esc(label)}"` : ""}>
    ${bar(v, { cls: cls || pctTone(v) })}
    <div class="pct">${fmtPct(pct)}</div>
    ${showCounts ? `<div class="xs faint nowrap">${esc(showCounts)}</div>` : ""}
  </div>`;
}

export function progressBlock({ pct, done, total, label, sub }) {
  return `<div class="stack gap-2">
    <div class="row between">
      <span class="small strong">${esc(label)}</span>
      <span class="small faint nowrap">${done}/${total}${sub ? ` · ${esc(sub)}` : ""}</span>
    </div>
    ${meter(pct, { showCounts: null })}
  </div>`;
}

/* ----------------------------------------------------------------- chips --- */
export function chip(label, cls = "", extra = "") {
  return `<span class="chip ${cls}" ${extra}>${esc(label)}</span>`;
}

const STATUS_CLASS = {
  "To Do": "plain",
  "In Progress": "info",
  "Done": "ok",
  "Revise": "warn",
  "Second Revision": "acc",
  "Doubt": "bad",
};

export function statusChip(status) {
  const s = status || "To Do";
  return `<span class="chip ${STATUS_CLASS[s] ?? "plain"}">${esc(s)}</span>`;
}

export function scopeChip(scope, label) {
  if (scope === "board") return "";
  if (scope === "internal") return chip(label || "Internal (school-assessed)", "info");
  return chip(label || "Optional — not board-assessed", "plain");
}

export function priorityChip(priority) {
  if (!priority) return "";
  const cls = priority === "P1" ? "bad" : priority === "P2" ? "warn" : "plain";
  return `<span class="chip ${cls}" title="Priority in the subject (P1 first)">${esc(priority)}</span>`;
}

export function tierChip(tier, label) {
  if (!tier) return "";
  const cls = String(tier) === "1" ? "bad" : String(tier) === "2" ? "warn" : "plain";
  return `<span class="chip ${cls}" title="${esc(label || `Planning tier ${tier}`)}">T${esc(tier)}</span>`;
}

export function deadlineChip(iso, today) {
  if (!iso) return "";
  const st = deadlineStatus(iso, today);
  const cls = st === "overdue" ? "bad" : st === "soon" ? "warn" : "soft";
  return `<span class="chip ${cls}" title="Deadline ${esc(iso)}">📅 ${esc(fmtShort(iso))} · ${esc(relative(iso, today))}</span>`;
}

export function tagChips(tags = [], tagIndex = new Map(), { removable = false, limit = 6 } = {}) {
  if (!tags.length) return "";
  const shown = tags.slice(0, limit);
  const rest = tags.length - shown.length;
  return `<span class="chips">${shown.map((t) => {
    const def = tagIndex.get(t);
    const style = def?.color ? `border-color:${esc(def.color)};` : "";
    return `<span class="chip soft" style="${style}" title="${esc(def?.kind === "status" ? "Status tag" : "Custom tag")}">${esc(t)}${removable ? `<button type="button" data-act="tag-remove" data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">×</button>` : ""}</span>`;
  }).join("")}${rest > 0 ? `<span class="chip plain">+${rest}</span>` : ""}</span>`;
}

/* ---------------------------------------------------------------- layout --- */
export function sectionCard({ title, subtitle, actions = "", body, id = null, cls = "" }) {
  return `<section class="card ${cls}"${id ? ` id="${esc(id)}"` : ""}>
    ${title ? `<div class="card-title"><div><h2>${esc(title)}</h2>${subtitle ? `<p class="small muted card-sub">${esc(subtitle)}</p>` : ""}</div><div class="row gap-2">${actions}</div></div>` : ""}
    ${body}
  </section>`;
}

export function metricCard({ k, v, s = "", href = null, tone = "" }) {
  const toneVar = tone === "ok" ? "var(--ok-ink)" : tone === "bad" ? "var(--bad-ink)" : tone === "warn" ? "var(--warn-ink)" : "";
  const inner = `<div class="metric" data-tone="${esc(tone)}">
    <div class="k">${esc(k)}</div>
    <div class="v" style="${toneVar ? `color:${toneVar}` : ""}">${v}</div>
    ${s ? `<div class="s">${s}</div>` : ""}
  </div>`;
  return href
    ? `<a class="card tight flush metric-link" href="${esc(href)}" style="display:block">${inner}</a>`
    : `<div class="card tight flush">${inner}</div>`;
}

export function emptyState({ icon = "🗂", title, text, action = "", extra = "", mood = "ready" }) {
  return `<div class="empty" data-mood="${esc(mood)}">
    <div class="empty-art" aria-hidden="true">
      ${mascot({ mood, size: 112, className: "empty-mascot" })}
      <span class="em-ico">${icon}</span>
    </div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action ? `<div class="row gap-2">${action}</div>` : ""}
    ${extra}
  </div>`;
}

export function subjectMark(subject, size = "") {
  if (!subject) return `<span class="tile-mark" style="background:var(--accent)${size}">?</span>`;
  return `<span class="tile-mark" style="background:${esc(subject.color)}${size}" title="${esc(subject.name)}">${esc(initials(subject.short || subject.name))}</span>`;
}

export function iconBtn(act, id, glyph, title, cls = "ghost") {
  return `<button type="button" class="btn sm ${cls}" data-act="${esc(act)}" data-id="${esc(id)}" title="${esc(title)}" aria-label="${esc(title)}">${glyph}</button>`;
}

export function table(headers, rows, { empty = "Nothing here yet." } = {}) {
  if (!rows.length) return `<p class="muted small">${esc(empty)}</p>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${headers.map((hd) => `<th ${hd.cls ? `class="${esc(hd.cls)}"` : ""}>${esc(hd.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td ${headers[i]?.cls ? `class="${esc(headers[i].cls)}"` : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}
