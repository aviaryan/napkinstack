import type { ArchitectureInput } from './types'

export const USERS_MIN = 100
export const USERS_MAX = 100_000_000

export const DEFAULT_INPUT: ArchitectureInput = {
  users: 1_000_000,
  readsPerUserDay: 50,
  writesPerUserDay: 10,
  instantConsistency: false,
  appShape: 'crud',
  peakFactor: 5,
  payloadKb: 5,
  cacheHitRate: 0.8,
  rpsPerInstance: 200,
  bytesPerUser: 50_000,
  spare: 2,
  provider: 'aws',
  cdnOffload: 0,
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function usersToSlider(users: number): number {
  const t = Math.log10(users / USERS_MIN) / Math.log10(USERS_MAX / USERS_MIN)
  return clamp(t, 0, 1)
}

export function sliderToUsers(t: number): number {
  const users = USERS_MIN * (USERS_MAX / USERS_MIN) ** clamp(t, 0, 1)
  return Math.round(users)
}
