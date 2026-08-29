# ArchSketch — build prompt

Use this as the full spec for an AI coding agent. Build the app from this file.

---

Build **ArchSketch**: a static, no-backend learning tool that turns a few capacity inputs into a live system-architecture diagram plus a rough monthly cost.

This is a **DEMO / TEACHING tool**, not a production sizer. Every number is a transparent back-of-the-envelope estimate. Never call an LLM or any API when inputs change. All architecture choices come from hardcoded recipes and formulas in data files.

## Stack

- Vite + React + TypeScript + Tailwind
- `@xyflow/react` for the diagram (do **NOT** use Mermaid or Excalidraw as the live canvas)
- Optional: a "Copy as Mermaid" button that dumps the current graph
- Fully static. No login, no server, no env secrets. Deployable to GitHub Pages / Cloudflare Pages / any static host.
- Works offline after first load.

## UX

Single page, two columns on desktop, stacked on mobile.

**LEFT: controls**

- Basic (always visible):
  - Expected users (slider + number, default `1_000_000`, range `100` to `100_000_000`, log scale)
  - Reads per user per day (default `50`)
  - Writes per user per day (default `10`)
  - Instant consistency? toggle. ON = read-your-writes / no stale cache for user-facing reads. OFF = eventual consistency OK.
  - App shape: mostly CRUD API (default) | content/media | mixed
- Advanced (collapsed by default):
  - Peak factor (default `5`)
  - Avg payload size KB (default `5`)
  - Cache hit rate % (default `80`, disabled/ignored when instant consistency is ON for user-facing reads)
  - RPS a single app instance can take (default `200`)
  - Data stored per user (default `50 KB`)
  - Spare instances / N+2 (default `2`)
  - Provider flavor: AWS-ish (default) | cheaper managed (PlanetScale + Fly/Render vibe)
- A live "so the load is ~X avg QPS, ~Y peak QPS" summary under the sliders.
- Reset-to-defaults.

**RIGHT: diagram + cost**

- XYFlow canvas with the current architecture. Nodes must show live counts, e.g. `App x 4 · ~2 vCPU · 4 GB`, `Postgres primary · db.r5.large · 100 GB`.
- Edges labeled with the traffic they carry (e.g. `~580 rps reads`).
- Below the canvas: monthly cost range (low-high), a 3-6 line "why this shape" explanation, and a list of assumptions used.
- Banner at top of the page: `Back-of-the-envelope. Assumptions are editable. Not capacity planning.`

Everything (diagram, node labels, costs, explanation) updates as the user drags sliders. Debounce at most ~50ms. No page reload.

## Derivation

Implement exactly. Put constants in `src/data/`.

```
avg_read_qps  = users * reads_per_user_day  / 86400
avg_write_qps = users * writes_per_user_day / 86400
peak_read_qps  = avg_read_qps  * peak_factor
peak_write_qps = avg_write_qps * peak_factor
peak_total_qps = peak_read_qps + peak_write_qps
storage_gb = users * bytes_per_user / 1e9 * 1.5   // 1.5 = indexes/overhead
```

App instances:

```
app_n = max(1, ceil(peak_total_qps / rps_per_instance) + spare)
if band != hobby: app_n = max(app_n, 2)  // HA
```

Read replicas (only if instant consistency is OFF):

```
effective_db_reads = peak_read_qps * (1 - cache_hit_rate)
replicas = max(0, ceil((effective_db_reads - primary_read_budget_qps) / replica_qps))
```

If instant consistency is ON: `replicas = 0` for user-facing reads, cache is write-through or very short TTL, primary is sized up, explanation must say why.

## Hardcoded bands (`src/data/recipes.ts`)

Pick a band from `peak_total_qps` (not from user count):

1. **hobby** — peak < 50 QPS
   Single box: one app+postgres on one VM. No LB. Optional sqlite/postgres local.

2. **small** — peak < 300 QPS
   Nginx/ALB + `app_n` + one Postgres. No cache unless reads/writes > 8.

3. **medium** — peak < 2000 QPS
   ALB + `app_n` + Redis + Postgres primary. Replicas as formula. CDN if content/media.

4. **large** — peak < 10_000 QPS
   ALB + `app_n` + Redis cluster + primary + replicas + managed queue (SQS/Redis) if `write_qps > 400`. CDN. Object storage if media.

5. **xlarge** — peak >= 10_000 QPS
   Same as large + note sharding / connection pooling (PgBouncer) / multiple app pools. Do **NOT** invent Kubernetes or 15 microservices. Keep it a boring scaled monolith plus the usual data-plane pieces.

Instant consistency ON should never introduce async replica-reads or a CDN as the source of truth. It may still use a CDN for static assets.

Each recipe defines which node types appear. Instance sizes (app RAM/CPU, db class, redis class) are looked up from `src/data/sizes.ts` by the derived QPS/storage, not hallucinated.

## Costs (`src/data/prices.ts`)

Hardcode round 2026 ballpark USD/month, with a `asOf: "2026-08"` field and a comment `update me`.

Include: small/medium/large VM, ALB base, Postgres (or PlanetScale two-row equivalent), Redis, SQS-ish, S3, CloudFront-ish, egress guess from `peak_qps * payload * 2.6e6` seconds/month.

Show a range: 0.7x to 1.5x the point estimate. Label it "rough".

Provider flavor toggles which price table is used (AWS-ish vs cheaper managed). Same diagram, different $ and a couple of node titles (RDS vs PlanetScale, ALB vs Fly proxy).

## Diagram nodes to support

Client, CDN, Load balancer / reverse proxy, App, Cache, Queue, Primary DB, Read replica, Object storage.

Do not add auth, search, analytics, k8s, or microservices unless a recipe explicitly includes them. Keep diagrams readable: 4-9 nodes.

Layout: left-to-right request path. Replicas stacked under primary. App node is one box with a xN badge, not N separate boxes (unless N <= 3).

## Copy / teaching

Explanation should be 3-6 short sentences, generated from templates keyed by band + flags (instant, media, write-heavy), interpolating the actual numbers. No LLM.

Show the formulas with the plugged-in numbers in a small "math" disclosure.

## Project extras

- README: what this is, what it is not, how to run, how to tweak recipes/prices
- `src/data/` is the only place bands, sizes, and prices live. UI never inlines those constants.
- Unit tests for the pure sizing function (hobby/small/medium/large/xlarge transitions, instant-consistency replica=0, HA min 2, storage math). Use vitest.
- Shareable URL: serialize inputs to query string so a link restores the sketch
- Favicon + a clean typographic UI (neutral, not purple-SaaS). Title: ArchSketch
- Production build should emit a static `dist/` folder.

## Non-goals

- No accounts, no backend, no AI, no generate-architecture-with-ChatGPT
- No Kubernetes designer, no Terraform export in v1
- No pretending these numbers are from a profiler
- Do not bikeshed extra features. Ship the live loop first.

## Done when

1. Install and start the Vite dev server, and the app shows
2. Dragging users from 1k to 10M visibly morphs the diagram through the bands
3. Toggling instant consistency removes replica-reads and updates the explanation
4. Advanced sliders change instance counts and cost without a reload
5. Tests cover the sizing function
6. README is honest

Start by creating the Vite app, the data files, the pure sizeArchitecture(input) function that returns band, nodes, edges, cost, explanation, and math, then tests, then the UI.
