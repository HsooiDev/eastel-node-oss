"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  toggleThemeWithWave: (ox: number, oy: number) => void;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "eastel-theme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    document.documentElement.setAttribute("data-theme", stored);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const toggleThemeWithWave = useCallback(
    (ox: number, oy: number) => {
      const next: Theme = theme === "dark" ? "light" : "dark";
      const wave = document.getElementById("wave-overlay");
      if (!wave) {
        setTheme(next);
        return;
      }
      // incoming surface colour for the sweeping wave
      const incomingBg = next === "light" ? "#f9f9ff" : "#10131a";
      wave.style.background = incomingBg;
      wave.style.setProperty("--ox", ox + "px");
      wave.style.setProperty("--oy", oy + "px");
      wave.classList.remove("wave-run");
      // force reflow to restart animation
      void (wave as HTMLElement).offsetWidth;
      wave.classList.add("wave-run");
      // swap theme halfway through the sweep (450ms / 900ms)
      setTimeout(() => setTheme(next), 400);
      setTimeout(() => wave.classList.remove("wave-run"), 920);
    },
    [theme, setTheme]
  );

  // Keep the same provider tree during hydration. Replacing a fragment with a
  // provider remounts checkout and discards its consumed private draft link.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, toggleThemeWithWave, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider
    return {
      theme: "dark",
      toggleTheme: () => {},
      toggleThemeWithWave: () => {},
      setTheme: () => {},
    };
  }
  return ctx;
}
