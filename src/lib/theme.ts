export type ThemeMode = "auto" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

const STORAGE_KEY = "routey.theme";

export function getStoredThemeMode(): ThemeMode {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" || value === "auto"
    ? value
    : "auto";
}

export function storeThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function systemTheme(): EffectiveTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function resolveTheme(mode: ThemeMode): EffectiveTheme {
  return mode === "auto" ? systemTheme() : mode;
}

export function applyTheme(mode: ThemeMode): EffectiveTheme {
  const effective = resolveTheme(mode);
  document.documentElement.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", effective === "dark" ? "#0a0f14" : "#f4f7f9");
  }
  return effective;
}
