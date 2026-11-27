import { esc, fmtNum, fmtPct } from "../dom.js?v=mwz7xp2l";
import { bar, chip, emptyState, meter, sectionCard, subjectMark } from "../components.js?v=mwz7xp2l";
import { chapterFiltersHtml, chapterRow, filterChapters, scopeNote } from "./_shared.js?v=mwz7xp2l";
import { fmtDuration } from "../../core/dates.js?v=mwz7xp2l";
import {
  currentSelection, visibleSubjects, visibleChapters, scopedScopes, filterBySubject, isVisibleSubject,
} from "../selection.js?v=mwz7xp2l";

export default {
  id: "syllabus",
  title: "My Syllabus",
  render(ctx) {
    const { store, ui } = ctx;
    const subjects = visibleSubjects(store);
    const allChapters = visibleChapters(store);

    if (!subjects.length) {
      return emptyState({
        icon: "📚",
        title: "No subjects yet",
        text: "Add your first subject, then chapters, topics and checklist items underneath it.",
        action: `<button class="btn primary" data-act="subject-add">Add a subject</button>`,
        mood: "curious",
      });
    }

    const anyFilter = (ui.q || "") !== "" || (ui.status && ui.status !== "all") || (ui.scope && ui.scope !== "all") || (ui.tag && ui.tag !== "all") || (ui.subject && ui.subject !== "all");
    const filtered = filterChapters(allChapters, { ...ui, subject: "all" }, ctx)
      .filter((c) => !ui.subject || ui.subject === "all" || c.subjectId === ui.subject);

    const toolbar = sectionCard({
      cls: "tight",
      body: `${chapterFiltersHtml(ui, { showSubject: true, subjects })}
        <div class="row wrap gap-2 mt-3">
          <button class="btn sm" data-act="subject-add" type="button">＋ Subject</button>
          <button class="btn sm ghost" data-act="expand-all" data-what="open" type="button">Expand all</button>
          <button class="btn sm ghost" data-act="expand-all" data-what="close" type="button">Collapse all</button>
          <a class="btn sm ghost" href="#/curriculum">View full syllabus map</a>
          <span class="grow"></span>
          <span class="small muted">${fmtNum(filtered.length)} of ${fmtNum(allChapters.length)} chapters shown</span>
        </div>`,
    });

    const head = subjectSummaryOverall(ctx);
    const next = continueCard(store);

    if (anyFilter) {
      return [head, next, toolbar, scopeNote(), sectionCard({
        title: "Filtered chapters",
        subtitle: `${filtered.length} result${filtered.length === 1 ? "" : "s"}`,
        body: filtered.length
          ? `<div class="stack">${filtered.map((c) => chapterRow(c, ctx, { showSubject: true })).join("")}</div>`
          : emptyState({ icon: "🔍", title: "No chapters match", text: "Loosen a filter or clear the search box.", action: `<button class="btn" data-act="filters-reset">Reset filters</button>`, mood: "curious" }),
      })];
    }

    const sections = subjects.map((s) => {
      const key = `sub-${s.id}`;
      const open = ui.open?.has(key);
      const chapters = store.chaptersOf(s.id);
      const sp = store.subjectProgress(s.id);
      const sc = sp.scopes.board;
      return `<section class="card tight">
        <div class="row gap-3 wrap">
          ${subjectMark(s)}
          <div class="grow" style="min-width:180px">
            <div class="row wrap gap-2">
              <a class="strong" style="font-size:var(--fs-lg)" href="#/subject/${esc(s.id)}">${esc(s.name)}</a>
              ${s.code ? chip(s.code, "plain") : ""}
              ${sc.chaptersDone === sc.chapters && sc.chapters > 0 ? chip("subject complete", "ok") : ""}
            </div>
            <div class="xs faint">${chapters.length} chapters · ${sc.done}/${sc.leaves} board items · ${esc(fmtDuration(sp.minutes))} logged</div>
            <div class="mt-3">${bar(sc.pct, { cls: sc.pct === 100 ? "ok" : sc.pct > 0 ? "warn" : "bad" })}</div>
          </div>
          <div class="row gap-2">
            <span class="strong nowrap" style="font-variant-numeric:tabular-nums">${fmtPct(sc.pct)}</span>
            <button class="btn sm" data-act="open-toggle" data-key="${esc(key)}" aria-expanded="${open}">${open ? "▾ Hide" : "▸ Show"} chapters</button>
            <a class="btn sm ghost" href="#/subject/${esc(s.id)}">Open</a>
          </div>
        </div>
        ${open ? `<div class="stack mt-4">${chapters.length
          ? chapters.map((c) => chapterRow(c, ctx)).join("")
          : `<p class="small muted">No chapters yet.</p>`}</div>` : ""}
      </section>`;
    }).join("");

    return [head, next, toolbar, scopeNote(), sections].join("");
  },
};

