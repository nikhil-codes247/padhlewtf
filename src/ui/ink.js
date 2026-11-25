/**
 * ink.js — deterministic hand-drawn SVG marks.
 *
 * The Looseleaf design language draws every outline as a slightly wobbly line
 * instead of a perfect geometric one. These functions reproduce that idea with
 * no dependency and no DOM: each call returns an SVG *string*, seeded so the
 * same mark is drawn identically on every render (no jitter between re-renders).
 *
 * Every mark is decorative (`aria-hidden`) and inherits its colour from
 * `currentColor`, so the skin stylesheet can re-ink it per theme.
 */

/* --------------------------------------------------------------- helpers -- */

/** Small, fast, deterministic PRNG. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Turn any seed (number or string) into a stable 32-bit integer. */
function seedOf(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? "ink");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  return mulberry32(seedOf(seed));
}

const n = (v) => Number(v).toFixed(2);

/** Convert a point list into a smooth quadratic path. */
function smooth(pts) {
  if (!pts.length) return "";
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    d += ` Q${n(x1)} ${n(y1)} ${n((x1 + x2) / 2)} ${n((y1 + y2) / 2)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${n(last[0])} ${n(last[1])}`;
  return d;
}

function svg(viewBox, body, { className = "", opacity = 1 } = {}) {
  const cls = `ink${className ? ` ${className}` : ""}`;
  return `<svg class="${cls}" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true" focusable="false" style="opacity:${opacity}">${body}</svg>`;
}

/* ---------------------------------------------------------------- marks --- */

/**
 * A double hand-drawn underline. Stretches to its container width.
 */
export function inkUnderline({ width = 200, height = 12, seed = "underline", className = "", opacity = 1 } = {}) {
  const r = rng(seed);
  const mid = height * 0.55;

  const stroke = (pass, alpha, sway) => {
    const pts = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const x = 2 + (width - 4) * (i / steps);
      const arc = Math.sin((i / steps) * Math.PI) * sway;
      const y = mid + arc + (r() - 0.5) * 1.8 + pass * 2.1;
      pts.push([x, y]);
    }
    return `<path d="${smooth(pts)}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" opacity="${alpha}"/>`;
  };

  return svg(`0 0 ${width} ${height}`, stroke(0, 1, 1.1) + stroke(1, 0.55, 0.4), {
    className: `ink-underline ${className}`.trim(),
    opacity,
  });
}
