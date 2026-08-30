import type { Theme } from '../lib/theme'

export function Banner({ theme, onTheme }: { theme: Theme; onTheme: (theme: Theme) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink/20 bg-[var(--color-banner)] px-3 py-1.5 text-[var(--color-banner-ink)] sm:px-4">
      <p className="min-w-0 flex-1 text-center font-mono text-[11px] leading-relaxed tracking-wide sm:text-xs">
        Back-of-the-envelope math with editable assumptions. Not a capacity plan.
      </p>
      <div className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] tracking-[0.14em] uppercase">
        <button
          type="button"
          onClick={() => onTheme('paper')}
          aria-pressed={theme === 'paper'}
          className={`px-1.5 py-0.5 ${theme === 'paper' ? 'bg-mark text-mark-ink' : 'text-[var(--color-banner-ink)]/70 hover:text-[var(--color-banner-ink)]'}`}
        >
          Paper
        </button>
        <span className="text-[var(--color-banner-ink)]/40" aria-hidden="true">
          /
        </span>
        <button
          type="button"
          onClick={() => onTheme('blueprint')}
          aria-pressed={theme === 'blueprint'}
          data-testid="theme-blueprint"
          className={`px-1.5 py-0.5 ${theme === 'blueprint' ? 'bg-mark text-mark-ink' : 'text-[var(--color-banner-ink)]/70 hover:text-[var(--color-banner-ink)]'}`}
        >
          Blueprint
        </button>
      </div>
    </div>
  )
}
