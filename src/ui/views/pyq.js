/**
 * pyq.js — PYQ (previous-year question) insights.
 *
 * These tables summarise what earlier board papers asked, chapter by chapter.
 * Frequency describes papers already read — it is never presented as a prediction,
 * and where there is no per-question data the page says so.
 *
 * The dataset lives in Supabase and is loaded on demand, so nothing here ships a
 * copy of the content.
 */
import { esc, fmtNum } from "../dom.js";
import { chip, emptyState, sectionCard } from "../components.js";
import { buildPyq } from "../../core/pyq.js";
import { FREQUENCY_LABEL } from "../../core/constants.js";
import { selectRows } from "../../core/supabase.js";
import { visibleSubjects, visibleIds, selectionKey } from "../selection.js";

const cache = new Map();

/* --------------------------------------------------------------- loaders --- */

async function loadPyq() {
  const [papers, questions, stats] = await Promise.all([
    selectRows("pyq_papers", "select=*&order=sort_order.asc"),
    selectRows("pyq_questions", "select=*&order=sort_order.asc"),
    selectRows("pyq_topic_stats", "select=*&order=sort_order.asc"),
  ]);
  return {
    papers: (papers || []).map((p) => ({
      id: p.id,
      examYear: p.exam_year,
      subjectSlug: p.subject_slug,
      setCode: p.set_code ?? null,
      totalMarks: p.total_marks ?? null,
      questionCount: p.question_count ?? null,
      format: p.format ?? null,
      comparability: p.comparability ?? null,
    })),
    questions: (questions || []).map((q) => ({
      id: q.id,
      paperId: q.paper_id,
      questionRef: q.question_ref ?? null,
      chapterName: q.chapter_name ?? null,
      marks: q.marks ?? null,
    })),
    topicStats: (stats || []).map((s) => ({
      id: s.id,
      subjectSlug: s.subject_slug,
      chapterName: s.chapter_name ?? null,
      subtopic: s.subtopic ?? null,
      frequency: s.frequency ?? null,
      marksObserved: s.marks_observed ?? null,
      typicalFormats: s.typical_formats || [],
    })),
  };
}

async function loadLibrary() {
  const rows = await selectRows("pyq_library", "select=*&id=eq.v1&limit=1");
  const data = rows?.[0]?.data;
  if (!data?.corpus) return null;
  return { corpus: data.corpus, chapterFrequency: data.chapterFrequency || [] };
}

/* --------------------------------------------- past-paper library ---------- */

function freqRow(c) {
  const marks = (c.marksObserved || []).join(", ");
  const freq = c.reportedFrequency
    ? chip(FREQUENCY_LABEL[c.reportedFrequency] || c.reportedFrequency, c.reportedFrequency === "high" ? "bad" : c.reportedFrequency === "medium" ? "warn" : "soft")
    : `<span class="chip plain" title="No frequency band is recorded for this subject">not banded</span>`;
  return `<tr>
    <td>${esc(c.label)}</td>
    <td>${freq}</td>
    <td>${c.topicCount ? fmtNum(c.topicCount) : "—"}</td>
    <td class="small">${esc(marks || "—")}</td>
    <td class="small">${esc((c.observedFormats || []).join(", ") || "—")}</td>
  </tr>`;
}

