/**
 * curriculum.js — the read-only official syllabus map.
 *
 * Lazy load by subject: the first paint only fetches the subject list
 * (names + codes). Chapters and topics are downloaded per-subject when the
 * user opens that subject's card. This keeps the initial load tiny and saves
 * egress for students who only check a few subjects.
 *
 * The structure is fetched from Supabase (`curriculum_chapters` +
 * `curriculum_nodes`, seeded once by the deployment).
 */
import { esc, fmtNum } from "../dom.js";
import { chip, sectionCard } from "../components.js";
import { visibleIds, selectionKey } from "../selection.js";
import { selectRows } from "../../core/supabase.js";

const SCOPE_LABEL = { optional: "not in board paper", internal: "formative / practical" };

function scopeChip(scope) {
  if (!scope || scope === "board") return "";
  return chip(SCOPE_LABEL[scope] || scope, scope === "optional" ? "plain" : "info");
}

function topicLine(topic) {
  return `<li class="cur-topic">
    <span class="cur-topic-name">${esc(topic.name)}</span>
    ${topic.notes ? `<p class="xs muted" style="margin:4px 0 0">${esc(topic.notes)}</p>` : ""}
  </li>`;
}

function chapterRow(chapter, topics) {
  const meta = [scopeChip(chapter.scope), chapter.marks_label ? chip(String(chapter.marks_label), "soft") : ""].filter(Boolean).join(" ");
  const topicsHtml = topics && topics.length
    ? `<ul class="cur-topics">${topics.map(topicLine).join("")}</ul>`
    : "";
  return `<div class="cur-chapter">
    <div class="row wrap between gap-2">
      <b>${esc(chapter.name)}</b>
      ${meta ? `<span class="row wrap gap-1">${meta}</span>` : ""}
    </div>
    ${topicsHtml}
  </div>`;
}

function unitBlock(unit, subjectId) {
  return `
    <div class="cur-unit">
      <div class="row wrap between gap-2">
        <h4 style="margin:0">${esc(unit.name)}</h4>
        ${unit.marks ? chip(`${unit.marks} marks`, "soft") : ""}
      </div>
      <div class="stack gap-3 mt-3">${unit.chapters.map((ch, i) => chapterRow(ch, ch.topics)).join("")}</div>
    </div>`;
}

function subjectPlaceholder(subject) {
  const marks = [
    subject.theory_marks != null ? `theory ${subject.theory_marks}` : "",
    subject.practical_marks ? `practical ${subject.practical_marks}` : "",
    subject.internal_marks ? `internal ${subject.internal_marks}` : "",
    subject.total_marks != null ? `total ${subject.total_marks}` : "",
  ].filter(Boolean).join(" · ");
  return `<details class="cur-subject" data-subject-id="${esc(subject.id)}">
    <summary>
      <span class="cur-sub-name">${esc(subject.name)}${subject.code ? ` · ${esc(subject.code)}` : ""}</span>
      <span class="xs faint" id="cur-sub-stats-${esc(subject.id)}">${marks ? esc(marks) : "tap to load chapters"}</span>
    </summary>
    <div class="cur-subject-content" id="cur-content-${esc(subject.id)}">
      <p class="small muted mt-3" style="margin:0">Loading chapters…</p>
    </div>
    ${subject.paper_structure ? `<p class="xs faint mt-3" style="margin-bottom:0">${esc(subject.paper_structure)}</p>` : ""}
  </details>`;
}

function subjectLoaded(subject, unitsHtml) {
  const chapterCount = unitsHtml ? (unitsHtml.match(/cur-chapter/g) || []).length : 0;
  const marks = [
    subject.theory_marks != null ? `theory ${subject.theory_marks}` : "",
    subject.practical_marks ? `practical ${subject.practical_marks}` : "",
    subject.internal_marks ? `internal ${subject.internal_marks}` : "",
    subject.total_marks != null ? `total ${subject.total_marks}` : "",
  ].filter(Boolean).join(" · ");
  return `<details class="cur-subject" data-subject-id="${esc(subject.id)}" open>
    <summary>
      <span class="cur-sub-name">${esc(subject.name)}${subject.code ? ` · ${esc(subject.code)}` : ""}</span>
      <span class="xs faint" id="cur-sub-stats-${esc(subject.id)}">${fmtNum(chapterCount)} chapters${marks ? ` · ${esc(marks)}` : ""}</span>
    </summary>
    <div class="cur-subject-content" id="cur-content-${esc(subject.id)}">
      <div class="row wrap gap-2 mt-3"><a class="btn sm" href="#/subject/${esc(subject.id)}">Open the trackable ${esc(subject.name)} →</a></div>
      ${subject.paper_structure ? `<p class="small muted mt-3" style="margin-bottom:0">${esc(subject.paper_structure)}</p>` : ""}
      ${unitsHtml}
      ${subject.books && subject.books.length ? `<p class="xs faint mt-3" style="margin-bottom:0">Books: ${subject.books.map((b) => esc(typeof b === "string" ? b : b?.title || "")).filter(Boolean).join(" · ")}</p>` : ""}
    </div>
  </details>`;
}

