import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from './defaults'
import { marginNote } from './marginNote'
import { sizeArchitecture } from './sizeArchitecture'

describe('marginNote', () => {
  it('annotates the queue when writes leave the request path', () => {
    const result = sizeArchitecture(DEFAULT_INPUT)
    expect(result.nodes.some((n) => n.kind === 'queue' && !n.ghost)).toBe(true)
    expect(marginNote(result)).toBe("writes don't block the request path")
  })

  it('falls back to the hobby one-liner on a single box', () => {
    const result = sizeArchitecture({
      ...DEFAULT_INPUT,
      users: 400,
      readsPerUserDay: 20,
      writesPerUserDay: 4,
      peakFactor: 3,
    })
    expect(result.band).toBe('hobby')
    expect(marginNote(result)).toBe('you are the failover plan')
  })
})
