export const FLASH_MS = 1400
export const LEDGER_MS = 5000

export function ChangeLedger({ notes, onDismiss }: { notes: string[]; onDismiss: () => void }) {
  if (notes.length === 0) return null

  return (
    <div
      className="change-ledger pointer-events-none absolute top-3 left-3 z-10 max-w-[16rem] rotate-[-1.5deg] sm:left-16"
      data-testid="change-ledger"
      style={{ animationDuration: `${LEDGER_MS}ms` }}
    >
      <div className="flex items-baseline gap-2">
        <p className="font-mono text-[9px] tracking-[0.18em] text-muted uppercase">what changed</p>
        <button
          type="button"
          onClick={onDismiss}
          className="pointer-events-auto font-mono text-[10px] leading-none tracking-wider text-muted uppercase hover:text-ink"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {notes.map((note) => (
          <li key={note} className="font-display text-[13px] leading-snug text-ballpoint italic">
            {note}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 font-display text-[12px] text-muted italic">click a box for the why</p>
    </div>
  )
}