function buildLibrary(store, meta, chapters, ids) {
  const subjName = (id, fallback) => (id && store.subject(id)?.name) || fallback || "Unmapped";

  const groupKey = (c) => c.appSubjectId || `raw:${c.subjectId}`;
  const groups = new Map();
  for (const c of chapters) {
    if (ids && c.appSubjectId && !ids.has(c.appSubjectId)) continue;
    const k = groupKey(c);
    if (!groups.has(k)) groups.set(k, { appSubjectId: c.appSubjectId, label: subjName(c.appSubjectId, c.subjectId), rows: [] });
    groups.get(k).rows.push(c);
  }
  const bySubject = meta.bySubject.filter((s) => !ids || !s.appSubjectId || ids.has(s.appSubjectId));

  const head = sectionCard({
    title: "Past-paper library",
    subtitle: `${fmtNum(meta.papersCovered)} papers indexed across ${meta.years.join("–")} — metadata only, no question text`,
    body: `<p class="small muted" style="margin-top:0">Every board paper in the library, plus what it records about each chapter. Where a subject has no frequency band, the row says so instead of guessing.</p>
      <div class="row wrap gap-2">${Object.entries(meta.byYear).sort().map(([y, n]) => chip(`${y}: ${fmtNum(n)}`, "soft")).join("")}</div>
      <div class="row wrap gap-2 mt-3">${bySubject.map((s) => chip(`${subjName(s.appSubjectId, s.label)}: ${fmtNum(s.count)}` + (s.appSubjectId ? "" : " (not tracked)"), s.appSubjectId ? "plain" : "soft")).join("")}</div>`,
  });

  const blocks = [...groups.values()].map((g, i) => `<details class="cur-subject" ${i === 0 ? "open" : ""}>
    <summary>
      <span class="cur-sub-name">${esc(g.label)}</span>
      <span class="xs faint">${fmtNum(g.rows.length)} chapters analysed</span>
    </summary>
    <div class="table-wrap mt-3"><table>
      <thead><tr><th>Chapter</th><th>Frequency</th><th>Topics recorded</th><th>Marks observed</th><th>Formats seen</th></tr></thead>
      <tbody>${g.rows.map((c) => freqRow(c)).join("")}</tbody>
    </table></div>
  </details>`).join("");

  return head + `<section class="card"><div class="stack gap-3">${blocks}</div></section>`;
}

/* ------------------------------------------------------------------ view --- */

function loadingShell() {
  return `<section class="card stripe" style="--stripe:var(--info)">
    <span class="eyebrow">Review · Past papers</span>
    <h1 style="margin:6px 0">Previous-year question insights</h1>
    <p class="small muted" style="margin:0">What earlier board papers asked, chapter by chapter. This is a record of papers already read — not a forecast.</p>
  </section>
  ${sectionCard({ title: "Past-paper library", subtitle: "Loading…", body: `<p class="small muted" style="margin:0">Loading the past-paper insights…</p>` })}`;
}

