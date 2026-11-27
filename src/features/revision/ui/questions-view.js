/**
 * questions-view.js — Gamified practice question experience with flashcard-style flip UI.
 *
 * Routes:
 *   #/practice-questions?subject=...&chapter=...&difficulty=...&count=...   →  session filter
 *
 * Flow (flashcard-like):
 *   1. User picks subject, chapter, difficulty and session size, then taps "Start session".
 *   2. One flip-card at a time: question on front face.
 *   3. Tap "Reveal answer" → card flips 3D to show answer on back face.
 *   4. After reveal, three big verdict buttons appear: "I knew it" / "I did not know" / "Skip".
 *   5. Clicking any verdict auto-advances to the next question.
 *   6. Score, streak and accuracy pills show live at the top.
 *   7. End of deck → performance summary with points, streak, achievements, chapter breakdown.
 *   8. Change subject/chapter/difficulty/count anytime without restarting the app.
 *
 * All interactions wired through `data-act` (delegated by app.js).
 */

import { esc } from "../../../ui/dom.js?v=mwz8hppl";
import { sectionCard, emptyState, bar, chip, metricCard } from "../../../ui/components.js?v=mwz8hppl";
import { renderMath } from "../math/katex.js?v=mwz8hppl";
import {
  createQuestionState, getCurrentQuestion, getCurrentAnswer, getProgressPct,
  isComplete, recordMastery, revealAnswer, nextQuestion,
  prevQuestion, skipQuestion, getResults, saveSessionSummary, recordTimeSpent,
} from "../logic/question-flow.js?v=mwz8hppl";
import { ensureRevisionContent } from "../data/repository.js?v=mwz8hppl";
import {
  loadCatalogueIndex,
  loadChapterQuestions,
  getSubjects,
  getChaptersForSubject,
  getChapterCounts,
} from "../data/catalogue.js?v=mwz8hppl";
import { currentUser } from "../../../core/supabase.js?v=mwz8hppl";

const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"];

/* ------------------------------------------------------------------ state -- */

let catalogueIndex = null;
let session = null;
let ready = false;
let loading = false;
let questionStartTime = null;
let streak = 0;

/** Wall-clock seconds spent on the current question. */
function elapsedSeconds() {
  return questionStartTime ? Math.round((Date.now() - questionStartTime) / 1000) : 0;
}

/**
 * Move to the next question and carry the time spent on this one into the
 * session total, so the saved session summary has a real duration.
 */
function advanceQuestion(state) {
  const next = nextQuestion(state);
  const spent = elapsedSeconds();
  questionStartTime = Date.now();
  return recordTimeSpent(next, spent);
}

/* --------------------------------------------------------------- render -- */

