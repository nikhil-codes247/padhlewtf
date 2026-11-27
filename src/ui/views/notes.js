import { esc, fmtNum, attrs } from "../dom.js?v=mwz855jx";
import { chip, emptyState, metricCard, sectionCard, table } from "../components.js?v=mwz855jx";
import { noteCard } from "./_shared.js?v=mwz855jx";
import { fmtShort, diffDays } from "../../core/dates.js?v=mwz855jx";
import { filterBySubject, visibleSubjects } from "../selection.js?v=mwz855jx";

const KINDS = [
  { value: "all", label: "Everything" },
  { value: "note", label: "Notes" },
  { value: "doubt", label: "Doubts" },
  { value: "formula", label: "Formulas" },
  { value: "reminder", label: "Reminders" },
];
const DSTATUS = [
  { value: "all", label: "Any doubt state" },
  { value: "unresolved", label: "Unresolved" },
  { value: "inprogress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

export default {
  id: "notes",
  title: "Doubts & Notes",
  render(ctx) {
    const { store, ui, today } = ctx;
    const all = filterBySubject(store, store.state.notes, (n) => n.subjectId);
    const subjects = visibleSubjects(store);
    const q = (ui.nq || "").trim().toLowerCase();

    const filtered = all.filter((n) => {
      if (ui.noteKind && ui.noteKind !== "all" && n.kind !== ui.noteKind) return false;
      if (ui.noteStatus && ui.noteStatus !== "all") {
        if (n.kind !== "doubt") return false;
        if ((n.doubtStatus || "unresolved") !== ui.noteStatus) return false;
      }
      if (ui.noteSubject && ui.noteSubject !== "all" && n.subjectId !== ui.noteSubject) return false;
      if (ui.notePinned && !n.pinned) return false;
      if (q) {
        const ch = n.chapterId ? store.chapter(n.chapterId) : null;
        const node = n.nodeId ? store.node(n.nodeId) : null;
        const hay = [n.text, ch?.name, node?.name, store.subject(n.subjectId)?.name].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    const doubts = all.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved")
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const resolved = all.filter((n) => n.kind === "doubt" && n.doubtStatus === "resolved");

    const head = `<section class="card stripe" style="--stripe:var(--bad)">
      <div class="row wrap between gap-4">
        <div class="grow" style="min-width:240px">
          <div class="eyebrow">Doubts · Capture</div>
          <h1 style="margin:6px 0">Doubts &amp; Notes</h1>
          <p class="small muted" style="margin:0">Notes, formulas, reminders and doubts stay attached to the chapter (or the exact item) they belong to. Doubts stay in a review queue until you mark them resolved.</p>
        </div>
        <div class="row wrap gap-2">
          <button class="btn primary" data-act="note-add" data-kind="note">＋ Note</button>
          <button class="btn" data-act="note-add" data-kind="doubt">＋ Doubt</button>
          <button class="btn ghost" data-act="note-add" data-kind="formula">＋ Formula</button>
          <button class="btn ghost" data-act="note-add" data-kind="reminder">＋ Reminder</button>
        </div>
      </div>
    </section>`;

    const stats = `<div class="metrics">
      ${metricCard({ k: "Total entries", v: fmtNum(all.length), s: `${all.filter((n) => n.kind === "note").length} notes · ${all.filter((n) => n.kind === "formula").length} formulas` })}
      ${metricCard({ k: "Open doubts", v: fmtNum(doubts.length), s: "in the review queue", tone: doubts.length ? "warn" : "ok" })}
      ${metricCard({ k: "Resolved doubts", v: fmtNum(resolved.length), s: "kept for reference" })}
      ${metricCard({ k: "Pinned", v: fmtNum(all.filter((n) => n.pinned).length), s: "always shown first" })}
    </div>`;

    const review = sectionCard({
      title: "Review queue — unresolved doubts",
      subtitle: doubts.length ? `Oldest first · the top one has been open ${esc(relativeDays(doubts[0], today))}` : "Nothing waiting on you",
      body: doubts.length
        ? `<div class="list">${doubts.map((n) => noteCard(n, ctx)).join("")}</div>`
        : emptyState({ icon: "🎯", title: "No open doubts", text: "When something is unclear, record it as a doubt so it comes back to you instead of getting lost.", action: `<button class="btn primary" data-act="note-add" data-kind="doubt">＋ Record a doubt</button>`, mood: "cheer" }),
    });

    const filters = `<div class="row wrap gap-2">
      <input class="input grow" type="search" style="min-width:190px;max-width:280px" placeholder="Search notes and doubts…" value="${esc(ui.nq || "")}" data-act="filter-input" data-filter="nq" aria-label="Search notes">
      <select class="select" style="width:auto" data-act="filter-change" data-filter="noteKind" aria-label="Filter by kind">
        ${KINDS.map((k) => `<option value="${esc(k.value)}"${ui.noteKind === k.value ? " selected" : ""}>${esc(k.label)}</option>`).join("")}
      </select>
      <select class="select" style="width:auto" data-act="filter-change" data-filter="noteStatus" aria-label="Filter by doubt state">
        ${DSTATUS.map((k) => `<option value="${esc(k.value)}"${ui.noteStatus === k.value ? " selected" : ""}>${esc(k.label)}</option>`).join("")}
      </select>
      <select class="select" style="width:auto" data-act="filter-change" data-filter="noteSubject" aria-label="Filter by subject">
        <option value="all">All subjects</option>
        ${subjects.map((s) => `<option value="${esc(s.id)}"${ui.noteSubject === s.id ? " selected" : ""}>${esc(s.short)}</option>`).join("")}
      </select>
      <label class="check" style="padding:6px 9px;border:var(--border-w) solid var(--line);border-radius:var(--r-sm)">
        <input type="checkbox" ${ui.notePinned ? "checked" : ""} data-act="filter-toggle" data-filter="notePinned"><span class="box"></span><span class="label-text small">Pinned only</span>
      </label>
      <button class="btn sm ghost" data-act="filters-reset">Reset</button>
    </div>`;

    const list = sectionCard({
      title: `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`,
      subtitle: filtered.length !== all.length ? `${all.length - filtered.length} hidden by filters` : "newest first",
      body: filtered.length
        ? `<div class="list">${filtered.map((n) => noteCard(n, ctx)).join("")}</div>`
        : emptyState({ icon: "🔍", title: "Nothing matches", text: "Try clearing the filters or searching for something else.", action: `<button class="btn" data-act="filters-reset">Reset filters</button>` }),
    });

    const bySubject = subjects.map((s) => {
      const list = all.filter((n) => n.subjectId === s.id);
      return { s, total: list.length, doubts: list.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved").length };
    }).filter((x) => x.total > 0);

    const summary = bySubject.length
      ? sectionCard({
          title: "Where your notes live",
          body: table(
            [{ label: "Subject" }, { label: "Entries", cls: "num" }, { label: "Open doubts", cls: "num" }],
            bySubject.map((x) => [`<a href="#/subject/${esc(x.s.id)}">${esc(x.s.name)}</a>`, fmtNum(x.total), x.doubts ? `<span class="badge warn">${x.doubts}</span>` : "0"])
          ),
        })
      : "";

    return [head, stats, review, sectionCard({ title: "All entries", cls: "tight", body: filters }), list, summary].join("");
  },
};

function relativeDays(note, today) {
  const created = String(note.createdAt || "").slice(0, 10);
  if (!created) return "a while";
  const d = diffDays(created, today);
  return d <= 0 ? "less than a day" : `${d} day${d === 1 ? "" : "s"}`;
}
void attrs; void chip; void fmtShort;
