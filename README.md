# Sentinel

**An edge bot-firewall on Cloudflare Workers — without paid Bot Management.**

Most "I built a firewall" projects either wrap a vendor API or block a
hardcoded User-Agent list. Sentinel does the actual work: it scores every
request from signals available on the **Workers Free plan** and gives
suspicious clients a tighter rate-limit budget. The heuristics are the
product.

🔗 **Live, attackable demo:** *(deployed URL — try to get past it)*

---

## Why this is non-trivial

Cloudflare's `request.cf.botManagement` score is Enterprise-only. The
interesting constraint is detecting automation **without** it. Sentinel
combines weak signals into a calibrated score:

| Signal | What it catches |
|---|---|
| Empty / library / scanner User-Agent | curl, requests, scrapy, nuclei, sqlmap… |
| Browser UA but missing `Accept` / `Accept-Language` | hand-rolled HTTP clients |
| Chrome ≥ 90 UA but no `Sec-CH-UA` / `Sec-Fetch-*` | **spoofed** User-Agents |
| "Modern browser" over HTTP/1.1 (CF gives browsers h2/h3) | CLI clients faking a browser |
| Obsolete TLS version | legacy tooling |
| Datacenter AS-org (AWS/OVH/Hetzner…) claiming to be a browser | bots on rented infra |
| Cloudflare free `threatScore` | known-bad networks |

Score → `ALLOW` (200) · `CHALLENGE` (403) · `BLOCK` (403). `429` is
reserved strictly for rate-limited clients.

## Adaptive rate limiting

A per-client Durable Object keeps a sliding window. The budget **shrinks
with the suspicion score** — a clean browser gets the full window, a
client scoring 60+ gets ~15% of it. Abuse gets expensive; real users
don't notice. SQLite-backed Durable Objects → runs on the **free plan**.

## Architecture

```
            ┌────────────── Worker ──────────────┐
 request ─▶ │ score.js  (pure heuristics, 0–100) │
            │     │                               │
            │     ▼                               │
            │ RateLimiter DO  (1 per client IP)   │  adaptive sliding window
            │     │                               │
            │     ▼                               │
            │ verdict ─▶ 200 / 429 / 403          │
            │     │                               │
            │     ▼ (waitUntil, off the hot path) │
            │ Stats DO  (global counters + log)   │ ─▶ live dashboard
            └─────────────────────────────────────┘
```

`scoreRequest()` is a pure function — trivially unit-testable, no I/O.
Stats recording is fire-and-forget via `ctx.waitUntil`, so detection
never adds latency to the verdict.

## Honest metrics

The dashboard counters only ever reflect real traffic that hit the demo.
No invented uptime, no decorative "312 edge nodes". If a number is shown,
something actually produced it.

## Run it

```bash
npm install
wrangler deploy        # uses your existing wrangler auth
```

No secrets, no paid add-ons, no build step.

## Roadmap

- [ ] D1-backed history for time-series charts
- [ ] Proof-of-work challenge for the `CHALLENGE` tier
- [ ] Reverse-proxy mode (sit in front of a real origin, not just a demo)
- [ ] Publishable npm middleware for non-Cloudflare stacks
- [ ] JA3/JA4 fingerprinting if/when available without Enterprise

## License

MIT