/** Load just the subject list (fast, tiny payload). */
async function loadSubjects(ids) {
  const query = ids
    ? `id=in.(${[...ids].join(",")})&order=sort_order.asc`
    : "order=sort_order.asc";
  const rows = await selectRows("subjects", query);
  return rows || [];
}

/** Load chapters + topics for one subject only. */
async function loadSubjectChapters(subjectId) {
  const chapters = await selectRows("curriculum_chapters", `subject_id=eq.${encodeURIComponent(subjectId)}&order=order.asc`);
  if (!chapters || !chapters.length) return [];

  const chapterIds = chapters.map((c) => c.id);
  const nodes = await selectRows("curriculum_nodes", `chapter_id=in.(${chapterIds.join(",")})&order=chapter_id.asc,order.asc`);

  const nodesByChapter = new Map();
  for (const n of nodes || []) {
    const list = nodesByChapter.get(n.chapter_id) || [];
    list.push(n);
    nodesByChapter.set(n.chapter_id, list);
  }

  return chapters.map((c) => ({
    ...c,
    topics: (nodesByChapter.get(c.id) || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((n) => ({ name: n.name, notes: n.notes || "", priority: n.priority })),
  }));
}

/** Group chapters by unit. */
function groupByUnits(chapters) {
  const units = new Map();
  for (const ch of chapters) {
    const unitName = ch.unit || "Other";
    if (!units.has(unitName)) units.set(unitName, { name: unitName, chapters: [], marks: ch.marks_label });
    units.get(unitName).chapters.push(ch);
  }
  return Array.from(units.values());
}

const pending = new Map();

export default {
  id: "curriculum",
  title: "Syllabus Map",
  render(ctx) {
    return `<div id="curriculum-body">${sectionCard({
      title: "The official syllabus map",
      subtitle: "Loading subjects…",
      body: `<p class="small muted" style="margin:0">Loading your subjects…</p>`,
    })}</div>`;
  },
  async mount(ctx) {
    const body = document.getElementById("curriculum-body");
    if (!body) return;

    try {
      const ids = visibleIds(ctx.store);
      const subjects = await loadSubjects(ids);

      if (!subjects.length) {
        body.innerHTML = `<section class="card"><p class="small muted">No subjects match your selection.</p></section>`;
        return;
      }

      const subjectList = subjects.map((s) => subjectPlaceholder(s)).join("");

      const head = sectionCard({
        title: "The official syllabus map",
        subtitle: "Tap a subject to load its chapters",
        body: `<p class="small muted" style="margin-top:0">${fmtNum(subjects.length)} subjects available. Tap any subject to load its chapters and topics.</p>`,
      });

      body.innerHTML = head + `<section class="card"><div class="stack gap-3">${subjectList}</div></section>`;

      // Wire lazy loading: fetch chapters when a subject card is opened.
      body.querySelectorAll('details[data-subject-id]').forEach((details) => {
        if (details.dataset.curriculumWired) return;
        details.dataset.curriculumWired = "1";
        details.addEventListener("toggle", async () => {
          if (!details.open) return;
          const subjectId = details.dataset.subjectId;
          if (pending.has(subjectId)) return;
          pending.set(subjectId, true);

          const content = details.querySelector(".cur-subject-content");
          if (!content) return;

          try {
            const chapters = await loadSubjectChapters(subjectId);
            const units = groupByUnits(chapters);
            const unitsHtml = units.map((u) => unitBlock(u, subjectId)).join("");
            details.outerHTML = subjectLoaded({ ...subjects.find((s) => s.id === subjectId) }, unitsHtml);
          } catch (err) {
            console.error("[padhle] syllabus subject load", err);
            content.innerHTML = `<p class="small muted mt-3">Could not load chapters for this subject.</p>`;
          } finally {
            pending.delete(subjectId);
          }
        });
      });
    } catch (err) {
      console.error("[padhle] syllabus map", err);
      body.innerHTML = `<section class="card"><p class="small muted">The syllabus map could not be loaded.</p></section>`;
    }
  },
};
