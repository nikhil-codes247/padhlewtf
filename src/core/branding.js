/**
 * branding.js — the product's display name and tagline, in one place.
 *
 * The app ships as **PADHLE.WTF** everywhere: in the browser, and inside the
 * Android shell. Keeping it in a single module means the shell, the footer, the
 * boot card and the share cards can never disagree.
 */

export const WEB_BRAND = "PADHLE.WTF";
export const ANDROID_BRAND = "PADHLE.WTF";
export const TAGLINE = "Work Towards Finals 💀";

export function brand() {
  return WEB_BRAND;
}

export function tagline() {
  return TAGLINE;
}
