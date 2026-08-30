import { describe, expect, it } from 'vitest'
import { changeNotes, diffLiveNodes } from './diffNodes'
import type { ArchNode } from './types'

function node(partial: Partial<ArchNode> & Pick<ArchNode, 'id' | 'label'>): ArchNode {
  return {
    kind: 'cache',
    detail: '',
    ...partial,
  }
}

describe('diffLiveNodes', () => {
  it('ignores ghosts and reports live additions and removals', () => {
    const cdnGhost = node({ id: 'cdn', kind: 'cdn', label: 'CDN', ghost: true })
    const cdn = node({
      id: 'cdn',
      kind: 'cdn',
      label: 'CDN',
      appearNote: '+ CDN — edge offload at this scale',
    })
    const redis = node({
      id: 'cache',
      kind: 'cache',
      label: 'Redis',
      appearNote: '+ Redis — cacheable reads leave the database path',
    })
    const replica = node({ id: 'replica', kind: 'replica', label: 'replica' })

    expect(diffLiveNodes([cdnGhost, replica], [cdn, redis])).toEqual({
      added: [cdn, redis],
      removed: [replica],
    })
  })

  it('treats a ghost becoming live as an add, and the reverse as a remove', () => {
    const ghost = node({ id: 'queue', kind: 'queue', label: 'queue', ghost: true })
    const live = node({ id: 'queue', kind: 'queue', label: 'queue' })
    expect(diffLiveNodes([ghost], [live]).added).toEqual([live])
    expect(diffLiveNodes([live], [ghost]).removed).toEqual([live])
  })
})

describe('changeNotes', () => {
  it('uses appear notes when present and a generic minus for removals', () => {
    const added = [
      node({ id: 'cdn', kind: 'cdn', label: 'CDN', appearNote: '+ CDN — edge offload at this scale' }),
      node({ id: 's3', kind: 'object', label: 'object store' }),
    ]
    const removed = [node({ id: 'replica', kind: 'replica', label: 'replica' })]
    expect(changeNotes(added, removed)).toEqual([
      '+ CDN — edge offload at this scale',
      '+ object store',
      '− replica',
    ])
  })
})
