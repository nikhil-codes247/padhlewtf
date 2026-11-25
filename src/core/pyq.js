/**
 * pyq.js — PYQ (previous-year question) insights.
 *
 * The dataset lives in Supabase (`pyq_papers`, `pyq_questions`,
 * `pyq_topic_stats`) and is passed in by the view. Frequency describes papers
 * that have already been read — it is never presented as a prediction. Where
 * the dataset has no per-question mapping, the page says so instead of
 * estimating.
 *
 * Pure and DOM-free so it can be unit-tested in plain Node.
 */

const FREQ_RANK = { high: 0, medium: 1, low: 2, rare: 3, unknown: 4 };

const humanize = (slug) => String(slug || "")
  .split("-")
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");

/**
 * The same slug rule the syllabus pack uses, so a subject name can be matched
 * to the reference slug without shipping a hard-coded map.
 */
export function slugifySubject(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Build the whole PYQ view model from the dataset + the app's subjects. */
export function buildPyq({ papers = [], questions = [], topicStats = [], subjects = [], slugToSubject = null } = {}) {
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const slugMap = slugToSubject
    || Object.fromEntries(subjects.map((s) => [slugifySubject(s.name), s.id]));
  const groupFor = (slug) => {
    const appId = slugMap[slug];
    const sub = appId ? subjectById.get(appId) : null;
    return {
      subjectSlug: slug,
      subjectId: sub?.id || null,
      subjectName: sub?.name || humanize(slug),
      stats: [],
      questionChapters: [],
      questionCount: 0,
    };
  };

  const paperViews = papers.map((p) => ({
    ...p,
    subjectName: subjectById.get(slugMap[p.subjectSlug])?.name || humanize(p.subjectSlug),
  }));
  const paperById = new Map(papers.map((p) => [p.id, p]));

  const groupsMap = new Map();
  const ensure = (slug) => {
    const key = slug || "unknown";
    if (!groupsMap.has(key)) groupsMap.set(key, groupFor(key));
    return groupsMap.get(key);
  };

  for (const s of topicStats) {
    const g = ensure(s.subjectSlug);
    g.stats.push({
      id: s.id, chapterName: s.chapterName, topicName: s.subtopic,
      frequency: s.frequency, marksObserved: s.marksObserved,
      typicalFormats: s.typicalFormats,
    });
  }

  for (const q of questions) {
    const paper = paperById.get(q.paperId);
    const g = ensure(paper?.subjectSlug);
    let chapter = g.questionChapters.find((c) => c.chapterName === q.chapterName);
    if (!chapter) { chapter = { chapterName: q.chapterName, questions: [], marks: 0 }; g.questionChapters.push(chapter); }
    chapter.questions.push({
      id: q.id, paperYear: paper?.examYear ?? null, setCode: paper?.setCode ?? null,
      questionRef: q.questionRef, chapterName: q.chapterName, marks: q.marks,
    });
    chapter.marks += q.marks || 0;
    g.questionCount += 1;
  }

  const groups = [...groupsMap.values()].map((g) => ({
    ...g,
    stats: g.stats.sort((a, b) => {
      const f = FREQ_RANK[a.frequency] - FREQ_RANK[b.frequency];
      if (f !== 0) return f;
      return a.chapterName.localeCompare(b.chapterName);
    }),
    questionChapters: g.questionChapters.sort((a, b) => b.marks - a.marks || a.chapterName.localeCompare(b.chapterName)),
  }));

  return {
    papers: paperViews,
    groups,
    coverage: {
      papers: papers.length,
      questionRows: questions.length,
      stats: topicStats.length,
      subjectsWithStats: new Set(topicStats.map((s) => s.subjectSlug)).size,
    },
    hasData: papers.length > 0 || topicStats.length > 0,
  };
}
