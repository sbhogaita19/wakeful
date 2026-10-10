export type ThemePref = 'auto' | 'dark' | 'light';
const KEY = 'wakeful-theme';

export function getPref(): ThemePref {
  try { const v = localStorage.getItem(KEY); if (v === 'dark' || v === 'light') return v; } catch { /* storage blocked */ }
  return 'auto';
}

export function applyTheme(pref: ThemePref = getPref()) {
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#fbf9f4');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', dark ? 'dark' : 'light');
}

export function setPref(p: ThemePref) {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* ignore */ }
  applyTheme(p);
}

export const isDark = () => document.documentElement.dataset.theme !== 'light';
