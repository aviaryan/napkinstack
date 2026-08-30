import { useState } from 'react'
import { isDefaultInput } from '../lib/defaults'
import { copyMermaid, copySketchLink, downloadDiagramPng } from '../lib/exportSketch'
import type { ArchitectureInput, ArchitectureResult } from '../lib/types'

export function ExportBar({
  result,
  input,
  onReset,
}: {
  result: ArchitectureResult
  input: ArchitectureInput
  onReset: () => void
}) {
  const [toast, setToast] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const atDefaults = isDefaultInput(input)

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
            void downloadDiagramPng(`napkinstack-${result.band}.png`)
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
      <button
        type="button"
        onClick={onReset}
        disabled={atDefaults}
        data-testid="reset"
        title="Reset all inputs to defaults"
        className="mt-1 w-full border border-ink bg-sheet px-2 py-1.5 leading-tight text-ink hover:bg-mark disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-muted disabled:hover:bg-sheet"
      >
        <span className="block font-mono text-[10px] font-medium tracking-wider uppercase">Tear off sheet</span>
        <span className="mt-0.5 block font-mono text-[9px] tracking-wide text-muted">reset the knobs</span>
      </button>
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
