import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from './defaults'
import { toMermaid } from './mermaid'
import { sizeArchitecture } from './sizeArchitecture'

describe('toMermaid', () => {
  it('uses subgraphs and skips ghost nodes', () => {
    const result = sizeArchitecture(DEFAULT_INPUT)
    const mermaid = toMermaid(result)
    expect(mermaid).toContain('subgraph EDGE')
    expect(mermaid).toContain('subgraph COMPUTE')
    expect(mermaid).toContain('subgraph DATA')
    expect(mermaid).toContain('linkStyle')
    expect(mermaid).not.toMatch(/not yet/)
  })
})
