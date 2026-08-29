export function formatQps(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 10_000) return `${Math.round(n).toLocaleString('en-US')} qps`
  if (abs >= 100) return `${Math.round(n)} qps`
  if (abs >= 10) return `${n.toFixed(1)} qps`
  if (abs >= 1) return `${n.toFixed(2)} qps`
  return `${n.toFixed(3)} qps`
}

export function formatQpsShort(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 10_000) return Math.round(n).toLocaleString('en-US')
  if (abs >= 100) return String(Math.round(n))
  if (abs >= 10) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

export function formatUsers(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return Number.isInteger(m) ? `${m}M` : `${parseFloat(m.toFixed(2))}M`
  }
  if (n >= 1000) {
    const k = n / 1000
    return Number.isInteger(k) ? `${k}k` : `${parseFloat(k.toFixed(1))}k`
  }
  return n.toLocaleString('en-US')
}

export function formatUsd(n: number): string {
  if (n < 10) return `$${n.toFixed(0)}`
  if (n < 1000) return `$${Math.round(n)}`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function formatGb(n: number): string {
  if (n < 1) return `${Math.round(n * 1000)} MB`
  if (n < 10) return `${n.toFixed(1)} GB`
  return `${Math.round(n)} GB`
}

export function formatNumber(n: number, digits = 1): string {
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString('en-US')
  return n.toFixed(digits)
}
