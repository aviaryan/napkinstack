import type { Band } from './types'

export const BAND_COLOR: Record<Band, string> = {
  hobby: '#2f6b3a',
  small: '#c9a227',
  medium: '#e4b40d',
  large: '#e07a1a',
  xlarge: '#c43c11',
}

export function bandInk(band: Band): string {
  return band === 'small' || band === 'medium' ? '#3a2c00' : '#fff8ee'
}
