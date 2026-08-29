import { useState } from 'react'
import { useCountUp } from '../lib/countUp'
import { formatUsd } from '../lib/format'
import type { ArchitectureResult, CostItem } from '../lib/types'
import { BandBadge } from './BandBadge'

interface CostDockProps {
  result: ArchitectureResult
}

export function CostDock({ result }: CostDockProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open ? null : <PriceTag result={result} onOpenNotes={() => setOpen(true)} />}
      {open ? <NotesDrawer result={result} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function PriceTag({ result, onOpenNotes }: { result: ArchitectureResult; onOpenNotes: () => void }) {
  const { cost } = result
  const low = useCountUp(cost.low)
  const high = useCountUp(cost.high)
  const biggest = biggestCostItem(cost.items)

  return (
    <div className="absolute bottom-2 left-2 z-20 max-w-[min(100%-1rem,22rem)] border border-ink bg-sheet/95 px-3 py-2 shadow-[3px_3px_0_var(--shadow-ink)]">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">Monthly · rough</p>
      <p
        className="font-display text-2xl leading-none font-bold tracking-tight tabular-cost sm:text-3xl"
        data-testid="cost-range"
      >
        {formatUsd(low)}–{formatUsd(high)}
        <span className="ml-1.5 font-sans text-sm font-normal text-muted">/ mo</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <BandBadge band={result.band} />
        <span className="font-mono text-[10px] text-muted">point {formatUsd(cost.point)}</span>
      </div>
      {biggest ? (
        <p className="mt-1.5 font-mono text-[10px] text-muted" data-testid="cost-teaser">
          biggest line: {biggest.name} ({formatUsd(biggest.monthly)})
        </p>
      ) : null}
      <button
        type="button"
        onClick={onOpenNotes}
        className="mt-2 font-mono text-[10px] tracking-[0.14em] text-ballpoint uppercase hover:underline"
      >
        Why this sketch
      </button>
    </div>
  )
}

function NotesDrawer({ result, onClose }: { result: ArchitectureResult; onClose: () => void }) {
  const { cost } = result
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col justify-end bg-ink/40"
      data-testid="notes-drawer"
      onClick={onClose}
    >
      <div
        className="notes-drawer max-h-[min(70%,32rem)] overflow-y-auto border-t-2 border-ink bg-node p-4 shadow-[0_-8px_24px_var(--shadow-ink)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-mono text-[10px] tracking-[0.18em] text-ballpoint uppercase">Why this shape</h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-wider text-muted uppercase hover:text-ink"
          >
            Fold away
          </button>
        </div>
        <ul className="max-w-3xl space-y-1.5 text-sm leading-relaxed" data-testid="explanation">
          {result.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <details className="mt-4 border border-ink/20 bg-panel/50">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase select-none">
            Math
          </summary>
          <div className="overflow-x-auto border-t border-ink/15 px-3 py-2">
            <table className="w-full min-w-[520px] text-left font-mono text-[11px]">
              <tbody>
                {result.math.map((row) => (
                  <tr key={row.label} className="border-b border-ink/10 last:border-0">
                    <th className="py-1 pr-3 font-medium whitespace-nowrap text-ballpoint">{row.label}</th>
                    <td className="py-1 pr-3 text-muted">{row.formula}</td>
                    <td className="py-1 text-right font-semibold">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="mt-2 border border-ink/20 bg-panel/50">
          <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase select-none">
            Assumptions
          </summary>
          <ul className="list-disc space-y-1 border-t border-ink/15 px-6 py-2 text-sm text-muted">
            {result.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {cost.items.map((item) => (
              <li key={item.name}>
                {item.name}: {formatUsd(item.monthly)}/mo
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}

function biggestCostItem(items: CostItem[]): CostItem | null {
  if (items.length === 0) return null
  return items.reduce((best, item) => (item.monthly > best.monthly ? item : best))
}
