/**
 * flashcards-view.js — Playful flip-card flashcard experience.
 *
 * Routes:
 *   #/flashcards?subject=...&chapter=...&difficulty=...&count=...   →  session filter
 *
 * Flow:
 *   1. User picks subject, chapter, difficulty and session size, then taps "Start session".
 *   2. One flip-card at a time: question on front, answer on back. Tap to flip.
 *   3. After flipping, rate: "I know it" / "Need revision".
 *   4. Shows progress bar, streak, points, chapter breakdown at end of session.
 *   5. At any stage, change subject/chapter/difficulty/count without restarting.
 *
 * All interactions wired through `data-act` (delegated by app.js).
 */

import { esc } from "../../../ui/dom.js?v=mwz1jos9";
import { sectionCard, emptyState, bar, chip, metricCard } from "../../../ui/components.js?v=mwz1jos9";
import { renderMath } from "../math/katex.js?v=mwz1jos9";
import {
  createFlashcardState, getCurrentCard, getProgressPct,
  isComplete, flipCard, prevCard, assessCard, saveSessionSummary,
} from "../logic/flashcard-flow.js?v=mwz1jos9";
import { ensureRevisionContent } from "../data/repository.js?v=mwz1jos9";
import {
  loadCatalogueIndex,
  loadChapterFlashcards,
  getSubjects,
  getChaptersForSubject,
  getChapterCounts,
} from "../data/catalogue.js?v=mwz1jos9";
import { currentUser } from "../../../core/supabase.js?v=mwz1jos9";

const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"];

/* ------------------------------------------------------------------ state -- */

let catalogueIndex = null;
let session = null;
let ready = false;
let loading = false;
let sessionStartTime = null;

/* --------------------------------------------------------------- render -- */

