/**
 * revision.js — Revision Centre view.
 *
 * Tabbed interface with three sub-sections:
 *   · Revision Ladder (existing chapter-based revision schedule)
 *   · Flashcards (one-at-a-time flashcard learning)
 *   · Practice Questions (one-at-a-time question practice)
 *
 * Routes:
 *   #/revision                → Revision Centre home
 *   #/flashcards              → Flashcard learning interface
 *   #/practice-questions      → Practice Questions interface
 */

import { esc, fmtNum } from "../dom.js?v=mwz8hppl";
import { bar, chip, emptyState, metricCard, sectionCard, subjectMark, deadlineChip } from "../components.js?v=mwz8hppl";
import { addDays, fmtDuration, fmtShort, diffDays, relative, todayISO } from "../../core/dates.js?v=mwz8hppl";
import { visibleChapters, filterBySubject, revisionSubjectId } from "../selection.js?v=mwz8hppl";
import { REVISION_LADDER_DAYS } from "../../core/constants.js?v=mwz8hppl";

/** The researched ladder: gaps between consecutive revision rounds. */
const NEXT_GAP_DAYS = REVISION_LADDER_DAYS;

function nextRevisionDate(lastISO, passes) {
  if (!lastISO) return null;
  const gap = NEXT_GAP_DAYS[Math.min(Math.max(passes, 1), NEXT_GAP_DAYS.length) - 1];
  return addDays(lastISO, gap);
}

/* ---------------------------------------------------------------- render -- */

