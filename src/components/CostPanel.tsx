import { useState } from 'react'
import { formatUsd } from '../lib/format'
import { toMermaid } from '../lib/mermaid'
import type { ArchitectureResult } from '../lib/types'

interface CostPanelProps {
  result: ArchitectureResult
}

export function CostPanel({ result }: CostPanelProps) {
  const [copied, setCopied] = useState(false)
  const { cost } = result

  async function copyMermaid() {
    await navigator.clipboard.writeText(toMermaid(result))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="flex flex-col gap-4 bg-panel/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted uppercase">Monthly cost · rough</p>
          <p className="font-display text-3xl leading-none font-bold tracking-tight" data-testid="cost-range">
            {formatUsd(cost.low)}–{formatUsd(cost.high)}
            <span className="ml-2 font-sans text-sm font-normal text-muted">USD / mo</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted">
            point {formatUsd(cost.point)} · 0.7×–1.5× · prices as of {cost.asOf}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyMermaid()}
          className="border border-ink bg-sheet px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase hover:bg-mark"
        >
          {copied ? 'Copied' : 'Copy as Mermaid'}
        </button>
      </div>

      <div>
        <h2 className="font-mono text-[10px] tracking-[0.18em] text-ballpoint uppercase">Why this shape</h2>
        <ul className="mt-2 max-w-3xl space-y-1.5 text-sm leading-relaxed" data-testid="explanation">
          {result.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <details className="border border-ink/20 bg-sheet/80">
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

      <details className="border border-ink/20 bg-sheet/80">
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
    </section>
  )
}
