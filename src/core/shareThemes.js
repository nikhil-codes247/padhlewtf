/**
 * shareThemes.js — appearance for share cards.
 *
 * Pure style data, kept out of the canvas renderer so the studio can preview a
 * swatch without touching a canvas. A theme never changes the *facts* on a card —
 * only how they are painted.
 *
 * **Looseleaf is the app's one design, so it is the card's one theme.** The
 * share card is drawn on the same paper desk, with the same handwriting ink,
 * marker accents, wobbly sheet geometry and washi tape as the app itself. The
 * older neubrutalist specs stay in `SHARE_THEME_SPECS` only so a card saved
 * under an old theme name still resolves to something sensible — they are not
 * offered, and nothing renders them.
 *
 * The `looseleaf` theme sets `hand: true`, which the renderer uses to switch to
 * the app's Kevin Sans / paper-desk / washi-tape rendering path.
 */

export const SHARE_FORMATS = ["post", "story"];

export const SHARE_THEME_SPECS = {
  minimal: {
    id: "minimal", label: "Minimal", description: "Cream paper, ink type, one ochre accent stripe.",
    background: "#efece3", card: "#fffcf5", ink: "#14131a", softInk: "#4a4854",
    stripes: false, confetti: false, topBar: true,
    accent: "#D97724",
  },
  dark: {
    id: "dark", label: "Dark", description: "Charcoal card with cream-ink type.",
    background: "#121212", card: "#1E1E1E", ink: "#FFFFFF", softInk: "#94A3B8",
    stripes: false, confetti: false, topBar: true,
    accent: "#E8A33D",
  },
  vibrant: {
    id: "vibrant", label: "Vibrant", description: "Full-bleed accent with the classic hard shadow.",
    background: "accent", card: "#FFFFFF", ink: "#1A1A1A", softInk: "#4A4854",
    stripes: true, confetti: false, topBar: false,
    accent: "#D97724",
  },
  celebration: {
    id: "celebration", label: "Celebration", description: "Vibrant plus falling confetti in the GIF.",
    background: "#FDE68A", card: "#FFFFFF", ink: "#1A1A1A", softInk: "#4A4854",
    stripes: true, confetti: true, topBar: false,
    accent: "#D97724",
  },
  looseleaf: {
    id: "looseleaf", label: "Looseleaf", description: "Paper desk, handwriting ink and marker accents.",
    background: "#a8c8bb", card: "#fbf6e9", ink: "#2a2420", softInk: "#4a423b",
    stripes: true, confetti: true, topBar: true, hand: true,
    accent: "#df6b3c", highlight: "#f8dc4c", surface: "#f1ead9",
  },
};

export const SHARE_FORMAT_SPECS = {
  post: { id: "post", label: "Post 4:5", description: "1080 × 1350 — fits a feed post.", width: 1080, height: 1350 },
  story: { id: "story", label: "Story 9:16", description: "1080 × 1920 — Stories, WhatsApp status, Snapchat.", width: 1080, height: 1920 },
};

export function shareDimensions(format) {
  const spec = SHARE_FORMAT_SPECS[format] || SHARE_FORMAT_SPECS.post;
  return { width: spec.width, height: spec.height };
}

/** Resolve a theme's background to a concrete colour, given the card accent. */
export function themeBackground(spec, accent) {
  return spec.background === "accent" ? accent : spec.background;
}
