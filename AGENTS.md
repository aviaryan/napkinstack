# ArchSketch

Static teaching tool: capacity inputs → architecture diagram + rough monthly cost. No backend, no LLM, no APIs on input change. Fully client-side.

## Commands

Use **pnpm** (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`).

## Where to change things

- `src/data/` is the only place for bands, recipes, instance sizes, and prices. Do not inline those constants in the UI.
- `src/lib/sizeArchitecture.ts` is the pure sizer. Keep it side-effect free. Tests live in `src/lib/*.test.ts` (vitest).
- Live canvas is `@xyflow/react`. Do not replace it with Mermaid/Excalidraw (Mermaid export as copy-paste is fine).

## Constraints

- Demo / back-of-the-envelope only. Do not pretend numbers are from a profiler.
- Keep diagrams boring: scaled monolith + usual data-plane boxes. No k8s, microservices, auth, or Terraform in v1.
- Share state via the query string (`src/lib/urlState.ts`).
