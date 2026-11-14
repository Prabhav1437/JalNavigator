import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'jalnavigator-theme';

function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    return;
  }
}

function getSystemTheme() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function getInitialTheme() {
  return readStoredTheme() || getSystemTheme();
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export default function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);
  const hasToggled = useRef(false);

  useEffect(() => {
    applyTheme(theme);
    if (hasToggled.current) storeTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    hasToggled.current = true;
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