function renderBody(store, data, library) {
  const ids = visibleIds(store);

  const head = `<section class="card stripe" style="--stripe:var(--info)">
    <div class="row wrap between gap-4">
      <div class="grow" style="min-width:250px">
        <span class="eyebrow">Review · Past papers</span>
        <h1 style="margin:6px 0">Previous-year question insights</h1>
        <p class="small muted" style="margin:0">What earlier board papers asked, chapter by chapter. This is a record of papers already read — not a forecast.</p>
      </div>
      <div class="row wrap gap-4">
        <div class="metric"><div class="k">Papers read</div><div class="v" style="font-size:var(--fs-xl)">${fmtNum(data.coverage.papers)}</div><div class="s">full-paper analysis</div></div>
        <div class="metric"><div class="k">Question rows</div><div class="v" style="font-size:var(--fs-xl)">${fmtNum(data.coverage.questionRows)}</div><div class="s">mapped to a chapter</div></div>
        <div class="metric"><div class="k">Topic stats</div><div class="v" style="font-size:var(--fs-xl)">${fmtNum(data.coverage.stats)}</div><div class="s">across ${fmtNum(data.coverage.subjectsWithStats)} subjects</div></div>
      </div>
    </div>
  </section>`;

  if (!data.hasData) {
    return head + sectionCard({
      title: "No past-paper data yet",
      subtitle: "Nothing to show yet",
      body: emptyState({ icon: "📄", title: "No past-paper data yet", text: "This screen shows what the past-paper library records about earlier board exams. There is no past-paper data available yet.", mood: "curious" }),
    });
  }

  const libraryHtml = library?.corpus
    ? buildLibrary(store, library.corpus, library.chapterFrequency, ids)
    : sectionCard({ title: "Past-paper library", subtitle: "Not available", body: `<p class="small muted" style="margin:0">The past-paper library could not be loaded, but everything else on this page is unaffected.</p>` });

  const papers = sectionCard({
    title: "Papers read in full",
    subtitle: "Per-paper marks and format. Term-II papers use a reduced format and are marked not comparable.",
    body: data.papers.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Year</th><th>Subject</th><th>Set</th><th>Marks</th><th>Questions</th><th>Format</th></tr></thead>
      <tbody>${data.papers.map((p) => `<tr>
        <td>${esc(p.examYear)}</td>
        <td>${esc(p.subjectName)}</td>
        <td>${esc(p.setCode || "—")}</td>
        <td>${p.totalMarks ?? "—"}</td>
        <td>${p.questionCount ?? "—"}</td>
        <td>${esc(p.format)}${p.comparability === "not-comparable" ? ` <span class="chip warn" title="Reduced syllabus / different format">not comparable</span>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="small muted">No papers recorded.</p>`,
  });

  const groups = data.groups.map((g) => {
    const statsTable = g.stats.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Chapter</th><th>Topic</th><th>Frequency</th><th>Marks observed</th><th>Typical formats</th></tr></thead>
      <tbody>${g.stats.map((s) => `<tr>
        <td>${esc(s.chapterName)}</td>
        <td class="small">${esc(s.topicName || "—")}</td>
        <td>${chip(FREQUENCY_LABEL[s.frequency] || s.frequency, s.frequency === "high" ? "bad" : s.frequency === "medium" ? "warn" : s.frequency === "unknown" ? "plain" : "soft")}</td>
        <td class="small">${esc(s.marksObserved || "—")}</td>
        <td class="small">${esc((s.typicalFormats || []).join(", ") || "—")}</td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="small muted">No chapter-level frequency recorded for this subject.</p>`;

    const qChapters = g.questionChapters.length ? `<div class="stack gap-2 mt-4">${g.questionChapters.map((c) => `
      <details class="card-note">
        <summary><b>${esc(c.chapterName)}</b> <span class="chip soft">${fmtNum(c.marks)} marks mapped</span> <span class="xs faint">${c.questions.length} question${c.questions.length === 1 ? "" : "s"}</span></summary>
        <div class="row wrap gap-2 mt-3">${c.questions.map((q) => `<span class="chip plain">${esc(q.paperYear)} · ${esc(q.questionRef)}${q.marks ? ` · ${esc(q.marks)}m` : ""}</span>`).join("")}</div>
      </details>`).join("")}</div>` : "";

    return sectionCard({
      title: g.subjectName,
      subtitle: `${g.stats.length} chapter stat${g.stats.length === 1 ? "" : "s"}${g.questionCount ? ` · ${g.questionCount} mapped questions` : ""}`,
      body: statsTable + qChapters,
    });
  });

  const tips = sectionCard({
    title: "How to use this page",
    subtitle: "A study signal, not a promise",
    cls: "stripe",
    id: "pyq-limits",
    body: `<ul class="stack gap-2 small" style="margin:0;padding-left:1.1rem">
      <li>Use the frequency bands to decide what to revise first — a chapter asked often in past papers is usually worth extra revision.</li>
      <li>“Not banded” simply means there is not enough recorded data for that subject yet; it does not mean the chapter is unimportant.</li>
      <li>Past papers show what has been asked before. They are a guide to weightage, not a guarantee of what comes next.</li>
    </ul>`,
  });

  return [head, papers, ...groups, tips, libraryHtml].join("");
}

export default {
  id: "pyq",
  title: "PYQ Insights",
  render() {
    return `<div id="pyq-body">${loadingShell()}</div>`;
  },

  mount(ctx) {
    const key = selectionKey(ctx.store);
    const body = () => document.getElementById("pyq-body");
    if (cache.has(key)) {
      const el = body();
      if (el) el.outerHTML = cache.get(key);
      return null;
    }
    Promise.all([loadPyq(), loadLibrary()])
      .then(([data, library]) => {
        const html = renderBody(ctx.store, buildPyq({ ...data, subjects: visibleSubjects(ctx.store) }), library);
        cache.set(key, html);
        const el = body();
        if (el) el.outerHTML = html;
      })
      .catch((err) => {
        console.error("[padhle] pyq insights", err);
        const el = body();
        if (el) el.innerHTML = `<section class="card"><p class="small muted">The past-paper insights could not be loaded. Everything else in the app is unaffected.</p></section>`;
      });
    return null;
  },
};
