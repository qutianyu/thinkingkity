import { create } from "zustand";

type ThemePreference = "system" | "dark" | "light";
type ResolvedTheme = "dark" | "light";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return getSystemTheme();
  return preference;
}

function applyTheme(resolved: ResolvedTheme) {
  // CSS variables are keyed from a single root attribute.
  document.documentElement.setAttribute("data-theme", resolved);
}

function getInitialPreference(): ThemePreference {
  const stored = localStorage.getItem("thinkingkity.theme");
  if (stored === "dark" || stored === "light" || stored === "system") return stored;
  return "system";
}

interface ThemeState {
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

export const useThemeStore = create<ThemeState>((set) => {
  // Initialize immediately so first paint uses the persisted/system theme.
  const initial = getInitialPreference();
  const resolved = resolveTheme(initial);
  applyTheme(resolved);

  // Clean up any previous listener before registering a new one.
  if (systemThemeListener) {
    window.matchMedia("(prefers-color-scheme: dark)").removeEventListener("change", systemThemeListener);
  }
  systemThemeListener = () => {
    const current = useThemeStore.getState().preference;
    if (current === "system") {
      const r = getSystemTheme();
      applyTheme(r);
      set({ theme: r });
    }
  };
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", systemThemeListener);

  return {
    preference: initial,
    theme: resolved,
    setPreference: (preference: ThemePreference) => {
      localStorage.setItem("thinkingkity.theme", preference);
      const resolved = resolveTheme(preference);
      applyTheme(resolved);
      set({ preference, theme: resolved });
    },
  };
});