export default {
  id: "flashcards",
  title: "Flashcards",

  render(ctx) {
    const { store, route, toast } = ctx;
    const subjectId = route.query.get("subject") || "all";
    const chapterId = route.query.get("chapter") || "all";
    const difficulty = route.query.get("difficulty") || "all";

    if (!ready && !loading) {
      return emptyState({
        icon: "⏳",
        title: "Preparing your deck…",
        text: "Loading flashcards. Please wait a moment.",
        mood: "sleepy",
      });
    }

    /* ---- Picker: no session in progress ---------------------------- */
    if (!session) {
      const countParam = route.query.get("count") || "all";
      return renderPicker(ctx, subjectId, chapterId, difficulty, countParam);
    }

    const card = getCurrentCard(session);
    const pct = getProgressPct(session);

    if (isComplete(session)) {
      return renderResults(ctx, session);
    }

    const flipped = session.isFlipped;

    return [
      sectionCard({
        cls: "tight",
        body: `
          <div class="row wrap between gap-4">
            <div class="grow" style="min-width:240px">
              <div class="row wrap gap-2">
                <span class="eyebrow">Flashcards · Revision</span>
                <span class="chip soft">${session.stats.total} cards</span>
              </div>
              <h1 style="margin:6px 0">Flashcards</h1>
              <p class="small muted" style="margin:0">
                ${esc(subjectId !== "all" ? store.subject(subjectId)?.name || subjectId : "All subjects")}
                ${chapterId !== "all" ? ` · ${esc(session._chapterName || chapterId)}` : ""}
                ${difficulty !== "all" ? ` · ${esc(difficulty)}` : ""}
              </p>
            </div>
            <div class="row gap-2">
              <a class="btn sm ghost" href="#/revision">
                <span aria-hidden="true">←</span> Back to Revision Centre
              </a>
              <button class="btn ghost flex-1" data-act="fc-change-selection" type="button">
                <span aria-hidden="true">🔀</span> Change selection
              </button>
              ${subjectChips(subjectId, chapterId, store)}
            </div>
          </div>
          ${cardProgress(session.currentIndex + 1, session.stats.total, "Cards studied")}
        `,
      }),
      /* The flashcard — 3D flip card, question front / answer back. */
      sectionCard({
        cls: "tight card-table",
        body: `
          <div class="card-deck">
            <div class="study-card ${flipped ? "flipped" : ""}"
                 data-act="fc-flip"
                 role="button"
                 tabindex="0"
                 aria-label="${flipped ? "Turn the card back to question" : "Turn the card to see the answer"}"
                 aria-pressed="${flipped}">
              <div class="card-face card-front">
                <div class="card-meta row between gap-2 xs mb-3">
                  <span class="chip soft">Card ${session.currentIndex + 1}</span>
                  <span class="chip ${difficultyTone(card.difficulty)}">${esc(card.difficulty)}</span>
                  ${card.chapterName ? `<span class="chip soft">${esc(card.chapterName)}</span>` : ""}
                </div>
                <div class="card-prompt front-body" data-act="render-math">${esc(card.front)}</div>
                <div class="card-hint"><span class="chip soft">Tap or click to see the answer</span></div>
              </div>
              <div class="card-face card-back">
                <div class="card-meta row between gap-2 xs mb-3">
                  <span class="chip ok">Answer</span>
                  <span class="chip ${difficultyTone(card.difficulty)}">${esc(card.difficulty)}</span>
                </div>
                <div class="answer-label xs mb-2">Answer</div>
                <div class="card-answer back-body" data-act="render-math">${esc(card.back)}</div>
                ${card.source ? `<div class="card-source xs mt-3 faint">${esc(card.source)}</div>` : ""}
              </div>
            </div>
          </div>
          <div class="card-hint-bar">
            <span class="small faint">${flipped ? "The answer is face up — how did you do?" : "Read the card, then turn it over"}</span>
          </div>
        `,
      }),
      /* Assessment + navigation controls. */
      flipped
        ? sectionCard({
            cls: "tight card-actions",
            body: `
              <div class="card-verdict row wrap gap-2">
                <button class="btn flex-1 ok" data-act="fc-know-it" type="button">
                  <span aria-hidden="true">✓</span> I know it
                </button>
                <button class="btn flex-1 bad" data-act="fc-need-revision" type="button">
                  <span aria-hidden="true">!</span> Need revision
                </button>
              </div>
              <div class="row wrap gap-2 mt-3">
                <button class="btn ghost flex-1" data-act="fc-prev" type="button">
                  <span aria-hidden="true">◀</span> Previous
                </button>
                <button class="btn ghost flex-1" data-act="fc-shuffle" type="button">
                  <span aria-hidden="true">🔀</span> Shuffle remaining
                </button>
              </div>
            `,
          })
        : sectionCard({
            cls: "tight card-actions",
            body: `
              <div class="row wrap gap-2">
                <button class="btn ghost flex-1" data-act="fc-prev" type="button">
                  <span aria-hidden="true">◀</span> Previous
                </button>
                <button class="btn ghost flex-1" data-act="fc-shuffle" type="button">
                  <span aria-hidden="true">🔀</span> Shuffle remaining
                </button>
                <button class="btn primary flex-1" data-act="fc-flip" type="button">
                  See answer <span aria-hidden="true">▶</span>
                </button>
              </div>
            `,
          }),
    ].join("");
  },

  async mount(ctx) {
    if (ready) {
      renderMath(document.getElementById("main"));
      return;
    }

    loading = true;
    try {
      const { store, route, toast } = ctx;
      await ensureRevisionContent();

      // Load per-chapter counts from Supabase for the picker. If it fails, the
      // session start falls back to fetching the full chapter deck directly.
      catalogueIndex = await loadCatalogueIndex();

      const subjectId = route.query.get("subject") || "all";
      const chapterId = route.query.get("chapter") || "all";
      if (session && session.subjectId === subjectId && session.chapterId === chapterId) {
        // resume existing session
      } else {
        session = null;
      }
      ready = true;
    } catch (err) {
      console.error("[revision] flashcards init failed", err);
      toast("Failed to load flashcards. Please try again.", "err");
    } finally {
      loading = false;
    }

    renderMath(document.getElementById("main"));
    ctx.rerender();
  },
};

/* --------------------------------------------------------------- actions -- */

