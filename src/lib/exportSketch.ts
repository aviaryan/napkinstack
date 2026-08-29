import { toMermaid } from './mermaid'
import type { ArchitectureResult } from './types'

export async function copySketchLink(): Promise<void> {
  await navigator.clipboard.writeText(window.location.href)
}

export async function copyMermaid(result: ArchitectureResult): Promise<void> {
  await navigator.clipboard.writeText(toMermaid(result))
}

export async function downloadDiagramPng(filename: string): Promise<void> {
  const el = document.querySelector('[data-testid="diagram"]')
  if (!(el instanceof HTMLElement)) throw new Error('diagram missing')
  const { toPng } = await import('html-to-image')
  const bg = getComputedStyle(el).backgroundColor || '#f4efdd'
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: bg,
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true
      if (node.dataset.exportHide) return false
      if (node.classList.contains('react-flow__controls')) return false
      return true
    },
  })
  const a = document.createElement('a')
  a.download = filename
  a.href = dataUrl
  a.click()
}
