/**
 * pyq.js — PYQ (previous-year question) insights.
 *
 * Lazy load by subject: the first paint loads the past-paper library
 * metadata (paper counts, years, subject list). Per-subject question data and
 * topic stats are downloaded when the user opens that subject's card. This
 * keeps the initial load tiny and saves egress.
 *
 * These tables summarise what earlier board papers asked, chapter by chapter.
 * Frequency describes papers already read — it is never presented as a prediction,
 * and where there is no per-question data the page says so.
 */
import { esc, fmtNum } from "../dom.js?v=mwz8hppl";
import { chip, emptyState, sectionCard } from "../components.js?v=mwz8hppl";
import { FREQUENCY_LABEL } from "../../core/constants.js?v=mwz8hppl";
import { selectRows } from "../../core/supabase.js?v=mwz8hppl";
import { selectionKey } from "../selection.js?v=mwz8hppl";

const cache = new Map();

const FREQ_TONE = { high: "bad", medium: "warn", unknown: "plain", low: "soft" };

function freqChip(frequency) {
  const label = FREQUENCY_LABEL[frequency] || frequency;
  return chip(label, FREQ_TONE[frequency] || "soft");
}

/** Load just the library metadata (small payload). */
async function loadLibraryMeta() {
  const rows = await selectRows("pyq_library", "select=*&id=eq.v1&limit=1");
  const data = rows?.[0]?.data;
  if (!data) return null;
  const corpus = data.corpus || {};
  return {
    papersCovered: corpus.papersCovered || 0,
    years: corpus.years || [],
    bySubject: corpus.bySubject || [],
    chapterFrequency: data.chapterFrequency || [],
  };
}

/** Load all PYQ data for one subject slug. */
async function loadSubjectPyq(subjectSlug) {
  const [papers, topicStats] = await Promise.all([
    selectRows("pyq_papers", `subject_slug=eq.${encodeURIComponent(subjectSlug)}&order=sort_order.asc`),
    selectRows("pyq_topic_stats", `subject_slug=eq.${encodeURIComponent(subjectSlug)}&order=sort_order.asc`),
  ]);

  const paperIds = (papers || []).map((p) => p.id);
  let questions = [];
  if (paperIds.length) {
    questions = await selectRows("pyq_questions", `paper_id=in.(${paperIds.join(",")})&order=sort_order.asc`);
  }

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
    topicStats: (topicStats || []).map((s) => ({
      id: s.id,
      subjectSlug: s.subject_slug,
      chapterName: s.chapter_name ?? null,
      subtopic: s.subtopic ?? null,
      frequency: s.frequency ?? null,
      marksObserved: s.marksObserved ?? null,
      typicalFormats: s.typical_formats || [],
    })),
  };
}

function subjectPlaceholder(subject, paperCount) {
  return `<details class="pyq-subject" data-subject-slug="${esc(subject.id)}">
    <summary>
      <span class="cur-sub-name">${esc(subject.name)}</span>
      <span class="xs faint" id="pyq-sub-stats-${esc(subject.id)}">${paperCount} papers · tap to load</span>
    </summary>
    <div class="pyq-subject-content" id="pyq-content-${esc(subject.id)}">
      <p class="small muted mt-3" style="margin:0">Loading past papers…</p>
    </div>
  </details>`;
}

function subjectLoaded(subject, html) {
  return `<details class="pyq-subject" data-subject-slug="${esc(subject.id)}" open>
    <summary>
      <span class="cur-sub-name">${esc(subject.name)}</span>
      <span class="xs faint" id="pyq-sub-stats-${esc(subject.id)}">loaded</span>
    </summary>
    <div class="pyq-subject-content" id="pyq-content-${esc(subject.id)}">${html}</div>
  </details>`;
}

