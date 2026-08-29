import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import { Banner } from './components/Banner'
import { Controls } from './components/Controls'
import { CostPanel } from './components/CostPanel'
import { Diagram } from './components/Diagram'
import { DEFAULT_INPUT } from './lib/defaults'
import { sizeArchitecture } from './lib/sizeArchitecture'
import { parseInputFromSearch, writeUrl } from './lib/urlState'
import type { ArchitectureInput } from './lib/types'

export function App() {
  const [input, setInput] = useState<ArchitectureInput>(() =>
    parseInputFromSearch(window.location.search),
  )

  const result = useMemo(() => sizeArchitecture(input), [input])

  useEffect(() => {
    writeUrl(input)
  }, [input])

  return (
    <div className="min-h-dvh">
      <Banner />
      <main className="mx-auto grid min-h-[calc(100dvh-40px)] max-w-[1440px] lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
        <Controls input={input} result={result} onChange={setInput} onReset={() => setInput({ ...DEFAULT_INPUT })} />
        <div className="flex min-h-0 flex-col">
          <ReactFlowProvider>
            <Diagram result={result} />
          </ReactFlowProvider>
          <CostPanel result={result} />
        </div>
      </main>
    </div>
  )
}
