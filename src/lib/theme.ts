export type Theme = 'paper' | 'blueprint'

const STORAGE_KEY = 'napkinstack-theme'
const LEGACY_STORAGE_KEY = 'archsketch-theme'

export function parseThemeFromSearch(search: string): Theme | null {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw = q.get('t')
  if (raw === 'bp' || raw === 'blueprint') return 'blueprint'
  if (raw === 'paper') return 'paper'
  return null
}

export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw === 'blueprint' || raw === 'paper') return raw
  } catch {
    /* private mode */
  }
  return null
}

export function readTheme(search = window.location.search): Theme {
  return parseThemeFromSearch(search) ?? readStoredTheme() ?? 'paper'
}

export function applyTheme(theme: Theme): void {
  if (theme === 'blueprint') {
    document.documentElement.dataset.theme = 'blueprint'
  } else {
    delete document.documentElement.dataset.theme
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* private mode */
  }
}

export function themeToSearchParam(theme: Theme): string | null {
  return theme === 'blueprint' ? 'bp' : null
}
