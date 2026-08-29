import { DEFAULT_INPUT, USERS_MAX, USERS_MIN, clamp } from './defaults'
import type { AppShape, ArchitectureInput, Provider } from './types'

const SHAPES: AppShape[] = ['crud', 'content', 'mixed']
const PROVIDERS: Provider[] = ['aws', 'cheap']

function num(value: string | null, fallback: number, min?: number, max?: number): number {
  if (value == null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  if (min != null && max != null) return clamp(n, min, max)
  return n
}

function bool(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback
  return value === '1' || value === 'true'
}

export function parseInputFromSearch(search: string): ArchitectureInput {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const shape = q.get('s')
  const provider = q.get('f')
  const cachePct = num(q.get('c'), DEFAULT_INPUT.cacheHitRate * 100, 0, 100)

  return {
    users: Math.round(num(q.get('u'), DEFAULT_INPUT.users, USERS_MIN, USERS_MAX)),
    readsPerUserDay: num(q.get('r'), DEFAULT_INPUT.readsPerUserDay, 0, 1_000_000),
    writesPerUserDay: num(q.get('w'), DEFAULT_INPUT.writesPerUserDay, 0, 1_000_000),
    instantConsistency: bool(q.get('i'), DEFAULT_INPUT.instantConsistency),
    appShape: SHAPES.includes(shape as AppShape) ? (shape as AppShape) : DEFAULT_INPUT.appShape,
    peakFactor: num(q.get('p'), DEFAULT_INPUT.peakFactor, 1, 50),
    payloadKb: num(q.get('k'), DEFAULT_INPUT.payloadKb, 0.1, 10_000),
    cacheHitRate: cachePct / 100,
    rpsPerInstance: num(q.get('q'), DEFAULT_INPUT.rpsPerInstance, 1, 50_000),
    bytesPerUser: num(q.get('d'), DEFAULT_INPUT.bytesPerUser / 1000, 0.1, 1_000_000) * 1000,
    spare: Math.round(num(q.get('n'), DEFAULT_INPUT.spare, 0, 50)),
    provider: PROVIDERS.includes(provider as Provider) ? (provider as Provider) : DEFAULT_INPUT.provider,
  }
}

export function inputToSearch(input: ArchitectureInput): string {
  const q = new URLSearchParams()
  q.set('u', String(Math.round(input.users)))
  q.set('r', String(input.readsPerUserDay))
  q.set('w', String(input.writesPerUserDay))
  q.set('i', input.instantConsistency ? '1' : '0')
  q.set('s', input.appShape)
  q.set('p', String(input.peakFactor))
  q.set('k', String(input.payloadKb))
  q.set('c', String(Math.round(input.cacheHitRate * 100)))
  q.set('q', String(input.rpsPerInstance))
  q.set('d', String(input.bytesPerUser / 1000))
  q.set('n', String(input.spare))
  q.set('f', input.provider)
  return q.toString()
}

export function writeUrl(input: ArchitectureInput): void {
  const qs = inputToSearch(input)
  const next = `${window.location.pathname}?${qs}${window.location.hash}`
  window.history.replaceState(null, '', next)
}