export default {
  id: "revision",
  title: "Revision Center",

  render(ctx) {
    const { store, ui, route } = ctx;
    const activeTab = route.name === "flashcards" ? "flashcards" : route.name === "practice-questions" ? "questions" : "ladder";

    /* --- Revision Centre home --------------------------------------- */
    const p = store.derived.progress;
    const chapters = visibleChapters(store).filter((c) => (c.scope || "board") === "board");

    /* queue 1 — finished, never revised */
    const neverRevised = chapters
      .map((c) => ({ c, st: store.progressOf(c.id) }))
      .filter((x) => x.st.leaves > 0 && x.st.done === x.st.leaves && x.st.passes === 0)
      .sort((a, b) => String(a.st.lastRevision || "9999").localeCompare(String(b.st.lastRevision || "9999")) || a.c.order - b.c.order);

    /* queue 2 — revised at least once, keep the ladder going */
    const scheduled = chapters
      .map((c) => ({ c, st: store.progressOf(c.id) }))
      .filter((x) => x.st.passes >= 1)
      .map((x) => {
        const due = nextRevisionDate(x.st.lastRevision, x.st.passes);
        return { ...x, due, dueIn: due ? diffDays(todayISO(), due) : null };
      })
      .sort((a, b) => (a.dueIn ?? 999) - (b.dueIn ?? 999));
    const overdue = scheduled.filter((x) => x.dueIn !== null && x.dueIn < 0);
    const dueNow = scheduled.filter((x) => x.dueIn !== null && x.dueIn >= 0 && x.dueIn <= 3);

    /* queue 3 — open doubts on finished or advanced chapters */
    const doubtChapters = chapters
      .map((c) => ({ c, st: store.progressOf(c.id) }))
      .filter((x) => x.st.doubt)
      .sort((a, b) => b.st.done - a.st.done);

    const allRevs = filterBySubject(store, store.state.revisions, (r) => revisionSubjectId(store, r))
      .sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)));

    /* Flashcard + question quick stats (from IndexedDB) */
    const fcStats = getFlashcardQuickStats(store);
    const qStats = getQuestionQuickStats(store);

    const tabStrip = `<div class="tabs">
      <a href="#/revision" class="tab ${activeTab === "ladder" ? "active" : ""}">Revision Ladder</a>
      <a href="#/flashcards" class="tab ${activeTab === "flashcards" ? "active" : ""}">Flashcards <span class="count">${fcStats.due}</span></a>
      <a href="#/practice-questions" class="tab ${activeTab === "questions" ? "active" : ""}">Practice Questions <span class="count">${qStats.attempted}</span></a>
    </div>`;

    const head = `<section class="card stripe" style="--stripe:var(--warn)">
      <div class="row wrap between gap-4">
        <div class="grow" style="min-width:250px">
          <div class="row wrap gap-2"><span class="eyebrow">Revision Centre</span>
            <span class="chip soft">CBSE Class 10 · 2026–27</span></div>
          <h1 style="margin:6px 0">Revision Center</h1>
          <p class="small muted" style="margin:0">Revise chapters, practise with flashcards and questions, track your progress.</p>
        </div>
        <div class="row wrap gap-2">
          <a class="btn primary" href="#/flashcards">${fcStats.due ? `Review ${fcStats.due} due card${fcStats.due === 1 ? "" : "s"}` : "Open flashcards"}</a>
          <a class="btn" href="#/practice-questions">Practise questions</a>
        </div>
      </div>
    </section>`;

    /* One honest next step, chosen from the queues the page already computed. */
    const startItem = overdue[0] || neverRevised[0] || dueNow[0] || null;
    const startCard = startItem ? `<section class="card tight revision-start">
      <div class="row wrap gap-3" style="align-items:center">
        ${subjectMark(store.subject(startItem.c.subjectId))}
        <div class="grow" style="min-width:200px">
          <div class="eyebrow" style="margin:0">Do this next</div>
          <div class="strong">${esc(startItem.c.name)}</div>
          <div class="xs muted">${overdue[0] ? `Overdue on the ladder${overdue[0].due ? ` · due ${esc(fmtShort(overdue[0].due))}` : ""}` : neverRevised[0] ? "Finished, never revised — the highest-value pass" : "Coming up on the ladder"}</div>
        </div>
        <div class="row wrap gap-2">
          <button class="btn primary" data-act="revision-add" data-chapter="${esc(startItem.c.id)}">＋ Record revision</button>
          <a class="btn ghost" href="#/chapter/${esc(startItem.c.id)}">Open chapter</a>
        </div>
      </div>
    </section>` : "";

    const stats = `<div class="metrics">
      ${metricCard({ k: "Awaiting first revision", v: fmtNum(neverRevised.length), s: "finished, never revised", tone: neverRevised.length ? "warn" : "ok" })}
      ${metricCard({ k: "Overdue on the ladder", v: fmtNum(overdue.length), s: overdue.length ? `oldest ${esc(relative(overdue[0].due, ui.today))}` : "nothing overdue", tone: overdue.length ? "bad" : "ok" })}
      ${metricCard({ k: "Due in the next 3 days", v: fmtNum(dueNow.length), s: "scheduled by the gaps" })}
      ${metricCard({ k: "Flashcards due", v: fmtNum(fcStats.due), s: "ready for review", tone: fcStats.due ? "warn" : "ok", href: "#/flashcards" })}
      ${metricCard({ k: "Questions practised", v: fmtNum(qStats.attempted), s: `${qStats.accuracy}% accuracy`, tone: qStats.accuracy >= 60 ? "ok" : "warn", href: "#/practice-questions" })}
    </div>`;

    const q1 = sectionCard({
      title: "1 · First revision pending",
      subtitle: "Finished chapters that have never been revised. Revise within the same week the block ends.",
      body: neverRevised.length
        ? `<div class="stack gap-2">${neverRevised.map(({ c, st }) => revRow(c, st, ctx, { due: null })).join("")}</div>`
        : emptyState({ icon: "✅", title: "Nothing waiting for a first revision", text: "Either every finished chapter has been revised, or nothing is finished yet.", mood: "cheer" }),
    });

    const q2 = sectionCard({
      title: "2 · Ladder schedule",
      subtitle: "Chapters already revised, with the next round computed from the revision gaps",
      body: scheduled.length
        ? `<div class="stack gap-2">${scheduled.slice(0, 40).map(({ c, st, due, dueIn }) => revRow(c, st, ctx, { due, dueIn })).join("")}</div>`
        : `<p class="small muted">No revision passes recorded yet — the first queue is where you start.</p>`,
    });

    const q3 = sectionCard({
      title: "3 · Doubts to clear before the next pass",
      subtitle: "A chapter with an open doubt is not really revised",
      body: doubtChapters.length
        ? `<div class="stack gap-2">${doubtChapters.map(({ c, st }) => revRow(c, st, ctx, { doubt: true })).join("")}</div>`
        : `<p class="small muted">No open doubts linked to board chapters.</p>`,
    });

    const history = sectionCard({
      title: "Revision history",
      subtitle: `${allRevs.length} record${allRevs.length === 1 ? "" : "s"} · newest first`,
      body: allRevs.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Pass</th><th>Chapter / item</th><th>Self-score</th><th>Notes</th><th></th></tr></thead>
            <tbody>${allRevs.slice(0, 200).map((r) => {
              const ch = r.chapterId ? store.chapter(r.chapterId) : null;
              const node = r.targetType === "node" ? store.node(r.targetId) : null;
              const subj = r.subjectId ? store.subject(r.subjectId) : null;
              return `<tr>
                <td class="nowrap">${esc(r.dateISO)}</td>
                <td><span class="badge ${r.pass >= 2 ? "green" : "blue"}">R${esc(r.pass)}</span></td>
                <td>${subj ? `<span class="xs muted">${esc(subj.short)} · </span>` : ""}${ch ? `<a href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>` : "—"}${node ? ` <span class="xs faint">› ${esc(node.name)}</span>` : ""}</td>
                <td>${r.score === null || r.score === undefined ? "—" : `${esc(r.score)}/5`}</td>
                <td class="small">${esc(r.notes || "")}</td>
                <td class="right"><button class="btn sm ghost" data-act="revision-delete" data-id="${esc(r.id)}" title="Delete">🗑</button></td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>`
        : `<p class="small muted">No revisions recorded yet.</p>`,
    });

    return [
      head,
      startCard,
      tabStrip,
      stats,
      q1,
      q2,
      q3,
      history,
    ].join("");
  },
};

/* --------------------------------------------------------------- helpers --- */

function revRow(ch, st, ctx, { due = null, dueIn = null, doubt = false } = {}) {
  const subject = ctx.store.subject(ch.subjectId);
  const status = dueIn === null ? null : dueIn < 0 ? "overdue" : dueIn <= 3 ? "soon" : "upcoming";
  return `<div class="list-item flat ${status === "overdue" ? "overdue" : status === "soon" ? "soon" : ""}" style="padding:var(--sp-3)">
    ${subjectMark(subject)}
    <div class="grow">
      <div class="row wrap gap-2">
        <a class="strong" href="#/chapter/${esc(ch.id)}">${esc(ch.name)}</a>
        <span class="chip soft">${esc(subject?.short || "")}</span>
        ${st.passes ? chip(`R${st.passes} done`, st.passes >= 2 ? "ok" : "warn") : chip("never revised", "bad")}
        ${st.lastRevision ? `<span class="chip plain">last ${esc(fmtShort(st.lastRevision))}</span>` : ""}
        ${due ? `<span class="chip ${status === "overdue" ? "bad" : status === "soon" ? "warn" : "soft"}">next due ${esc(fmtShort(due))} · ${esc(relative(due, ctx.today))}</span>` : ""}
        ${ch.deadline ? deadlineChip(ch.deadline, ctx.today) : ""}
        ${doubt ? chip("doubt open", "bad") : ""}
      </div>
      <div class="mt-3">${bar(st.pct, { thin: true, cls: st.pct === 100 ? "ok" : "warn" })}</div>
      <div class="xs faint mt-2">${st.done}/${st.leaves} items · ${esc(fmtDuration(st.minutes))} studied${ch.nextAction ? ` · next: ${esc(ch.nextAction)}` : ""}</div>
    </div>
    <div class="row gap-2">
      <button class="btn sm primary" data-act="revision-add" data-chapter="${esc(ch.id)}">＋ Record revision</button>
      <a class="btn sm ghost" href="#/chapter/${esc(ch.id)}">Open</a>
    </div>
  </div>`;
}

/** Quick stats for flashcards (reads from store state, already in memory). */
function getFlashcardQuickStats(store) {
  try {
    const progress = store.state.flashcardProgress || [];
    const now = new Date().toISOString();
    const due = progress.filter((p) => !p.nextReviewAt || p.nextReviewAt <= now).length;
    return { due };
  } catch { return { due: 0 }; }
}

/** Quick stats for questions (reads from store state, already in memory). */
function getQuestionQuickStats(store) {
  try {
    const attempts = store.state.questionAttempts || [];
    const attempted = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect === 1).length;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return { attempted, accuracy };
  } catch { return { attempted: 0, accuracy: 0 }; }
}
