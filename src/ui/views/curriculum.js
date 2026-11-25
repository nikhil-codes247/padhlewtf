/**
 * curriculum.js — the read-only official syllabus map.
 *
 * The structure is fetched from Supabase (`curriculum_chapters` +
 * `curriculum_nodes`, seeded once by the deployment) and grouped into units for
 * the map view. Previously this was generated into a static module and shipped
 * to every browser; now it reads from the same source of truth as everything
 * else.
 */
import { esc, fmtNum } from "../dom.js";
import { chip, sectionCard } from "../components.js";
import { visibleIds, selectionKey } from "../selection.js";
import { selectRows } from "../../core/supabase.js";

/** Cache per selection: switching subjects must not leak the old map. */
const cache = new Map();

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

function chapterRow(chapter) {
  const meta = [scopeChip(chapter.scope), chapter.marks_label ? chip(String(chapter.marks_label), "soft") : ""].filter(Boolean).join(" ");
  return `<div class="cur-chapter">
    <div class="row wrap between gap-2">
      <b>${esc(chapter.name)}</b>
      ${meta ? `<span class="row wrap gap-1">${meta}</span>` : ""}
    </div>
    ${chapter.topics && chapter.topics.length
      ? `<ul class="cur-topics">${chapter.topics.map(topicLine).join("")}</ul>`
      : ""}
  </div>`;
}

function subjectBlock(subject, open) {
  const chapters = subject.units.reduce((a, u) => a + u.chapters.length, 0);
  const topics = subject.units.reduce((a, u) => a + u.chapters.reduce((b, c) => b + (c.topics?.length || 0), 0), 0);
  const marks = [
    subject.theory_marks != null ? `theory ${subject.theory_marks}` : "",
    subject.practical_marks ? `practical ${subject.practical_marks}` : "",
    subject.internal_marks ? `internal ${subject.internal_marks}` : "",
    subject.total_marks != null ? `total ${subject.total_marks}` : "",
  ].filter(Boolean).join(" · ");
  return `<details class="cur-subject" ${open ? "open" : ""}>
    <summary>
      <span class="cur-sub-name">${esc(subject.name)}${subject.code ? ` · ${esc(subject.code)}` : ""}</span>
      <span class="xs faint">${fmtNum(subject.units.length)} units · ${fmtNum(chapters)} chapters · ${fmtNum(topics)} topics${marks ? ` · ${esc(marks)}` : ""}</span>
    </summary>
    <div class="row wrap gap-2 mt-3"><a class="btn sm" href="#/subject/${esc(subject.id)}">Open the trackable ${esc(subject.name)} →</a></div>
    ${subject.paper_structure ? `<p class="small muted mt-3" style="margin-bottom:0">${esc(subject.paper_structure)}</p>` : ""}
    ${subject.units.map((unit) => `
      <div class="cur-unit">
        <div class="row wrap between gap-2">
          <h4 style="margin:0">${esc(unit.name)}</h4>
          ${unit.marks ? chip(`${unit.marks} marks`, "soft") : ""}
        </div>
        <div class="stack gap-3 mt-3">${unit.chapters.map(chapterRow).join("")}</div>
      </div>`).join("")}
    ${subject.books && subject.books.length ? `<p class="xs faint mt-3" style="margin-bottom:0">Books: ${subject.books.map((b) => esc(typeof b === "string" ? b : b?.title || "")).filter(Boolean).join(" · ")}</p>` : ""}
  </details>`;
}

