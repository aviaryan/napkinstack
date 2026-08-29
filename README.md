# ArchSketch

A static, no-backend teaching tool. You type a few capacity numbers; it draws a boring system diagram and a rough monthly cost.

This is a **demo / back-of-the-envelope sketch**, not capacity planning. Numbers come from hardcoded recipes and formulas in `src/data/`. Nothing is profiled. No LLM is called.

## What this is not

- Not a quote, an AWS calculator, or a production sizer
- Not a Kubernetes / Terraform / microservice designer
- Not connected to any API. After the first load it works offline

## Run

```bash
pnpm install
pnpm dev
```

Open the Vite URL (usually `http://localhost:5173`).

```bash
pnpm test          # sizing-function unit tests
pnpm build         # static site → dist/
pnpm preview       # serve dist/
```

The production build is a static `dist/` folder. Drop it on GitHub Pages, Cloudflare Pages, or any static host.

## How it works

`sizeArchitecture(input)` in `src/lib/sizeArchitecture.ts` is the whole brain. It returns band, nodes, edges, cost, explanation, and the plugged-in math.

Bands are chosen from **peak QPS**, not user count:

| band   | peak QPS |
|--------|----------|
| hobby  | < 50     |
| small  | < 300    |
| medium | < 2 000  |
| large  | < 10 000 |
| xlarge | ≥ 10 000 |

The live canvas is `@xyflow/react`. There is an optional **Copy as Mermaid** dump of the same graph.

Share a sketch: the query string serializes every input. Reload or send the link.

## Tweak recipes, sizes, prices

`src/data/` is the only place these constants live. The UI does not inline them.

- `recipes.ts` — which boxes appear at each band (cache, CDN, queue, pooler, …)
- `sizes.ts` — instance classes, read budgets, replica QPS
- `prices.ts` — 2026 ballpark USD/month (`asOf: "2026-08"`). **update me** when you refresh numbers

Two price tables: AWS-ish and cheaper-managed (PlanetScale / Fly-flavored labels and dollars). Same diagram, different `$`.

Cost is shown as a **rough** range: 0.7× to 1.5× the point estimate.

## License

Use it to teach. Do not ship it as a capacity plan.