export const ACTIONS = {
  "fc-change-selection": (el, ctx) => {
    session = null;
    sessionStartTime = null;
    ctx.rerender();
  },

  "fc-filter-change": (el, ctx) => {
    const subjectSelect = document.getElementById("fc-subject");
    const chapterSelect = document.getElementById("fc-chapter");
    const difficultySelect = document.getElementById("fc-difficulty");
    const countSelect = document.getElementById("fc-count");
    const subject = subjectSelect?.value || "all";
    const isSubjectChange = el?.dataset?.filter === "subject";
    // A chapter belongs to exactly one subject, so switching subject must clear
    // the chapter — otherwise the old chapter filters the new subject to zero.
    const chapter = isSubjectChange ? "all" : (chapterSelect?.value || "all");
    const diff = difficultySelect?.value || "all";
    const count = countSelect?.value || "all";
    const params = new URLSearchParams({ subject, chapter, difficulty: diff, count });
    // Replace the URL instead of assigning location.hash: a hashchange render is
    // treated as navigation and scrolls the page to the top, which is the visible
    // "jump" glitch while picking from the dropdown.
    try { history.replaceState(null, "", `#/flashcards?${params.toString()}`); }
    catch { window.location.hash = `#/flashcards?${params.toString()}`; }
    // Keep the live route in sync so "Start session" reads the newest choices
    // even when we skip a re-render.
    ctx.route = { ...ctx.route, query: params };
    session = null;
    // Only a subject change alters the picker (its chapter list and counts).
    // Re-rendering on every change destroyed the open <select> mid-interaction —
    // that was the dropdown flicker. Defer even this so the native dropdown can
    // close before the DOM is replaced.
    if (isSubjectChange) setTimeout(() => ctx.rerender(), 0);
  },

  "fc-start-session": async (el, ctx) => {
    if (session && isComplete(session)) {
      await saveSessionSummary(session, {
        userId: currentUser()?.id || null,
        subjectId: session.subjectId,
        chapterId: session.chapterId,
      }).catch(() => {});
    }
    const { route, store, toast } = ctx;
    const subjectId = route.query.get("subject") || "all";
    const chapterId = route.query.get("chapter") || "all";
    const difficulty = route.query.get("difficulty") || "all";
    const countParam = route.query.get("count") || "all";

    let deck = [];

    if (chapterId !== "all") {
      // Fetch only this chapter's cards from Supabase instead of all 9,180.
      const chapterCards = await loadChapterFlashcards(chapterId);
      deck = (chapterCards || []).filter((c) => difficulty === "all" || c.difficulty === difficulty);
      if (subjectId !== "all") deck = deck.filter((c) => c.subjectId === subjectId);
    }

    if (!deck.length) {
      ctx.toast("No cards match your selection.", "info");
      return;
    }

    // Apply session size limit
    let sessionCount = deck.length;
    if (countParam && countParam !== "all") {
      const n = Number(countParam);
      if (!isNaN(n) && n > 0 && n < deck.length) {
        sessionCount = n;
        deck = deck.slice(0, n);
      }
    }

    const chapterName = deck[0]?.chapterName || (chapterId !== "all" ? chapterId : "");
    session = createFlashcardState(deck, {
      userId: currentUser()?.id || null,
      subjectId: subjectId === "all" ? null : subjectId,
      chapterId: chapterId === "all" ? null : chapterId,
    });
    session._chapterName = chapterName;
    session._subjectId = subjectId;
    session._chapterId = chapterId;
    sessionStartTime = Date.now();
    ctx.rerender();
  },

  "fc-flip": (el, ctx) => {
    if (!session) return;
    session = flipCard(session);
    ctx.rerender();
  },

  "fc-know-it": async (el, ctx) => {
    if (!session) return;
    session = await assessCard(session, "knowIt");
    ctx.rerender();
  },

  "fc-need-revision": async (el, ctx) => {
    if (!session) return;
    session = await assessCard(session, "needPractice");
    ctx.rerender();
  },

  "fc-next": async (el, ctx) => {
    if (!session) return;
    session = await assessCard(session, "needPractice");
    ctx.rerender();
  },

  "fc-prev": (el, ctx) => {
    if (!session) return;
    session = prevCard(session);
    ctx.rerender();
  },

  "fc-shuffle": (el, ctx) => {
    if (!session) return;
    const studied = session.cards.slice(0, session.currentIndex);
    const remaining = session.cards.slice(session.currentIndex).sort(() => Math.random() - 0.5);
    session = { ...session, cards: [...studied, ...remaining], isFlipped: false };
    ctx.rerender();
  },

  "fc-restart": async (el, ctx) => {
    if (session && isComplete(session)) {
      await saveSessionSummary(session, {
        userId: currentUser()?.id || null,
        subjectId: session.subjectId,
        chapterId: session.chapterId,
      }).catch(() => {});
    }
    session = null;
    sessionStartTime = null;
    ctx.rerender();
  },
};