function subjectSummaryOverall(ctx) {
  const { store } = ctx;
  const p = store.derived.progress;
  const selection = currentSelection(store);
  const scopes = scopedScopes(store);
  const chapters = visibleChapters(store);
  const subjects = visibleSubjects(store);
  const rev = chapters.reduce((a, c) => {
    const st = store.progressOf(c.id);
    if (st.leaves > 0 && st.done === st.leaves) {
      a.doneChapters += 1;
      if (!(st.passes > 0)) a.due += 1;
    }
    return a;
  }, { doneChapters: 0, due: 0 });
  const notes = filterBySubject(store, store.state.notes, (n) => n.subjectId);
  const openDoubts = notes.filter((n) => n.kind === "doubt" && n.doubtStatus !== "resolved").length;
  const doneChapters = selection ? rev.doneChapters : p.revision.doneChapters;
  const due = selection ? rev.due : p.revision.due.length;
  const doubts = selection ? openDoubts : p.doubts.open;
  return `<section class="card stripe" style="--stripe:var(--accent)">
    <div class="row wrap between gap-5">
      <div class="stack gap-2 grow" style="min-width:240px">
        <div class="eyebrow">My Syllabus · Plan</div>
        <h1 style="margin:0">Syllabus</h1>
        <div class="small muted">${fmtNum(subjects.length)} subjects · ${fmtNum(chapters.length)} chapters · ${fmtNum(scopes.board.leaves)} board-scope items</div>
        ${meter(scopes.board.pct, { label: "Board-scope completion" })}
        <div class="xs faint">${scopes.board.done} of ${scopes.board.leaves} board items ticked${scopes.internal.leaves ? ` · ${scopes.internal.leaves} internal` : ""}${scopes.optional.leaves ? ` · ${scopes.optional.leaves} optional` : ""}</div>
      </div>
      <div class="row wrap gap-5">
        <div class="metric"><div class="k">Fully done</div><div class="v">${doneChapters}</div><div class="s">chapters</div></div>
        <div class="metric"><div class="k">Awaiting revision</div><div class="v">${due}</div><div class="s">finished, never revised</div></div>
        <div class="metric"><div class="k">Open doubts</div><div class="v">${doubts}</div><div class="s">linked to chapters</div></div>
      </div>
    </div>
  </section>`;
}

/** A full-width "do this next" strip, sourced from the existing ranked suggestions. */
function continueCard(store) {
  const next = (store.derived.recommendations?.suggestions || [])
    .find((x) => x.chapterId && isVisibleSubject(store, x.subjectId));
  if (!next) return "";
  const subj = store.subject(next.subjectId);
  return `<section class="card tight syllabus-next">
    <div class="row wrap gap-3" style="align-items:center">
      ${subj ? subjectMark(subj) : ""}
      <div class="grow" style="min-width:200px">
        <div class="eyebrow" style="margin:0">Do this next</div>
        <div class="strong">${esc(next.title)}</div>
        <div class="xs muted">${next.subtitle ? esc(next.subtitle) : "From your own syllabus and plan"}${next.estMin ? ` · about ${esc(fmtDuration(next.estMin))}` : ""}</div>
      </div>
      <a class="btn primary" href="#/chapter/${esc(next.chapterId)}">Open chapter →</a>
      <a class="btn ghost" href="#/planner">Today's plan</a>
    </div>
  </section>`;
}
