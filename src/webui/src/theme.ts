export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "msgprocessor-theme";

function resolveSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(pref: ThemePreference): void {
  const theme = pref === "system" ? resolveSystemTheme() : pref;
  document.documentElement.setAttribute("data-theme", theme);
}

export function getPreference(): ThemePreference {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

export function setPreference(pref: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}
