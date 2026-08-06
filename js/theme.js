// Site-wide light/dark theme preference, persisted to localStorage. Kept
// separate from favourites.js since it's an unrelated concern that just
// happens to share the same "small localStorage-backed module" shape.

const STORAGE_KEY = 'moonshot.theme';

export function loadTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — theme just won't persist.
  }
}