function papersTable(papers) {
  if (!papers.length) return `<p class="small muted">No papers recorded for this subject.</p>`;
  return `<div class="table-wrap mt-3"><table>
    <thead><tr><th>Year</th><th>Set</th><th>Marks</th><th>Questions</th><th>Format</th></tr></thead>
    <tbody>${papers.map((p) => `<tr>
      <td>${esc(p.examYear)}</td>
      <td>${esc(p.setCode || "—")}</td>
      <td>${p.totalMarks ?? "—"}</td>
      <td>${p.questionCount ?? "—"}</td>
      <td>${esc(p.format)}${p.comparability === "not-comparable" ? ` <span class="chip warn" title="Reduced syllabus / different format">not comparable</span>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function topicStatsTable(stats) {
  if (!stats.length) return `<p class="small muted mt-3">No chapter-level frequency recorded for this subject.</p>`;
  return `<div class="table-wrap mt-3"><table>
    <thead><tr><th>Chapter</th><th>Topic</th><th>Frequency</th><th>Marks observed</th><th>Typical formats</th></tr></thead>
    <tbody>${stats.map((s) => `<tr>
      <td>${esc(s.chapterName)}</td>
      <td class="small">${esc(s.subtopic || "—")}</td>
      <td>${freqChip(s.frequency)}</td>
      <td class="small">${esc(s.marksObserved || "—")}</td>
      <td class="small">${esc((s.typicalFormats || []).join(", ") || "—")}</td>
    </tr>`).join("")}</tbody></table></div>`;
}

function questionsByChapter(questions, papers) {
  const byPaper = new Map();
  for (const q of questions) {
    const list = byPaper.get(q.paperId) || [];
    list.push(q);
    byPaper.set(q.paperId, list);
  }
  const paperById = new Map(papers.map((p) => [p.id, p]));

  const groups = [];
  for (const [paperId, qs] of byPaper) {
    const paper = paperById.get(paperId);
    if (!paper) continue;
    groups.push(`<details class="card-note mt-3">
      <summary><b>${esc(paper.examYear)}</b> <span class="chip soft">${fmtNum(qs.length)} question${qs.length === 1 ? "" : "s"} mapped</span></summary>
      <div class="row wrap gap-2 mt-3">${qs.map((q) => `<span class="chip plain">${esc(paper.examYear)} · ${esc(q.questionRef)}${q.marks ? ` · ${esc(q.marks)}m` : ""}</span>`).join("")}</div>
    </details>`);
  }
  return groups.length ? `<div class="stack gap-2 mt-4">${groups.join("")}</div>` : "";
}

const pending = new Map();

export default {
  id: "pyq",
  title: "PYQ Insights",
  render(ctx) {
    return `<div id="pyq-body">${sectionCard({
      title: "Previous-year question insights",
      subtitle: "Loading subjects…",
      body: `<p class="small muted" style="margin:0">Loading your past-paper subjects…</p>`,
    })}<section class="card"><p class="small muted" style="margin:0">The past-paper library indexes board papers by subject and chapter. Tap any subject below to load its papers and topic statistics on demand.</p></section></div>`;
  },
  async mount(ctx) {
    const body = document.getElementById("pyq-body");
    if (!body) return;

    try {
      const meta = await loadLibraryMeta();

      let bySubject = [];
      let papersCovered = 0;
      let years = [];

      if (meta) {
        papersCovered = meta.papersCovered || 0;
        years = meta.years || [];
        bySubject = meta.bySubject || [];
      }

      if (!bySubject.length) {
        body.innerHTML = `${sectionCard({
          title: "Past-paper library",
          subtitle: "Not available",
          body: `<p class="small muted">There are no past-paper subjects for your selection yet.</p>`,
        })}`;
        return;
      }

      // Load subject names for display
      const slugs = bySubject.map((s) => s.appSubjectId).filter(Boolean);
      let subjectNames = {};
      if (slugs.length) {
        const rows = await selectRows("subjects", `id=in.(${slugs.join(",")})&order=sort_order.asc`);
        for (const s of rows || []) subjectNames[s.id] = s;
      }

      const head = sectionCard({
        title: "Past-paper library",
        subtitle: `${fmtNum(papersCovered)} papers indexed across ${years.join("–")} — metadata only, no question text`,
        body: `<p class="small muted" style="margin-top:0">Every board paper in the library, plus what it records about each chapter. Tap a subject to load its papers and topic stats.</p>
          <div class="row wrap gap-2">${years.map((y) => chip(`${y}: ${fmtNum(1)}`, "soft")).join("")}</div>`,
      });

      const subjectList = bySubject.map((s) => {
        const nameObj = subjectNames[s.appSubjectId] || { name: s.label || "Unknown", code: null };
        const count = s.count || 0;
        return subjectPlaceholder(nameObj, count);
      }).join("");

      body.innerHTML = head + `<section class="card"><div class="stack gap-3">${subjectList}</div></section>`;

      // Wire lazy loading per subject
      body.querySelectorAll('details[data-subject-slug]').forEach((details) => {
        if (details.dataset.pyqWired) return;
        details.dataset.pyqWired = "1";
        details.addEventListener("toggle", async () => {
          if (!details.open) return;
          const subjectSlug = details.dataset.subjectSlug;
          if (pending.has(subjectSlug)) return;
          pending.set(subjectSlug, true);

          const content = details.querySelector(".pyq-subject-content");
          if (!content) return;

          try {
            const data = await loadSubjectPyq(subjectSlug);
            const papersHtml = papersTable(data.papers);
            const statsHtml = topicStatsTable(data.topicStats);
            const questionsHtml = questionsByChapter(data.questions, data.papers);
            details.outerHTML = subjectLoaded(
              { id: subjectSlug, name: subjectNames[subjectSlug]?.name || subjectSlug },
              papersHtml + statsHtml + questionsHtml
            );
          } catch (err) {
            console.error("[padhle] pyq subject load", err);
            content.innerHTML = `<p class="small muted mt-3">Could not load past papers for this subject.</p>`;
          } finally {
            pending.delete(subjectSlug);
          }
        });
      });
    } catch (err) {
      console.error("[padhle] pyq insights", err);
      body.innerHTML = `${sectionCard({
        title: "Past-paper library",
        subtitle: "Could not load",
        body: `<p class="small muted">The past-paper insights could not be loaded. Everything else in the app is unaffected.</p>`,
      })}`;
    }
  },
};
