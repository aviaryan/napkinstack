import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import { Banner } from './components/Banner'
import { Controls } from './components/Controls'
import { Diagram } from './components/Diagram'
import { DEFAULT_INPUT } from './lib/defaults'
import { sizeArchitecture } from './lib/sizeArchitecture'
import { applyTheme, readTheme, type Theme } from './lib/theme'
import { parseInputFromSearch, writeUrl } from './lib/urlState'
import type { ArchitectureInput } from './lib/types'

export function App() {
  const [input, setInput] = useState<ArchitectureInput>(() =>
    parseInputFromSearch(window.location.search),
  )
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  const result = useMemo(() => sizeArchitecture(input), [input])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.band = result.band
  }, [result.band])

  useEffect(() => {
    writeUrl(input, theme)
  }, [input, theme])

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <Banner theme={theme} onTheme={setTheme} />
      <main className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <Controls
          input={input}
          result={result}
          onChange={setInput}
          onReset={() => setInput({ ...DEFAULT_INPUT })}
        />
        <ReactFlowProvider>
          <Diagram result={result} theme={theme} users={input.users} />
        </ReactFlowProvider>
      </main>
    </div>
  )
}