export default {
  id: "practiceQuestions",
  title: "Practice Questions",

  render(ctx) {
    const { store, route } = ctx;
    const subjectId = route.query.get("subject") || "all";
    const chapterId = route.query.get("chapter") || "all";
    const difficulty = route.query.get("difficulty") || "all";

    if (!ready && !loading) {
      return emptyState({
        icon: "⏳",
        title: "Preparing your question set…",
        text: "Loading practice questions. Please wait a moment.",
        mood: "sleepy",
      });
    }

    /* ---- Picker: no session in progress ---------------------------- */
    if (!session) {
      return renderPicker(ctx, subjectId, chapterId, difficulty, route.query.get("count") || "all");
    }

    const q = getCurrentQuestion(session);
    const pct = getProgressPct(session);

    if (isComplete(session)) {
      return renderResults(ctx, session);
    }

    const answer = getCurrentAnswer(session);
    const revealed = answer?.revealed || false;
    const isCorrect = answer?.isCorrect === 1;

    return [
      sectionCard({
        cls: "tight",
        body: `
          <div class="row wrap between gap-4">
            <div class="grow" style="min-width:240px">
              <div class="row wrap gap-2">
                <span class="eyebrow">Practice Questions · Revision</span>
                <span class="chip soft">${session.stats.total} questions</span>
              </div>
              <h1 style="margin:6px 0">Practice Questions</h1>
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
              <button class="btn ghost flex-1" data-act="qc-change-selection" type="button">
                <span aria-hidden="true">🔀</span> Change selection
              </button>
              ${subjectChips(subjectId, chapterId, store)}
            </div>
          </div>
          ${cardProgress(session.currentIndex + 1, session.stats.total, "Questions studied")}
        `,
      }),
      /* The magic-reveal card — deliberately different from the flashcard
         flip: a glowing panel that expands in place to reveal the answer.
         Long answers wrap and the panel scrolls instead of overflowing. */
      sectionCard({
        cls: "tight card-table pq-table",
        body: `
          <div class="pq-deck">
            <div class="pq-card ${revealed ? "is-revealed" : ""}"
                 data-act="qc-flip"
                 role="button"
                 tabindex="0"
                 aria-label="${revealed ? "Answer revealed" : "Tap to reveal the answer"}"
                 aria-pressed="${revealed}">
              <span class="pq-spark" aria-hidden="true"></span>
              <div class="card-meta row between gap-2 xs mb-3">
                <span class="chip soft">Question ${session.currentIndex + 1}</span>
                <span class="chip ${difficultyTone(q.difficulty)}">${esc(q.difficulty)}</span>
                ${q.chapterName ? `<span class="chip soft">${esc(q.chapterName)}</span>` : ""}
              </div>
              <div class="pq-prompt">${esc(q.prompt)}</div>
              <div class="pq-reveal-hint">
                <span class="pq-reveal-pill">${revealed ? "✨ Answer revealed" : "✨ Tap to reveal the answer"}</span>
              </div>
              <div class="pq-answer">
                <div class="pq-answer-clip">
                  <div class="answer-label xs mb-2">Answer</div>
                  <div class="pq-answer-body">${esc(q.answer || "")}</div>
                  ${q.explanation ? `<div class="pq-explanation"><div class="xs strong">Explanation</div><div>${esc(q.explanation)}</div></div>` : ""}
                </div>
              </div>
            </div>
          </div>
          <div class="card-hint-bar">
            <span class="small faint">${revealed ? "The answer is revealed — how did you do?" : "Read the question, then tap to reveal the answer"}</span>
          </div>
        `,
      }),
      /* Assessment + navigation controls. */
      revealed
        ? sectionCard({
            cls: "tight card-actions",
            body: `
              <div class="card-verdict row wrap gap-2">
                <button class="btn flex-1 ok" data-act="qc-know-it" type="button">
                  <span aria-hidden="true">✓</span> I know it
                </button>
                <button class="btn flex-1 bad" data-act="qc-did-not-know" type="button">
                  <span aria-hidden="true">!</span> Need revision
                </button>
              </div>
              <div class="row wrap gap-2 mt-3">
                <button class="btn ghost flex-1" data-act="qc-prev" type="button">
                  <span aria-hidden="true">◀</span> Previous
                </button>
                <button class="btn ghost flex-1" data-act="qc-shuffle" type="button">
                  <span aria-hidden="true">🔀</span> Shuffle remaining
                </button>
              </div>
            `,
          })
        : sectionCard({
            cls: "tight card-actions",
            body: `
              <div class="row wrap gap-2">
                <button class="btn ghost flex-1" data-act="qc-prev" type="button">
                  <span aria-hidden="true">◀</span> Previous
                </button>
                <button class="btn ghost flex-1" data-act="qc-shuffle" type="button">
                  <span aria-hidden="true">🔀</span> Shuffle remaining
                </button>
                <button class="btn primary flex-1" data-act="qc-flip" type="button">
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
      const { route } = ctx;
      await ensureRevisionContent();

      // Load per-chapter counts from Supabase for the picker.
      catalogueIndex = await loadCatalogueIndex();

      const subjectId = route.query.get("subject") || "all";
      const chapterId = route.query.get("chapter") || "all";
      if (session && session.subjectId === subjectId && session.chapterId === chapterId) {
        // resume existing session
      } else {
        session = null;
        streak = 0;
      }
      ready = true;
    } catch (err) {
      console.error("[revision] questions init failed", err);
      ctx.toast("Failed to load practice questions. Please try again.", "err");
    } finally {
      loading = false;
    }

    renderMath(document.getElementById("main"));
    ctx.rerender();
  },
};

/* --------------------------------------------------------------- actions -- */

export const ACTIONS = {
  "qc-change-selection": (el, ctx) => {
    session = null;
    streak = 0;
    questionStartTime = null;
    ctx.rerender();
  },

  "qc-filter-change": (el, ctx) => {
    const subjectSelect = document.getElementById("pq-subject");
    const chapterSelect = document.getElementById("pq-chapter");
    const difficultySelect = document.getElementById("pq-difficulty");
    const countSelect = document.getElementById("pq-count");
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
    try { history.replaceState(null, "", `#/practice-questions?${params.toString()}`); }
    catch { window.location.hash = `#/practice-questions?${params.toString()}`; }
    // Keep the live route in sync so "Start session" reads the newest choices
    // even when we skip a re-render.
    ctx.route = { ...ctx.route, query: params };
    session = null;
    streak = 0;
    // Only a subject change alters the picker (its chapter list and counts).
    // Re-rendering on every change destroyed the open <select> mid-interaction —
    // that was the dropdown flicker. Defer even this so the native dropdown can
    // close before the DOM is replaced.
    if (isSubjectChange) setTimeout(() => ctx.rerender(), 0);
  },

  "qc-start-session": async (el, ctx) => {
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
      const chapterQuestions = await loadChapterQuestions(chapterId);
      deck = (chapterQuestions || []).filter(
        (q) => difficulty === "all" || q.difficulty === difficulty
      );
      if (subjectId !== "all") deck = deck.filter((q) => q.subjectId === subjectId);
    }

    if (!deck.length) {
      ctx.toast("No questions match your selection.", "info");
      return;
    }

    // Apply session size limit
    if (countParam && countParam !== "all") {
      const n = Number(countParam);
      if (!isNaN(n) && n > 0 && n < deck.length) {
        deck = deck.slice(0, n);
      }
    }

    const chapterName = deck[0]?.chapterName || (chapterId !== "all" ? chapterId : "");
    session = createQuestionState(deck, {
      userId: currentUser()?.id || null,
      subjectId: subjectId === "all" ? null : subjectId,
      chapterId: chapterId === "all" ? null : chapterId,
    });
    session._chapterName = chapterName;
    session._subjectId = subjectId;
    session._chapterId = chapterId;
    questionStartTime = Date.now();
    streak = 0;
    ctx.rerender();
  },

  "qc-flip": (el, ctx) => {
    if (!session) return;
    const answer = getCurrentAnswer(session);
    if (answer && answer.revealed) {
      // Already revealed — do nothing on second tap
      return;
    }
    session = revealAnswer(session);
    ctx.rerender();
  },

  "qc-know-it": (el, ctx) => {
    if (!session) return;
    const answer = getCurrentAnswer(session);
    if (!answer || !answer.revealed) return;
    session = recordMastery(session, "knowIt");
    const updated = getCurrentAnswer(session);
    if (updated?.isCorrect === 1) streak += 1; else streak = 0;
    session = advanceQuestion(session);
    ctx.rerender();
  },

  "qc-did-not-know": (el, ctx) => {
    if (!session) return;
    const answer = getCurrentAnswer(session);
    if (!answer || !answer.revealed) return;
    session = recordMastery(session, "needPractice");
    streak = 0;
    session = advanceQuestion(session);
    ctx.rerender();
  },

  "qc-skip": (el, ctx) => {
    if (!session) return;
    session = recordTimeSpent(session, elapsedSeconds());
    session = skipQuestion(session);
    streak = 0;
    questionStartTime = Date.now();
    ctx.rerender();
  },

  "qc-next": (el, ctx) => {
    if (!session) return;
    session = advanceQuestion(session);
    ctx.rerender();
  },

  "qc-prev": (el, ctx) => {
    if (!session) return;
    session = prevQuestion(session);
    ctx.rerender();
  },

  "qc-shuffle": (el, ctx) => {
    if (!session) return;
    const studied = session.questions.slice(0, session.currentIndex);
    const remaining = session.questions.slice(session.currentIndex).sort(() => Math.random() - 0.5);
    session = { ...session, questions: [...studied, ...remaining] };
    ctx.rerender();
  },

  "qc-review-answer": (el, ctx) => {
    if (!session) return;
    const idx = Number(el.dataset.qIdx);
    session = { ...session, currentIndex: idx };
    ctx.rerender();
  },

  "qc-restart": async (el, ctx) => {
    if (session && isComplete(session)) {
      await saveSessionSummary(session, {
        userId: currentUser()?.id || null,
        subjectId: session.subjectId,
        chapterId: session.chapterId,
      }).catch(() => {});
    }
    session = null;
    streak = 0;
    questionStartTime = null;
    ctx.rerender();
  },
};

/* --------------------------------------------------------------- picker -- */

function renderPicker(ctx, subjectId, chapterId, difficulty, countParam) {
  const { store } = ctx;

  // Use the static catalogue index (tiny download) instead of holding all
  // 9,180 questions in memory just to build the picker dropdowns.
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

  // Total question count for the active subject (or all subjects).
  let totalQuestions = 0;
  if (activeSubject !== "all") {
    for (const c of chapters) {
      totalQuestions += getChapterCounts(catalogueIndex, c.id).questions;
    }
  } else {
    for (const s of subjects) {
      for (const c of getChaptersForSubject(catalogueIndex, s.id)) {
        totalQuestions += getChapterCounts(catalogueIndex, c.id).questions;
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
              <span class="eyebrow">Practice Questions · Choose your set</span>
              <span class="chip soft">${totalQuestions.toLocaleString()} questions total</span>
            </div>
            <h1 style="margin:6px 0">Pick a subject &amp; chapter</h1>
            <p class="small muted" style="margin:0">Practise exactly what you want — only the chapter you pick is downloaded.</p>
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
              <label for="pq-subject">Subject</label>
              <select class="select" id="pq-subject" data-act="qc-filter-change" data-filter="subject">
                <option value="all"${activeSubject === "all" ? " selected" : ""}>All subjects</option>
                ${subjects.map((s) =>
                  `<option value="${esc(s.id)}"${activeSubject === s.id ? " selected" : ""}>${esc(s.name)}</option>`
                ).join("")}
              </select>
            </div>
            <div class="field grow" style="min-width:200px">
              <label for="pq-chapter">Chapter</label>
              <select class="select" id="pq-chapter" data-act="qc-filter-change" data-filter="chapter">
                <option value="all"${activeChapter === "all" ? " selected" : ""}>All ${chapterCount} chapters</option>
                ${chapters.map((c) =>
                  `<option value="${esc(c.id)}"${activeChapter === c.id ? " selected" : ""}>${esc(c.name)}</option>`
                ).join("")}
              </select>
              <div class="field-hint">${totalQuestions} question${totalQuestions !== 1 ? "s" : ""} available.</div>
            </div>
            <div class="field grow" style="min-width:160px">
              <label for="pq-difficulty">Difficulty</label>
              <select class="select" id="pq-difficulty" data-act="qc-filter-change" data-filter="difficulty">
                <option value="all"${difficulty === "all" ? " selected" : ""}>All difficulties</option>
                ${DIFFICULTY_LEVELS.map(d => `
                  <option value="${esc(d)}"${difficulty === d ? " selected" : ""}>${esc(d)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field grow" style="min-width:160px">
              <label for="pq-count">Questions per session</label>
              <select class="select" id="pq-count" data-act="qc-filter-change" data-filter="count">
                <option value="all"${countParam === "all" ? " selected" : ""}>All available</option>
                <option value="5"${countParam === "5" ? " selected" : ""}>5 questions</option>
                <option value="10"${countParam === "10" ? " selected" : ""}>10 questions</option>
                <option value="20"${countParam === "20" ? " selected" : ""}>20 questions</option>
                <option value="50"${countParam === "50" ? " selected" : ""}>50 questions</option>
              </select>
            </div>
          </div>
          <div class="row gap-2">
            <button class="btn primary flex-1" data-act="qc-start-session" type="button">
              <span aria-hidden="true">▶</span> Start session
            </button>
            <button class="btn ghost flex-1" data-act="qc-restart" type="button">Reset choice</button>
          </div>
        </div>
      `,
    }),
  ].join("");
}

/* -------------------------------------------------------------- results -- */

function renderResults(ctx, session) {
  const { store } = ctx;
  const results = getResults(session);
  const { total, correct, incorrect, markedReview, accuracy } = results;
  const attempted = total;
  const known = correct;
  const needRevision = incorrect;
  const timeTakenMs = questionStartTime ? Date.now() - questionStartTime : 0;
  const timeTaken = fmtTime(timeTakenMs);

  const sessionPoints = known * 10 + needRevision * 2;
  const gamification = store.derived?.gamification || {};
  const streak = gamification.streak?.current ?? store.state.settings.streakDays ?? 0;
  const totalPoints = gamification.points ?? 0;
  const level = gamification.level?.level ?? 1;

  const byChapter = {};
  for (const r of results.questionResults) {
    const bucket = byChapter[r.chapterName || "Unknown chapter"] || { known: 0, need: 0, total: 0 };
    bucket.total += 1;
    if (r.isCorrect) bucket.known += 1;
    else bucket.need += 1;
    byChapter[r.chapterName || "Unknown chapter"] = bucket;
  }
  const chaptersDone = Object.entries(byChapter).sort((a, b) => b[1].total - a[1].total).slice(0, 6);

  const sessionBadges = [];
  if (attempted >= 1) sessionBadges.push({ title: "First steps", text: `${attempted} question${attempted === 1 ? "" : "s"} attempted`, icon: "❓" });
  if (accuracy === 100 && attempted >= 5) sessionBadges.push({ title: "Perfect score", text: "100% accuracy", icon: "⭐" });
  if (accuracy >= 80 && attempted >= 5) sessionBadges.push({ title: "Sharp", text: `${accuracy}% accuracy`, icon: "🔥" });
  if (known >= 10) sessionBadges.push({ title: "High scorer", text: `${known} correct answers`, icon: "🏆" });
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
              <span class="eyebrow">Practice Questions · Session complete</span>
              <span class="chip ${accuracy >= 80 ? "ok" : accuracy >= 50 ? "warn" : "bad"}">${accuracy}% accuracy</span>
            </div>
            <h1 style="margin:6px 0">Deck complete</h1>
            <p class="small muted" style="margin:0">You studied ${attempted} of ${total} questions.</p>
          </div>
          <div class="row gap-2">
            <button class="btn primary" data-act="qc-restart" type="button">Start new session</button>
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
          <button class="btn primary flex-1" data-act="qc-restart" type="button">Start new session</button>
          <a class="btn ghost flex-1" href="#/practice-questions?subject=${esc(subjectId || "all")}&chapter=${esc(chapterId || "all")}">Retry same selection</a>
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
