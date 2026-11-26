/**
 * shareRender.js — draw a ShareCardModel to a canvas and export PNG / animated GIF.
 *
 * The card is a social-first "study snapshot": brand header, big headline
 * metric, overall-progress bar, an eight-stat grid, a 30-day activity strip
 * and a quiet footer. It follows the app's design language while staying calm
 * enough to post.
 *
 * Themes drive the whole treatment, not just the palette. The `looseleaf`
 * theme sets `spec.hand` and switches to Kevin Sans / Space Mono, wobbly
 * sheet geometry, washi tape, a dot-grid desk and a soft paper lift. Every
 * other theme keeps the original ink-border rendering.
 *
 * All drawing is DOM-free for the static export path; optional interactivity
 * (click to replay the count-up + confetti) is attached separately.
 */

import { GIFEncoder, quantize, applyPalette } from "../vendor/gifenc.js";
import { SHARE_THEME_SPECS, shareDimensions, themeBackground } from "../core/shareThemes.js";

/* ------------------------------------------------------------- palette ----- */

const FONT = (weight, px) => `${weight} ${px}px "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif`;
const MONO = (weight, px) => `${weight} ${px}px "Plus Jakarta Sans", ui-monospace, SFMono-Regular, Menlo, monospace`;
const HAND_FONT = (weight, px) => `${weight} ${px}px "Kevin Sans", "Segoe Script", ui-rounded, system-ui, sans-serif`;
const HAND_MONO = (weight, px) => `${weight} ${px}px "Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;
const INK_ON_PASTEL = "#14131A";
const HAND_INK = "#2a2420";

const easeOutCubic = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

const stage = (progress, start, end) => {
  if (progress <= start) return 0;
  if (progress >= end) return 1;
  return easeOutCubic((progress - start) / (end - start));
};

function palette(themeId, model) {
  const spec = SHARE_THEME_SPECS[themeId] || SHARE_THEME_SPECS.looseleaf;
  const accent = spec.accent || "#D97724";
  const highlight = model.accent || accent;
  const dark = themeId === "dark";
  return {
    spec,
    dark,
    hand: Boolean(spec.hand),
    background: themeBackground(spec, highlight),
    card: spec.card,
    ink: spec.ink,
    soft: spec.softInk,
    accent,
    highlight: spec.highlight || highlight,
    surface: dark ? "#26262E" : spec.surface || "#F7F4EC",
    line: dark ? "rgba(255,255,255,0.16)" : "rgba(20,19,26,0.14)",
  };
}

/* -------------------------------------------------------------- helpers ---- */

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.lineTo(x + w, y + h);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.lineTo(x, y);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function sketchRoundRect(ctx, x, y, w, h, r, seed = 1) {
  const rnd = mulberry32((seed * 2654435761) >>> 0);
  const j = () => (rnd() - 0.5) * 2.6;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr + j(), y + j());
  ctx.lineTo(x + w - rr + j(), y + j());
  ctx.quadraticCurveTo(x + w + j(), y + j(), x + w + j(), y + rr + j());
  ctx.lineTo(x + w + j(), y + h - rr + j());
  ctx.quadraticCurveTo(x + w + j(), y + h + j(), x + w - rr + j(), y + h + j());
  ctx.lineTo(x + rr + j(), y + h + j());
  ctx.quadraticCurveTo(x + j(), y + h + j(), x + j(), y + h - rr + j());
  ctx.lineTo(x + j(), y + rr + j());
  ctx.quadraticCurveTo(x + j(), y + j(), x + rr + j(), y + j());
  ctx.closePath();
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Faint dot-grid so the looseleaf desk reads as paper, not a flat fill. */
function drawDeskTexture(ctx, W, H, ink) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = ink;
  const step = 26;
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
  ctx.restore();
}

/** Washi tape across a corner of the sheet. */
function drawTape(ctx, x, y, w, h, rotate, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.fillStyle = fill;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = "rgba(42,36,32,0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function fitFontSize(ctx, text, weight, family, startPx, minPx, maxWidth) {
  let px = startPx;
  while (px > minPx) {
    ctx.font = family(weight, px);
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 1;
  }
  return px;
}

/** Count a number up towards its final value while keeping prefixes/suffixes. */
function animateStatString(raw, progress) {
  const str = String(raw ?? "");
  if (progress >= 0.999) return str;
  const p = easeOutCubic(progress);
  return str.replace(/^(\s*[^\d/]*)(\d+(?:\.\d+)?)/, (_, prefix, numStr) => {
    const target = parseFloat(numStr);
    if (Number.isNaN(target)) return `${prefix}${numStr}`;
    const current = target * p;
    if (numStr.includes(".")) {
      const decimals = numStr.split(".")[1].length;
      return `${prefix}${current.toFixed(decimals)}`;
    }
    return `${prefix}${Math.round(current)}`;
  });
}

function drawText(ctx, text, x, y, { font, color, align = "left", baseline = "alphabetic" }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(String(text ?? ""), x, y);
}

const KIND_ICON = {
  SNAPSHOT: "◨",
  STREAK: "🔥",
  MILESTONE: "🏆",
  WEEKLY: "▤",
  TOTAL_TIME: "◷",
  POINTS: "✦",
};

/* -------------------------------------------------------------- confetti --- */

function drawConfetti(ctx, W, H, progress) {
  if (progress <= 0 || progress > 1) return;
  const count = 40;
  const colors = ["#FDE68A", "#D8EEFE", "#F9B4AB", "#FFEDD5", "#D97724", "#B6F04A"];
  for (let i = 0; i < count; i++) {
    const t = (progress - 0.08) / 0.92;
    if (t < 0 || t > 1) continue;
    const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const rnd = seed - Math.floor(seed);
    const x = rnd * W;
    const y = -40 + t * (H + 80);
    const size = 6 + rnd * 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((t * 720 * Math.PI) / 180);
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ draw --- */

export function drawCard(
  ctx,
  model,
  themeId,
  format,
  { progress = 1, confetti = null, _staticExport = false, _interactiveState = null, _time = null } = {}
) {
  if (!ctx || !model) return;

  // Auto-enhance a live preview canvas with the click-to-replay animation.
  if (!_staticExport && !_interactiveState && typeof window !== "undefined" && ctx.canvas) {
    const canvas = ctx.canvas;
    if (canvas.isConnected) attachInteractiveCard(canvas, model, themeId, format);
  }

  const { width: W, height: H } = shareDimensions(format);
  const p = palette(themeId, model);
  const accent = p.accent;
  const highlight = p.highlight;
  const F = p.hand ? HAND_FONT : FONT;
  const M = p.hand ? HAND_MONO : MONO;
  const box = p.hand ? sketchRoundRect : roundedRect;
  const pastelInk = p.hand ? HAND_INK : INK_ON_PASTEL;

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  /* Background + soft decorative shapes. */
  ctx.fillStyle = p.background || '#ffffff';
  ctx.fillRect(0, 0, W, H);
  if (p.hand) drawDeskTexture(ctx, W, H, p.ink);
  ctx.save();
  ctx.globalAlpha = p.hand ? 0.10 : p.dark ? 0.14 : 0.18;
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(W * 0.92, H * 0.06, W * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.04, H * 0.96, W * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* Card geometry. */
  const margin = Math.round(Math.min(W, H) * 0.045);
  const cardX = margin;
  const cardY = margin;
  const cardW = W - margin * 2;
  const cardH = H - margin * 2;
  const radius = Math.round(cardW * 0.03);
  const pad = Math.round(cardW * 0.06);
  const innerW = cardW - pad * 2;

  // Hard offset shadow keeps the app's signature; the hand theme uses a soft
  // paper lift instead.
  ctx.fillStyle = p.hand
    ? "rgba(42,36,32,0.10)"
    : p.dark ? "rgba(0,0,0,0.45)" : "rgba(20,19,26,0.16)";
  const shadow = p.hand ? 5 : 8;
  box(ctx, cardX + shadow, cardY + shadow + (p.hand ? 3 : 0), cardW, cardH, radius, 11);
  ctx.fill();

  box(ctx, cardX, cardY, cardW, cardH, radius, 7);
  ctx.fillStyle = p.card;
  ctx.fill();
  ctx.lineWidth = p.hand ? 3 : 4;
  ctx.strokeStyle = p.ink;
  box(ctx, cardX, cardY, cardW, cardH, radius, 7);
  ctx.stroke();

  // Clip everything to the card so the accent strip respects the radius.
  ctx.save();
  box(ctx, cardX, cardY, cardW, cardH, radius, 7);
  ctx.clip();

  // Top accent strip.
  const stripeH = Math.round(cardH * 0.012);
  ctx.fillStyle = accent;
  ctx.fillRect(cardX, cardY, cardW, stripeH);

  // Washi tape on the hand-drawn sheet.
  if (p.hand) {
    const tapeFill = "rgba(248, 220, 76, 0.55)";
    drawTape(ctx, cardX + cardW * 0.16, cardY + 10, cardW * 0.16, 30, -0.06, tapeFill);
    drawTape(ctx, cardX + cardW * 0.84, cardY + 10, cardW * 0.14, 30, 0.05, tapeFill);
  }

  let y = cardY + stripeH + Math.round(cardH * 0.038);

  /* ---------------------------------------------------------- 1. header --- */
  const headerP = stage(progress, 0, 0.25);
  ctx.save();
  ctx.globalAlpha = 0.35 + headerP * 0.65;
  const badge = Math.round(cardW * 0.062);
  box(ctx, cardX + pad, y, badge, badge, Math.round(badge * 0.26));
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = p.ink;
  box(ctx, cardX + pad, y, badge, badge, Math.round(badge * 0.26));
  ctx.stroke();
  drawText(ctx, "P", cardX + pad + badge / 2, y + badge * 0.54, {
    font: F(800, Math.round(badge * 0.48)), color: "#FFFFFF", align: "center", baseline: "middle",
  });

  const brand = String(model.appName || "").toUpperCase();
  const brandMax = innerW - badge - Math.round(cardW * 0.24);
  const brandPx = fitFontSize(ctx, brand, 800, F, Math.round(cardW * 0.044), 14, brandMax);
  drawText(ctx, brand, cardX + pad + badge + Math.round(cardW * 0.022), y + badge * 0.52, {
    font: F(800, brandPx), color: p.ink, baseline: "middle",
  });

  const dateText = String(model.generatedOn || "").slice(0, 10);
  drawText(ctx, dateText, cardX + pad + innerW, y + badge * 0.52, {
    font: M(600, Math.round(cardW * 0.022)), color: p.soft, align: "right", baseline: "middle",
  });
  ctx.restore();

  y += badge + Math.round(cardH * 0.026);

  /* ------------------------------------------------------ 2. identity --- */
  const eyeP = stage(progress, 0.04, 0.32);
  const kindLabel = String(model.kind ? model.kind.replace(/_/g, " ") : "study snapshot").toUpperCase();
  drawText(ctx, `STUDY SNAPSHOT · ${kindLabel}`, cardX + pad, y, {
    font: M(800, Math.round(cardW * 0.021)), color: accent,
  });
  ctx.save();
  ctx.globalAlpha = eyeP;
  ctx.fillStyle = accent;
  ctx.fillRect(cardX + pad, y + 6, Math.round(innerW * 0.18 * eyeP), 3);
  ctx.restore();
  y += Math.round(cardH * 0.028);

  const name = String(model.eyebrow || "Student");
  const namePx = fitFontSize(ctx, name, 800, F, Math.round(cardH * 0.034), 20, innerW);
  drawText(ctx, name, cardX + pad, y + namePx * 0.82, { font: F(800, namePx), color: p.ink });
  y += namePx + Math.round(cardH * 0.016);

  /* ------------------------------------------------------- 3. headline --- */
  const heroH = Math.round(cardH * (format === "story" ? 0.175 : 0.195));
  const heroP = stage(progress, 0.08, 0.55);
  ctx.save();
  ctx.globalAlpha = 0.4 + heroP * 0.6;
  ctx.translate(0, Math.round((1 - heroP) * 14));
  box(ctx, cardX + pad, y, innerW, heroH, Math.round(cardW * 0.028));
  ctx.fillStyle = highlight;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = pastelInk;
  box(ctx, cardX + pad, y, innerW, heroH, Math.round(cardW * 0.028));
  ctx.stroke();

  const heroPad = Math.round(innerW * 0.05);
  const headline = animateStatString(model.headlineValue, stage(progress, 0.15, 0.65));
  const iconSpace = Math.round(heroH * 0.4);
  const textW = innerW - heroPad * 2 - iconSpace;
  const headPx = fitFontSize(ctx, headline, 900, F, Math.round(heroH * 0.5), Math.round(heroH * 0.22), textW);
  drawText(ctx, headline, cardX + pad + heroPad, y + heroH * 0.46, {
    font: F(900, headPx), color: pastelInk, baseline: "middle",
  });
  const unit = String(model.headlineUnit || "").toUpperCase();
  const unitPx = fitFontSize(ctx, unit, 800, M, Math.round(heroH * 0.115), 10, textW);
  drawText(ctx, unit, cardX + pad + heroPad, y + heroH * 0.8, {
    font: M(800, unitPx), color: pastelInk, baseline: "middle",
  });

  // Big kind glyph on the right. Kevin Sans has no box-drawing glyphs, so the
  // hand theme uses an ink star instead of a missing-glyph square.
  const icon = p.hand ? "✦" : KIND_ICON[model.kind] || "◨";
  drawText(ctx, icon, cardX + pad + innerW - heroPad, y + heroH * 0.52, {
    font: F(800, Math.round(heroH * 0.4)), color: pastelInk, align: "right", baseline: "middle",
  });
  ctx.restore();
  y += heroH + Math.round(cardH * 0.026);

  /* ------------------------------------------------------- 4. progress --- */
  const prog = model.progress || {};
  const pct = Math.max(0, Math.min(100, Number(prog.pct) || 0));
  const progP = stage(progress, 0.25, 0.85);
  drawText(ctx, "OVERALL SYLLABUS PROGRESS", cardX + pad, y + 4, {
    font: M(800, Math.round(cardW * 0.019)), color: p.soft,
  });
  drawText(ctx, `${Math.round(pct * progP)}%`, cardX + pad + innerW, y + 4, {
    font: M(800, Math.round(cardW * 0.019)), color: p.ink, align: "right",
  });
  y += Math.round(cardH * 0.022);
  const trackH = Math.round(cardH * 0.014);
  box(ctx, cardX + pad, y, innerW, trackH, trackH / 2);
  ctx.fillStyle = p.surface;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.ink;
  box(ctx, cardX + pad, y, innerW, trackH, trackH / 2);
  ctx.stroke();
  const fillW = Math.max(0, (innerW - 4) * (pct / 100) * progP);
  if (fillW > 1) {
    box(ctx, cardX + pad + 2, y + 2, fillW, trackH - 4, (trackH - 4) / 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  y += trackH + Math.round(cardH * 0.009);
  const done = Number(prog.current) || 0;
  const total = Number(prog.target) || 0;
  if (total > 0) {
    drawText(ctx, `${done} of ${total} board items`, cardX + pad, y + 14, {
      font: M(600, Math.round(cardW * 0.018)), color: p.soft,
    });
  }
  y += Math.round(cardH * 0.032);

  /* ------------------------------------------------------- 5. stat grid -- */
  const footerH = Math.round(cardH * 0.115);
  const footerTop = cardY + cardH - pad - footerH;
  const stats = (model.stats || []).slice(0, 8);
  const rows = Math.ceil(stats.length / 2);
  const colGap = Math.round(cardW * 0.022);
  const rowGap = Math.round(cardH * 0.011);
  const cellW = (innerW - colGap) / 2;
  const cellH = rows > 0 ? (footerTop - y - rowGap * (rows - 1) - 12) / rows : 0;

  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = cardX + pad + col * (cellW + colGap);
    const by = y + row * (cellH + rowGap);
    const p0 = stage(progress, 0.35 + i * 0.035, 0.8 + i * 0.02);
    ctx.save();
    ctx.globalAlpha = 0.35 + p0 * 0.65;
    ctx.translate(0, Math.round((1 - p0) * 10));

    box(ctx, bx, by, cellW, cellH, Math.round(cardW * 0.02));
    ctx.fillStyle = p.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.ink;
    box(ctx, bx, by, cellW, cellH, Math.round(cardW * 0.02));
    ctx.stroke();

    const label = String(stat.label || "").toUpperCase();
    const chipPad = Math.round(cellW * 0.06);
    drawText(ctx, label, bx + chipPad, by + Math.round(cellH * 0.32), {
      font: M(800, Math.round(cardW * 0.017)), color: p.soft,
    });
    const value = animateStatString(stat.value, p0);
    const valuePx = fitFontSize(ctx, value, 800, F, Math.round(cellH * 0.34), 14, cellW - chipPad * 2 - 30);
    drawText(ctx, value, bx + chipPad, by + Math.round(cellH * 0.74), {
      font: F(800, valuePx), color: p.ink,
    });
    if (stat.icon) {
      drawText(ctx, stat.icon, bx + cellW - chipPad, by + Math.round(cellH * 0.3), {
        font: F(800, Math.round(cellW * 0.07)), color: accent, align: "right",
      });
    }
    ctx.restore();
  });

  /* ----------------------------------------------------------- 6. footer - */
  const footerY = footerTop;
  if (p.hand) {
    ctx.save();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(cardX + pad, footerY);
    ctx.lineTo(cardX + pad + innerW, footerY);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = p.line;
    ctx.fillRect(cardX + pad, footerY, innerW, 1);
  }

  // 30-day activity strip (weekly cards contribute 7 wider cells).
  const strip = Array.isArray(model.strip) ? model.strip.slice(-30) : [];
  if (strip.length) {
    const stripY = footerY + Math.round(cardH * 0.014);
    const cellGap = 3;
    const cellW2 = Math.max(4, (innerW - cellGap * (strip.length - 1)) / strip.length);
    const cellH2 = Math.round(cardH * 0.0085);
    strip.forEach((lvl, i) => {
      const on = Number(lvl) > 0;
      box(ctx, cardX + pad + i * (cellW2 + cellGap), stripY, cellW2, cellH2, cellH2 / 2);
      ctx.fillStyle = !on ? p.surface
        : lvl >= 4 ? "#7BC96F"
        : lvl === 3 ? "#F4B740"
        : lvl === 2 ? "#F6CF63"
        : "#BFD9F2";
      ctx.fill();
      if (on) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = p.ink;
        box(ctx, cardX + pad + i * (cellW2 + cellGap), stripY, cellW2, cellH2, cellH2 / 2);
        ctx.stroke();
      }
    });
    drawText(ctx, strip.length > 10 ? "LAST 30 DAYS" : "LAST 7 DAYS", cardX + pad, stripY + cellH2 + Math.round(cardH * 0.022), {
      font: M(700, Math.round(cardW * 0.014)), color: p.soft,
    });
  }

  // Milestone / achievement line (left) and brand credit (right).
  const milestone = model.milestones && model.milestones.length
    ? `🏆 ${model.milestones[model.milestones.length - 1]}-day milestone`
    : (model.achievements || []).length
      ? `${model.achievements[0].icon || "✦"} ${model.achievements[0].title}`
      : "🔥 Keep showing up";
  const footY = footerTop + footerH - Math.round(cardH * 0.028);
  drawText(ctx, milestone, cardX + pad, footY, {
    font: F(800, Math.round(cardW * 0.024)), color: p.ink,
  });
  drawText(ctx, String(model.appName || "").toUpperCase(), cardX + pad + innerW, footY, {
    font: M(800, Math.round(cardW * 0.019)), color: p.soft, align: "right",
  });

  ctx.restore(); // card clip

  if (confetti !== null && progress > 0.45) drawConfetti(ctx, W, H, confetti);
  ctx.restore();
}

/* -------------------------------------------------------------- interactive */

const registry = new WeakMap();

/** Click the preview to replay the count-up and a confetti burst. */
export function attachInteractiveCard(canvas, model, themeId, format) {
  if (!canvas || typeof window === "undefined") return;
  let state = registry.get(canvas);
  if (!state) {
    state = { progress: 0, start: performance.now(), burst: -1, running: false, bound: false };
    registry.set(canvas, state);
  } else if (state.model !== model || state.themeId !== themeId || state.format !== format) {
    state.progress = 0;
    state.start = performance.now();
  }
  state.model = model;
  state.themeId = themeId;
  state.format = format;

  const tick = (now) => {
    state.progress = clamp01((now - state.start) / 1100);
    let burst = null;
    if (state.burst >= 0) {
      burst = (now - state.burst) / 1400;
      if (burst > 1) { state.burst = -1; burst = null; }
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      drawCard(ctx, state.model, state.themeId, state.format, {
        progress: state.progress, confetti: burst, _interactiveState: state,
      });
    }
    const more = state.progress < 1 || state.burst >= 0;
    if (more) requestAnimationFrame(tick);
    else state.running = false;
  };

  if (!state.bound) {
    state.bound = true;
    canvas.style.cursor = "pointer";
    canvas.style.touchAction = "manipulation";
    canvas.addEventListener("click", () => {
      state.start = performance.now();
      state.progress = 0;
      state.burst = performance.now();
      if (!state.running) { state.running = true; requestAnimationFrame(tick); }
    });
  }

  if (!state.running) {
    state.running = true;
    requestAnimationFrame(tick);
  }
}

/* ---------------------------------------------------------------- exports -- */

/** Render the card model to a PNG blob for download. */
export async function renderCardPng(model, themeId, format) {
  const { width: W, height: H } = shareDimensions(format);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  drawCard(ctx, model, themeId, format, { _staticExport: true });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

/** Render the card model to an animated GIF blob for download.
 *
 * The vendored `gifenc` build (v1) has a different API from the older
 * `new GIFEncoder(w, h)` / `addFrame()` style: it is
 *
 *   const encoder = GIFEncoder();
 *   encoder.writeHeader();
 *   encoder.writeFrame(indexedPixels, width, height, { palette, delay, repeat });
 *   encoder.finish();
 *   encoder.bytes();
 *
 * so `writeFrame` takes the **quantised pixel data**, not a frame number, and
 * the loop count and the repeat flag are options rather than setters. The
 * `repeat: 0` on the first frame writes the NETSCAPE2.0 extension, which is
 * what makes the GIF loop forever.
 */
export async function renderCardGif(model, themeId, format) {
  const { width: W, height: H } = shareDimensions(format);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const encoder = GIFEncoder();
  encoder.writeHeader();

  const frames = 14;
  for (let f = 0; f < frames; f++) {
    const progress = f / (frames - 1);
    const burst = f > frames * 0.55 ? (f - frames * 0.55) / (frames * 0.45) : null;
    drawCard(ctx, model, themeId, format, { _staticExport: true, progress, confetti: burst });

    // Quantise the frame to at most 256 colours, then map it to that palette.
    const rgba = ctx.getImageData(0, 0, W, H).data;
    const palette = quantize(rgba, 256);
    const indexed = applyPalette(rgba, palette);
    encoder.writeFrame(indexed, W, H, {
      palette,
      delay: 90,
      // The loop extension only belongs on the first frame.
      ...(f === 0 ? { repeat: 0 } : {}),
    });
  }

  encoder.finish();
  const bytes = encoder.bytes();
  return new Blob([bytes], { type: "image/gif" });
}

/** Share intents — social sharing links for the profile studio. */
export function shareIntents(model = {}) {
  const title = String(model.title || "Study progress").slice(0, 100);
  const subtitle = String(model.subtitle || "").slice(0, 200);
  const text = `${title}${subtitle ? ` — ${subtitle}` : ""}`;
  const url = typeof location !== "undefined" ? location.origin : "";
  return [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(text)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
    { label: "Twitter / X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` },
    { label: "Copy Link", href: url },
  ];
}
