<div align="center">

<img src="public/favicon.svg" width="88" alt="NapkinStack logo" />

# NapkinStack

**Drag a slider, watch the architecture and the AWS bill grow.**

Napkin math for scaling — as a live diagram, with the formulas showing.

[![Live demo](https://img.shields.io/badge/demo-napkinstack-f5c518?style=flat-square)](https://aviaryan.github.io/napkinstack/)
[![License: MIT](https://img.shields.io/badge/license-MIT-1d4ed8?style=flat-square)](LICENSE)
![No backend](https://img.shields.io/badge/backend-none%20·%20works%20offline-1c1a12?style=flat-square)

<img src="docs/assets/demo.gif" width="900" alt="Dragging the users slider from 400 users to 80 million: boxes sprout, the band heats up, the bill grows" />

### [▶ Try it — napkinstack](https://aviaryan.github.io/napkinstack/)

</div>

---

Every system-design interview and every "will Postgres hold?" Slack thread
starts the same way: napkin math. NapkinStack is the napkin. Type a few
capacity numbers, get a deliberately boring architecture — a scaled monolith
and the usual data-plane boxes — plus a rough monthly cost, with every formula
and assumption on display and editable.

It is a **sketch, not capacity planning**. Nothing is profiled, no API is
called, and after first load it works offline. All the numbers come from
transparent recipes in [`src/data/`](src/data/).

## What it does

- **Presets that tell a story** — one click from side project to
  Instagram-scale (table below).
- **Ghost boxes** show what you *don't* need yet, and why ("no replicas —
  the primary absorbs the misses").
- **Instant-consistency toggle** — watch read-your-writes eat your cache and
  your budget.
- **Real-ish scaling logic** — scale up before out, sharding when one primary
  can't hold the writes, CDN offload for content apps, replica caps.
- **Share / PNG / Mermaid** — every knob lives in the URL, the sheet exports
  as an image, and the graph copies out as Mermaid.
- **The math panel** — every number traces back to a formula you can read.

| Paper | Blueprint |
|---|---|
| ![Paper theme](docs/assets/paper.png) | ![Blueprint theme](docs/assets/blueprint.png) |

## The presets

| Scenario | What happens | Rough bill |
|---|---|---|
| [Side project](https://aviaryan.github.io/napkinstack/?u=400&r=20&w=4&i=0&s=crud&p=3&k=4&c=70&q=200&d=20&n=0&f=cheap&o=0) | One box. You are the failover plan. | **$7/mo** |
| [HN launch](https://aviaryan.github.io/napkinstack/?u=40000&r=40&w=6&i=0&s=content&p=15&k=8&c=85&q=200&d=30&n=2&f=aws&o=65) | Front page, 15× peak, CDN starts earning its keep. | **$440/mo** |
| [Series A](https://aviaryan.github.io/napkinstack/?u=1500000&r=50&w=10&i=0&s=mixed&p=6&k=5&c=80&q=200&d=50&n=2&f=aws&o=35) | Real traffic. Still a monolith — 25 of them. | **$4,057/mo** |
| [IG-scale](https://aviaryan.github.io/napkinstack/?u=80000000&r=120&w=12&i=0&s=content&p=8&k=6&c=90&q=250&d=80&n=4&f=aws&o=65) | ~1M peak QPS, sharded Postgres, 404 app boxes. Still boring. | **$353,582/mo** |

**Add your scale as a preset** — it's a one-file PR to
[`src/data/presets.ts`](src/data/presets.ts). Bring a scenario with a story.

## How the sizer thinks

`sizeArchitecture(input)` in
[`src/lib/sizeArchitecture.ts`](src/lib/sizeArchitecture.ts) is the whole
brain: pure function in, `{band, nodes, edges, cost, math, explanation}` out.

Bands come from **peak QPS**, not user count:

| band   | peak QPS |
|--------|----------|
| hobby  | < 50     |
| small  | < 300    |
| medium | < 2 000  |
| large  | < 10 000 |
| xlarge | ≥ 10 000 |

The knobs and ladders live in [`src/data/`](src/data/) and nowhere else:

- `recipes.ts` — which boxes appear at each band (cache, CDN, queue, pooler…)
- `sizes.ts` — instance ladders, read/write budgets, fleet target, replica cap
- `prices.ts` — ballpark USD/month (`asOf` says when; **update me**)
- `presets.ts` — the named scenarios

Two price flavors: AWS-ish and cheaper-managed (PlanetScale / Fly-style).
Cost is always a **range** (0.7×–1.5× the point guess), because that's what a
napkin gives you.

## FAQ

**Is it accurate?** No. That's the point. Every number is a guess you can see,
argue with, and edit — which is more than most capacity plans can say.

**Why no Kubernetes / microservices?** Because you almost certainly don't need
them. That's the other point.

**Can I use it in interviews / lectures?** Yes — that's what it's for. Export
the PNG, share the URL, steal the numbers.

## Hacking on it

```bash
pnpm install
pnpm dev        # Vite dev server
pnpm test       # vitest — sizing logic
pnpm build      # static site → dist/
```

React + TypeScript + Tailwind, canvas by [`@xyflow/react`](https://github.com/xyflow/xyflow).
The production build is a static folder; GitHub Pages deploys it from
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## License

[MIT](LICENSE). Use it to teach. Do not ship it as a capacity plan.

---

<div align="center">

If this saved you a whiteboard argument, ⭐ the repo so it finds the next person.

</div>
