import { useState } from 'react'
import { copyMermaid, copySketchLink, downloadDiagramPng } from '../lib/exportSketch'
import type { ArchitectureResult } from '../lib/types'

export function ExportBar({ result }: { result: ArchitectureResult }) {
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 1600)
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-1">
        <ChromeButton
          testId="share"
          onClick={() => {
            void copySketchLink()
              .then(() => flash('Sketch link copied'))
              .catch(() => flash('Could not copy link'))
          }}
        >
          Share
        </ChromeButton>
        <ChromeButton
          testId="download-png"
          title="Download PNG"
          disabled={exporting}
          onClick={() => {
            setExporting(true)
            void downloadDiagramPng(`archsketch-${result.band}.png`)
              .then(() => flash('PNG downloaded'))
              .catch(() => flash('Could not render PNG'))
              .finally(() => setExporting(false))
          }}
        >
          {exporting ? '…' : 'PNG'}
        </ChromeButton>
        <ChromeButton
          testId="copy-mermaid"
          title="Copy as Mermaid"
          onClick={() => {
            void copyMermaid(result)
              .then(() => flash('Mermaid copied'))
              .catch(() => flash('Could not copy'))
          }}
        >
          Mermaid
        </ChromeButton>
      </div>
      {toast ? <p className="mt-1.5 font-mono text-[10px] text-ballpoint">{toast}</p> : null}
    </div>
  )
}

function ChromeButton({
  children,
  onClick,
  disabled,
  testId,
  title,
}: {
  children: string
  onClick: () => void
  disabled?: boolean
  testId?: string
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      title={title}
      className="border border-ink bg-sheet px-1 py-1 font-mono text-[9px] tracking-wider uppercase hover:bg-mark disabled:opacity-50 sm:text-[10px] sm:px-2"
    >
      {children}
    </button>
  )
}