/** Turn the flat chapter+node rows into the hierarchical map model. */
async function buildMap(ids) {
  const [chapterRows, nodeRows] = await Promise.all([
    selectRows("curriculum_chapters", "order=subject_id.asc,order.asc"),
    selectRows("curriculum_nodes", "order=chapter_id.asc,order.asc"),
  ]);
  const chapters = chapterRows || [];
  const nodes = nodeRows || [];
  const nodesByChapter = new Map();
  for (const n of nodes) {
    const list = nodesByChapter.get(n.chapter_id) || [];
    list.push(n);
    nodesByChapter.set(n.chapter_id, list);
  }

  const subjectMap = new Map();
  for (const c of chapters) {
    const subjectId = c.subject_id;
    if (!ids && !subjectId) continue;
    if (ids && (!subjectId || !ids.has(subjectId))) continue;

    let subject = subjectMap.get(subjectId);
    if (!subject) {
      subject = {
        id: subjectId,
        name: subjectId,
        code: null,
        units: [],
      };
      subjectMap.set(subjectId, subject);
    }
    const chapter = {
      id: c.id,
      name: c.name,
      scope: c.scope,
      marks_label: c.marks_label,
      topics: (nodesByChapter.get(c.id) || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((n) => ({ name: n.name, notes: n.notes || "", priority: n.priority })),
    };
    // Group chapters under their unit (stored in `unit`).
    const unitName = c.unit || "Other";
    let unit = subject.units.find((u) => u.name === unitName);
    if (!unit) {
      unit = { name: unitName, chapters: [] };
      subject.units.push(unit);
    }
    unit.chapters.push(chapter);
  }

  // Load real subject names/codes from the public catalogue.
  const subjectIds = [...subjectMap.keys()];
  if (subjectIds.length) {
    const subjectRows = await selectRows("subjects", `id=in.(${subjectIds.join(",")})&order=sort_order.asc`);
    const subjectById = new Map((subjectRows || []).map((s) => [s.id, s]));
    for (const [id, subject] of subjectMap) {
      const s = subjectById.get(id);
      if (s) {
        subject.name = s.name;
        subject.code = s.code ?? null;
      }
    }
  }

  const list = Array.from(subjectMap.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (!list.length) return `<section class="card"><p class="small muted">No subjects match your selection.</p></section>`;

  const totalChapters = list.reduce((a, s) => a + s.units.reduce((b, u) => b + u.chapters.length, 0), 0);
  const totalTopics = list.reduce((a, s) => a + s.units.reduce((b, u) => b + u.chapters.reduce((c, ch) => c + (ch.topics?.length || 0), 0), 0), 0);

  const head = sectionCard({
    title: "The official syllabus map",
    subtitle: "Your subjects and chapters in one place",
    body: `<p class="small muted" style="margin-top:0">This is the reference behind My Syllabus: ${fmtNum(list.length)} subjects, ${fmtNum(totalChapters)} chapters and ${fmtNum(totalTopics)} topics, grouped under their official units. Everything for your selected subjects is here — including chapters you have not planned yet.</p>
      <div class="row wrap gap-2">
        ${chip(`${fmtNum(totalTopics)} topics`, "soft")}
      </div>`,
  });

  const body = list.map((s, i) => subjectBlock(s, i === 0)).join("");
  return head + `<section class="card"><div class="stack gap-3">${body}</div></section>`;
}

export default {
  id: "curriculum",
  title: "Syllabus Map",
  render(ctx) {
    const cached = cache.get(selectionKey(ctx.store));
    if (cached) return cached;
    // Placeholder first paint; mount() swaps in the real structure (loaded on demand).
    return `<div id="curriculum-body">${sectionCard({
      title: "The official syllabus map",
      subtitle: "Loading the full structure…",
      body: `<p class="small muted" style="margin:0">Loading the syllabus…</p>`,
    })}</div>`;
  },
  mount(ctx) {
    const key = selectionKey(ctx.store);
    if (cache.has(key)) return null;
    buildMap(visibleIds(ctx.store))
      .then((html) => {
        cache.set(key, html);
        const el = document.getElementById("curriculum-body");
        if (el) el.outerHTML = html;
      })
      .catch((err) => {
        console.error("[padhle] syllabus map", err);
        const el = document.getElementById("curriculum-body");
        if (el) el.innerHTML = `<section class="card"><p class="small muted">The full syllabus map could not be loaded, but My Syllabus is unaffected.</p></section>`;
      });
    return null;
  },
};
