/** 主题：localStorage + 可选跟随系统；实际渲染用 document.documentElement[data-theme] */

export const THEME_STORAGE_KEY = "msgprocessor-theme";

export type ThemePreference = "system" | "light" | "dark";

export function getPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function resolveEffectiveLight(pref: ThemePreference): boolean {
  if (pref === "light") return true;
  if (pref === "dark") return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function applyDocumentTheme(pref: ThemePreference): void {
  const light = resolveEffectiveLight(pref);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
}

export function setPreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  applyDocumentTheme(pref);
}

export function initTheme(): void {
  applyDocumentTheme(getPreference());
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (getPreference() === "system") applyDocumentTheme("system");
  });
}
