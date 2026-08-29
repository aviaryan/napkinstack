import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from './defaults'
import { inputToSearch, parseInputFromSearch } from './urlState'

describe('url state', () => {
  it('round-trips the default input', () => {
    const qs = inputToSearch(DEFAULT_INPUT)
    expect(parseInputFromSearch(qs)).toEqual(DEFAULT_INPUT)
  })

  it('restores a custom sketch from the query string', () => {
    const parsed = parseInputFromSearch(
      'u=50000&r=20&w=5&i=1&s=content&p=3&k=12&c=40&q=150&d=80&n=1&f=cheap',
    )
    expect(parsed.users).toBe(50000)
    expect(parsed.instantConsistency).toBe(true)
    expect(parsed.appShape).toBe('content')
    expect(parsed.provider).toBe('cheap')
    expect(parsed.cacheHitRate).toBeCloseTo(0.4)
    expect(parsed.bytesPerUser).toBe(80_000)
  })
})
