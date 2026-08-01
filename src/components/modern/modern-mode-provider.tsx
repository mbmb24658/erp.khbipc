"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";

// ============================================================
// Modern Mode — third theme axis (alongside dark/light)
// Activates: ElectricBorder on cards, FloatingLines background,
// LineSidebar navigation, neon accent colors.
// Stored in localStorage and applied via `data-modern="true"`
// attribute on <html> for CSS targeting.
// ============================================================

interface ModernModeContextValue {
  isModern: boolean;
  setModern: (v: boolean) => void;
  toggleModern: () => void;
}

const ModernModeContext = createContext<ModernModeContextValue>({
  isModern: false,
  setModern: () => {},
  toggleModern: () => {},
});

const STORAGE_KEY = "khbipc-modern-mode";

export function ModernModeProvider({ children }: { children: ReactNode }) {
  const [isModern, setIsModern] = useState(false);

  // Read initial value from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      setIsModern(stored === "true");
    } catch {
      // ignore
    }
  }, []);

  // Apply attribute to <html> whenever value changes
  useEffect(() => {
    const root = document.documentElement;
    if (isModern) {
      root.setAttribute("data-modern", "true");
    } else {
      root.removeAttribute("data-modern");
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(isModern));
    } catch {
      // ignore
    }
  }, [isModern]);

  const setModern = useCallback((v: boolean) => setIsModern(v), []);
  const toggleModern = useCallback(() => setIsModern((p) => !p), []);

  return (
    <ModernModeContext.Provider value={{ isModern, setModern, toggleModern }}>
      {children}
    </ModernModeContext.Provider>
  );
}

export function useModernMode() {
  return useContext(ModernModeContext);
}
