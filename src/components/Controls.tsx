import type { CSSProperties, ReactNode } from 'react'
import { matchingPresetId, PRESETS } from '../data/presets'
import { CDN_OFFLOAD } from '../data/recipes'
import { DEFAULT_INPUT, USERS_MAX, USERS_MIN, sliderToUsers, usersToSlider } from '../lib/defaults'
import { formatUsers } from '../lib/format'
import type { ArchitectureInput, ArchitectureResult, Provider } from '../lib/types'
import { BandBadge } from './BandBadge'
import { ExportBar } from './ExportBar'

interface ControlsProps {
  input: ArchitectureInput
  result: ArchitectureResult
  onChange: (next: ArchitectureInput) => void
  onReset: () => void
}

export function Controls({ input, result, onChange, onReset }: ControlsProps) {
  const set = <K extends keyof ArchitectureInput>(key: K, value: ArchitectureInput[K]) => {
    onChange({ ...input, [key]: value })
  }

  const avg = result.metrics.avgReadQps + result.metrics.avgWriteQps
  const cacheDisabled = input.instantConsistency
  const activePreset = matchingPresetId(input)
  const userPct = `${Math.round(usersToSlider(input.users) * 1000) / 10}%`
  const cachePct = `${Math.round(input.cacheHitRate * 100)}%`

  return (
    <aside className="flex flex-col gap-5 border-ink/15 bg-panel/80 p-4 sm:p-5 lg:h-full lg:overflow-y-auto lg:border-r">
      <header>
        <p className="font-mono text-[10px] font-medium tracking-[0.22em] text-ballpoint uppercase">Field notes</p>
        <h1 className="font-display text-3xl leading-none font-bold tracking-tight">NapkinStack</h1>
      </header>

      <p className="max-w-prose text-sm leading-relaxed text-muted">
        Drag the knobs. The diagram is a recipe, not a profiler — every number is a transparent guess.
      </p>

      <ExportBar result={result} input={input} onReset={onReset} />

      <fieldset>
        <legend className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Scenarios</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => {
            const active = activePreset === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.blurb}
                data-testid={`preset-${preset.id}`}
                onClick={() => onChange({ ...preset.input })}
                className={`border px-2 py-1.5 text-left font-mono text-[10px] tracking-wide uppercase ${
                  active ? 'border-ink bg-ink text-sheet' : 'border-ink/30 bg-sheet text-ink hover:bg-mark/70'
                }`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="border border-ink bg-sheet px-3 py-3">
        <p className="font-mono text-[11px] text-ink" data-testid="load-summary">
          so the load is ~
          <span className="font-semibold">{formatQpsPlain(avg)}</span> avg QPS, ~
          <span className="font-semibold">{formatQpsPlain(result.metrics.peakTotalQps)}</span> peak QPS
        </p>
        <p className="mt-2">
          <BandBadge band={result.band} testId="band" />
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <Field label="Expected users" hint={formatUsers(input.users)}>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(usersToSlider(input.users) * 1000)}
            onChange={(e) => set('users', sliderToUsers(Number(e.target.value) / 1000))}
            className="sketch-range"
            style={{ '--slider-pct': userPct } as CSSProperties}
            aria-label="Expected users, log scale"
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-muted">{USERS_MIN.toLocaleString()}</span>
            <input
              type="number"
              min={USERS_MIN}
              max={USERS_MAX}
              value={input.users}
              onChange={(e) => set('users', clampInt(e.target.value, USERS_MIN, USERS_MAX, DEFAULT_INPUT.users))}
              className="w-32 border border-ink/30 bg-sheet px-2 py-1 text-right font-mono text-sm"
            />
            <span className="font-mono text-[10px] text-muted">100M</span>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Reads / user / day"
            value={input.readsPerUserDay}
            min={0}
            max={1_000_000}
            onChange={(v) => set('readsPerUserDay', v)}
          />
          <NumberField
            label="Writes / user / day"
            value={input.writesPerUserDay}
            min={0}
            max={1_000_000}
            onChange={(v) => set('writesPerUserDay', v)}
          />
        </div>

        <label className="flex items-start gap-3 border border-ink/20 bg-sheet px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-1 accent-ballpoint"
            checked={input.instantConsistency}
            onChange={(e) => set('instantConsistency', e.target.checked)}
          />
          <span>
            <span className="block text-sm font-bold">Instant consistency</span>
            <span className="block text-xs leading-relaxed text-muted">
              On = read-your-writes. No stale cache, no replica-reads for user-facing traffic.
            </span>
          </span>
        </label>

        <fieldset>
          <legend className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">App shape</legend>
          <div className="grid grid-cols-3 border border-ink">
            <ShapeButton
              active={input.appShape === 'crud'}
              onClick={() => onChange({ ...input, appShape: 'crud', cdnOffload: CDN_OFFLOAD.crud })}
              label="CRUD API"
            />
            <ShapeButton
              active={input.appShape === 'content'}
              onClick={() => onChange({ ...input, appShape: 'content', cdnOffload: CDN_OFFLOAD.content })}
              label="Content"
            />
            <ShapeButton
              active={input.appShape === 'mixed'}
              onClick={() => onChange({ ...input, appShape: 'mixed', cdnOffload: CDN_OFFLOAD.mixed })}
              label="Mixed"
            />
          </div>
        </fieldset>
      </section>

      <details className="border border-ink/20 bg-sheet/70 open:bg-sheet">
        <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase select-none">
          Advanced
        </summary>
        <div className="flex flex-col gap-3 border-t border-ink/15 px-3 py-3">
          <NumberField label="Peak factor" value={input.peakFactor} min={1} max={50} step={0.5} onChange={(v) => set('peakFactor', v)} />
          <NumberField
            label="Avg payload (KB)"
            value={input.payloadKb}
            min={0.1}
            max={10_000}
            step={0.5}
            onChange={(v) => set('payloadKb', v)}
          />
          <label className={cacheDisabled ? 'opacity-45' : ''}>
            <span className="mb-1 block font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              Cache hit rate %
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={99}
                value={Math.round(input.cacheHitRate * 100)}
                disabled={cacheDisabled}
                aria-label="Cache hit rate percent"
                onChange={(e) => set('cacheHitRate', Number(e.target.value) / 100)}
                className="sketch-range min-w-0 flex-1"
                style={{ '--slider-pct': cachePct } as CSSProperties}
              />
              <input
                type="number"
                min={0}
                max={99}
                disabled={cacheDisabled}
                aria-label="Cache hit rate percent"
                value={Math.round(input.cacheHitRate * 100)}
                onChange={(e) => set('cacheHitRate', clampInt(e.target.value, 0, 99, 80) / 100)}
                className="w-16 border border-ink/30 bg-sheet px-2 py-1 text-right font-mono text-sm disabled:bg-panel"
              />
            </div>
            {cacheDisabled ? (
              <p className="mt-1 text-xs text-muted">Ignored while instant consistency is on.</p>
            ) : null}
          </label>
          <NumberField
            label="RPS per app instance (4 vCPU baseline)"
            value={input.rpsPerInstance}
            min={1}
            max={50_000}
            onChange={(v) => set('rpsPerInstance', v)}
          />
          <label>
            <span className="mb-1 block font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              CDN offload %
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={90}
                value={Math.round(input.cdnOffload * 100)}
                aria-label="CDN offload percent"
                onChange={(e) => set('cdnOffload', Number(e.target.value) / 100)}
                className="sketch-range min-w-0 flex-1"
                style={{ '--slider-pct': `${Math.round(input.cdnOffload * 100)}%` } as CSSProperties}
              />
              <input
                type="number"
                min={0}
                max={90}
                aria-label="CDN offload percent"
                value={Math.round(input.cdnOffload * 100)}
                onChange={(e) => set('cdnOffload', clampInt(e.target.value, 0, 90, 0) / 100)}
                className="w-16 border border-ink/30 bg-sheet px-2 py-1 text-right font-mono text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-muted">
              Share of reads the edge serves. Content defaults to 65%; CRUD stays at 0.
            </p>
          </label>
          <NumberField
            label="Data stored per user (KB)"
            value={input.bytesPerUser / 1000}
            min={0.1}
            max={1_000_000}
            step={1}
            onChange={(v) => set('bytesPerUser', v * 1000)}
          />
          <NumberField label="Spare instances / N+2" value={input.spare} min={0} max={50} step={1} onChange={(v) => set('spare', Math.round(v))} />

          <fieldset>
            <legend className="mb-1.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              Provider flavor
            </legend>
            <div className="grid grid-cols-2 border border-ink">
              <ShapeButton
                active={input.provider === 'aws'}
                onClick={() => set('provider', 'aws' satisfies Provider)}
                label="AWS-ish"
              />
              <ShapeButton
                active={input.provider === 'cheap'}
                onClick={() => set('provider', 'cheap')}
                label="Cheaper managed"
              />
            </div>
          </fieldset>
        </div>
      </details>
    </aside>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{label}</span>
        {hint ? <span className="font-mono text-[11px] text-ballpoint">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clampNum(e.target.value, min, max, value))}
        className="w-full border border-ink/30 bg-sheet px-2 py-1.5 font-mono text-sm"
      />
    </label>
  )
}

function ShapeButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-2 font-mono text-[11px] tracking-wide uppercase ${
        active ? 'bg-ink text-sheet' : 'bg-sheet text-ink hover:bg-mark/70'
      }`}
    >
      {label}
    </button>
  )
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.round(Math.min(max, Math.max(min, n)))
}

function clampNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function formatQpsPlain(n: number): string {
  if (n >= 10_000) return Math.round(n).toLocaleString('en-US')
  if (n >= 100) return String(Math.round(n))
  if (n >= 10) return n.toFixed(1)
  return n.toFixed(2)
}
