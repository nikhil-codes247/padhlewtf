/**
 * roadmap.js — the "What's New?" feature cards.
 *
 * These are product intentions, not promises: no dates, no "coming next week".
 * Status is one of PLANNED / IN_DEVELOPMENT / RELEASED. Copied verbatim from the
 * research/product source so the app and web/ never disagree about what is coming.
 */

export const ROADMAP_ITEMS = [
  {
    slug: "question-level-pyq-data",
    title: "Question-by-question PYQ data",
    summary: "Every maths and science paper has been read question-by-question. Many older papers are scans, so adding question-level detail for them is still in progress.",
    detail: "Chapter marks are shown for the papers read in full. Next we are adding question-level counts for the older scanned papers, so every subject gets real numbers rather than estimates.",
    category: "PYQ analysis",
    status: "IN_DEVELOPMENT",
    timing: "In development",
    order: 1,
  },
  {
    slug: "adaptive-revision",
    title: "Revision that adapts to you",
    summary: "The ladder (+1 / +3 / +7 / +21 / +45 days) is fixed today. Next it will shorten for topics you score low on and stretch for the ones you nail.",
    detail: null, category: "Revision", status: "IN_DEVELOPMENT", timing: "In development", order: 2,
  },
  {
    slug: "practice-mode",
    title: "Practice mode with question sets",
    summary: "Pull the questions that actually appeared on your weak chapters and answer them under a timer.",
    detail: null, category: "Practice", status: "PLANNED", timing: "Planned", order: 3,
  },
  {
    slug: "more-share-cards",
    title: "More share cards",
    summary: "Subject-wise recaps, revision streaks, and a card for the day you finish the syllabus.",
    detail: null, category: "Sharing", status: "IN_DEVELOPMENT", timing: "In development", order: 5,
  },
  {
    slug: "class-mode",
    title: "Study groups and class mode",
    summary: "Compare progress with a study group without exposing anyone's notes, doubts, or schedule.",
    detail: null, category: "Social", status: "PLANNED", timing: "Exploring", order: 6,
  },
];

export const STATUS_LABEL = { PLANNED: "Planned", IN_DEVELOPMENT: "In development", RELEASED: "Released" };
export const STATUS_ORDER = ["IN_DEVELOPMENT", "PLANNED", "RELEASED"];
export const STATUS_TONE = { PLANNED: "soft", IN_DEVELOPMENT: "warn", RELEASED: "ok" };
