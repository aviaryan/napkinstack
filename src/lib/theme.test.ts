import { describe, expect, it } from 'vitest'
import { parseThemeFromSearch, themeToSearchParam } from './theme'

describe('theme', () => {
  it('reads blueprint from t=bp', () => {
    expect(parseThemeFromSearch('?u=1000&t=bp')).toBe('blueprint')
    expect(parseThemeFromSearch('t=blueprint')).toBe('blueprint')
    expect(parseThemeFromSearch('t=paper')).toBe('paper')
    expect(parseThemeFromSearch('u=1000')).toBeNull()
  })

  it('only serializes blueprint so paper URLs stay clean', () => {
    expect(themeToSearchParam('blueprint')).toBe('bp')
    expect(themeToSearchParam('paper')).toBeNull()
  })
})
