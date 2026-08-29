import { useEffect, useRef, useState } from 'react'
import { BAND_COLOR, bandInk } from '../lib/bandStyle'
import type { Band } from '../lib/types'

export function BandBadge({ band, testId }: { band: Band; testId?: string }) {
  const [stamp, setStamp] = useState(false)
  const prev = useRef(band)

  useEffect(() => {
    if (prev.current === band) return
    prev.current = band
    setStamp(true)
    const t = window.setTimeout(() => setStamp(false), 280)
    return () => window.clearTimeout(t)
  }, [band])

  return (
    <span
      className={`inline-block px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide uppercase ${stamp ? 'band-stamp' : ''}`}
      style={{ background: BAND_COLOR[band], color: bandInk(band) }}
      data-testid={testId}
    >
      band {band}
    </span>
  )
}