/* --------------------------------------------------------------- picker -- */

function renderPicker(ctx, subjectId, chapterId, difficulty, countParam) {
  const { store } = ctx;

  // Use the static catalogue index (tiny download) instead of holding all
  // 9,180 cards in memory just to build the picker dropdowns.
  const subjects = getSubjects(catalogueIndex)
    .map((s) => ({ id: s.id, name: store.subject(s.id)?.name || s.id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeSubject =
    subjectId !== "all" && subjects.some((s) => s.id === subjectId) ? subjectId : "all";

  let chapters = [];
  if (activeSubject !== "all") {
    chapters = getChaptersForSubject(catalogueIndex, activeSubject);
  }
  const chapterCount = chapters.length;

  // Total card count for the active subject (or all subjects).
  let totalCards = 0;
  if (activeSubject !== "all") {
    for (const c of chapters) {
      totalCards += getChapterCounts(catalogueIndex, c.id).flashcards;
    }
  } else {
    for (const s of subjects) {
      for (const c of getChaptersForSubject(catalogueIndex, s.id)) {
        totalCards += getChapterCounts(catalogueIndex, c.id).flashcards;
      }
    }
  }

  // A chapter that is not part of the active subject can never match; show "All".
  const activeChapter = chapterId !== "all" && chapters.some((c) => c.id === chapterId) ? chapterId : "all";

  return [
    sectionCard({
      cls: "tight",
      body: `
        <div class="row wrap between gap-4">
          <div class="grow" style="min-width:240px">
            <div class="row wrap gap-2">
              <span class="eyebrow">Flashcards · Choose your deck</span>
              <span class="chip soft">${totalCards.toLocaleString()} cards total</span>
            </div>
            <h1 style="margin:6px 0">Pick a subject &amp; chapter</h1>
            <p class="small muted" style="margin:0">Study exactly what you want — only the chapter you pick is downloaded.</p>
          </div>
          <div class="row gap-2">
            <a class="btn sm ghost" href="#/revision" style="margin-left:auto">
              <span aria-hidden="true">←</span> Back to Revision Centre
            </a>
          </div>
        </div>
      `,
    }),
    sectionCard({
      cls: "tight gamified-card",
      body: `
        <div class="stack gap-3">
          <div class="row wrap gap-3">
            <div class="field grow" style="min-width:200px">
              <label for="fc-subject">Subject</label>
              <select class="select" id="fc-subject" data-act="fc-filter-change" data-filter="subject">
                <option value="all"${activeSubject === "all" ? " selected" : ""}>All subjects</option>
                ${subjects.map((s) =>
                  `<option value="${esc(s.id)}"${activeSubject === s.id ? " selected" : ""}>${esc(s.name)}</option>`
                ).join("")}
              </select>
            </div>
            <div class="field grow" style="min-width:200px">
              <label for="fc-chapter">Chapter</label>
              <select class="select" id="fc-chapter" data-act="fc-filter-change" data-filter="chapter">
                <option value="all"${activeChapter === "all" ? " selected" : ""}>All ${chapterCount} chapters</option>
                ${chapters.map((c) =>
                  `<option value="${esc(c.id)}"${activeChapter === c.id ? " selected" : ""}>${esc(c.name)}</option>`
                ).join("")}
              </select>
              <div class="field-hint">${totalCards} card${totalCards !== 1 ? "s" : ""} available.</div>
            </div>
            <div class="field grow" style="min-width:160px">
              <label for="fc-difficulty">Difficulty</label>
              <select class="select" id="fc-difficulty" data-act="fc-filter-change" data-filter="difficulty">
                <option value="all"${difficulty === "all" ? " selected" : ""}>All difficulties</option>
                ${DIFFICULTY_LEVELS.map(d => `
                  <option value="${esc(d)}"${difficulty === d ? " selected" : ""}>${esc(d)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field grow" style="min-width:160px">
              <label for="fc-count">Cards per session</label>
              <select class="select" id="fc-count" data-act="fc-filter-change" data-filter="count">
                <option value="all"${countParam === "all" ? " selected" : ""}>All available</option>
                <option value="5"${countParam === "5" ? " selected" : ""}>5 cards</option>
                <option value="10"${countParam === "10" ? " selected" : ""}>10 cards</option>
                <option value="20"${countParam === "20" ? " selected" : ""}>20 cards</option>
                <option value="50"${countParam === "50" ? " selected" : ""}>50 cards</option>
              </select>
            </div>
          </div>
          <div class="row gap-2">
            <button class="btn primary flex-1" data-act="fc-start-session" type="button">
              <span aria-hidden="true">▶</span> Start session
            </button>
            <button class="btn ghost flex-1" data-act="fc-restart" type="button">Reset choice</button>
          </div>
        </div>
      `,
    }),
  ].join("");
}

/* -------------------------------------------------------------- results -- */

function renderResults(ctx, session) {
  const { store } = ctx;
  const stats = session.stats;
  const attempted = stats.studied;
  const known = stats.mastered;
  const needRevision = stats.needingPractice;
  const markedReview = stats.markedReview;
  const total = stats.total;
  const accuracy = attempted > 0 ? Math.round((known / attempted) * 100) : 0;
  const timeTakenMs = sessionStartTime ? Date.now() - sessionStartTime : 0;
  const timeTaken = fmtTime(timeTakenMs);

  const sessionPoints = known * 10 + needRevision * 2;
  const gamification = store.derived?.gamification || {};
  const streak = gamification.streak?.current ?? store.state.settings.streakDays ?? 0;
  const totalPoints = gamification.points ?? 0;
  const level = gamification.level?.level ?? 1;

  const byChapter = {};
  const cardById = new Map((session?.cards || []).map((c) => [c.id, c]));
  for (const h of stats.history) {
    const card = cardById.get(h.cardId);
    if (!card) continue;
    const bucket = byChapter[card.chapterName || "Unknown chapter"] || { known: 0, need: 0, total: 0 };
    bucket.total += 1;
    if (h.action === "knowIt") bucket.known += 1;
    else bucket.need += 1;
    byChapter[card.chapterName || "Unknown chapter"] = bucket;
  }
  const chaptersDone = Object.entries(byChapter).sort((a, b) => b[1].total - a[1].total).slice(0, 6);

  const sessionBadges = [];
  if (attempted >= 1) sessionBadges.push({ title: "First steps", text: `${attempted} card${attempted === 1 ? "" : "s"} studied`, icon: "🃏" });
  if (accuracy === 100 && attempted >= 5) sessionBadges.push({ title: "Perfect deck", text: "100% accuracy", icon: "⭐" });
  if (accuracy >= 80 && attempted >= 5) sessionBadges.push({ title: "Sharp", text: `${accuracy}% accuracy`, icon: "🔥" });
  if (known >= 10) sessionBadges.push({ title: "Card collector", text: `${known} cards known`, icon: "🏆" });
  if (timeTakenMs > 0 && timeTakenMs / attempted < 15000 && attempted >= 5) sessionBadges.push({ title: "Quick recall", text: "Fast responses", icon: "⚡" });

  const subjectId = session._subjectId || null;
  const chapterId = session._chapterId || null;

  return [
    sectionCard({
      cls: "tight gamified-card",
      body: `
        <div class="row wrap between gap-4">
          <div class="grow" style="min-width:240px">
            <div class="row wrap gap-2">
              <span class="eyebrow">Flashcards · Session complete</span>
              <span class="chip ${accuracy >= 80 ? "ok" : accuracy >= 50 ? "warn" : "bad"}">${accuracy}% accuracy</span>
            </div>
            <h1 style="margin:6px 0">Deck complete</h1>
            <p class="small muted" style="margin:0">You studied ${attempted} of ${total} cards.</p>
          </div>
          <div class="row gap-2">
            <button class="btn primary" data-act="fc-restart" type="button">Start new session</button>
          </div>
        </div>
        ${cardProgress(attempted, total, "Overall progress")}
      `,
    }),
    sectionCard({
      cls: "tight",
      title: "Your results",
      subtitle: "Calculated from your real activity in this session.",
      body: `
        <div class="metrics">
          ${metricCard({ k: "Cards studied", v: attempted, s: "of " + total })}
          ${metricCard({ k: "Known ✓", v: known, s: "mastered", tone: "ok" })}
          ${metricCard({ k: "Need revision", v: needRevision, s: "flagged", tone: "warn" })}
          ${metricCard({ k: "Marked review", v: markedReview, s: "to check", tone: "plain" })}
          ${metricCard({ k: "Accuracy", v: accuracy + "%", s: known + " / " + attempted, tone: accuracy >= 80 ? "ok" : "warn" })}
          ${metricCard({ k: "Time taken", v: timeTaken, s: "this session" })}
          ${metricCard({ k: "Points earned", v: sessionPoints, s: "+${sessionPoints} this session", tone: "ok" })}
          ${metricCard({ k: "Total points", v: totalPoints, s: "your lifetime total", tone: "accent" })}
        </div>
      `,
    }),
    sectionCard({
      cls: "tight",
      title: "Streak & level",
      subtitle: "Your overall progress across the app.",
      body: `
        <div class="row wrap gap-3">
          <div class="flex-1 streak-card">
            <div class="xs muted">Current streak</div>
            <div class="row gap-2 mt-1"><span class="streak-emoji">🔥</span><span class="streak-val mono strong">${streak} day${streak === 1 ? "" : "s"}</span></div>
            <div class="xs faint mt-2">Keep it going — study tomorrow.</div>
          </div>
          <div class="flex-1 level-card">
            <div class="xs muted">Level</div>
            <div class="row gap-2 mt-1"><span class="level-badge">${level}</span><span class="xs muted">${gamification.level?.title || ""}</span></div>
            <div class="xs faint mt-2">${totalPoints} lifetime points earned.</div>
          </div>
        </div>
      `,
    }),
    sessionBadges.length
      ? sectionCard({
          cls: "tight",
          title: "Session achievements",
          subtitle: "Badges earned in this session.",
          body: `<div class="row wrap gap-3">
            ${sessionBadges.map((b) => `
              <div class="achievement">
                <div class="achievement-icon">${b.icon}</div>
                <div><div class="achievement-title strong">${esc(b.title)}</div><div class="achievement-text xs faint">${esc(b.text)}</div></div>
              </div>
            `).join("")}
          </div>`,
        })
      : "",
    chaptersDone.length
      ? sectionCard({
          cls: "tight",
          title: "Chapter performance",
          subtitle: "Where you're strong and what needs more revision.",
          body: `<div class="stack gap-2">
            ${chaptersDone.map(([name, b]) => {
              const acc = b.total > 0 ? Math.round((b.known / b.total) * 100) : 0;
              const tone = acc >= 80 ? "ok" : acc >= 50 ? "warn" : "bad";
              return `
                <div class="chapter-row row between gap-2">
                  <div class="grow truncate" style="max-width:220px">${esc(name)}</div>
                  <div class="row gap-2">
                    <span class="chip ${tone}">${acc}%</span>
                    <span class="small faint">${b.known} ✓ · ${b.need} ↗</span>
                  </div>
                </div>
                ${bar(acc, { thin: true, cls: tone })}
              `;
            }).join("")}
          </div>`,
        })
      : "",
    sectionCard({
      cls: "tight",
      title: "What's next",
      body: `
        <div class="row gap-2">
          <button class="btn primary flex-1" data-act="fc-restart" type="button">Start new session</button>
          <a class="btn ghost flex-1" href="#/flashcards?subject=${esc(subjectId || "all")}&chapter=${esc(chapterId || "all")}">Retry same selection</a>
        </div>
      `,
    }),
  ].join("");
}

/* -------------------------------------------------------------- helpers -- */

function subjectChips(subjectId, chapterId, store) {
  const subj = subjectId === "all" ? null : store.subject(subjectId);
  const subjName = subj ? esc(subj.name) : "All subjects";
  const chap = chapterId === "all" ? "" : ` · ${esc(session && session._chapterName ? session._chapterName : chapterId)}`;
  return `<span class="chip acc">${subjName}${chap}</span>`;
}

function difficultyTone(d) {
  switch (String(d)) {
    case "Easy": return "ok";
    case "Hard": return "bad";
    default: return "warn";
  }
}

function cardProgress(current, total, label) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return `<div class="card-progress" style="margin:var(--sp-3) 0">
    <div class="row between gap-2 xs">
      <span class="small strong">${esc(label || "Progress")}</span>
      <span class="small faint">${current} / ${total}</span>
    </div>
    <div class="card-bar">
      <span style="width:${pct}%"></span>
    </div>
  </div>`;
}

function fmtTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return m ? `${m}:${pad(s)} min` : `${pad(s)}s`;
}
