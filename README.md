# Sentinel

**An enterprise-grade edge bot-firewall on Cloudflare Workers — designed for zero-trust traffic filtering and adaptive rate limiting.**

Sentinel does not rely on third-party APIs or expensive enterprise licenses. It performs live request scoring directly at the edge, using low-level HTTP client-hints, TLS profiles, transport heuristics, and autonomous system (AS) routing telemetry available on the Cloudflare Free plan.

---

## ⚡ Key Architecture & Features

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

*   **Heuristics Engine (`src/score.js`)**: Evaluates client signatures in memory. Calculates a suspicion score (0–100) based on header shapes, HTTP version mismatches, client hints, TLS details, and autonomous system classification.
*   **Adaptive Rate Limiting (`src/ratelimiter.js`)**: Backed by Cloudflare Durable Objects. Dynamically shrinks the client rate-limiting window as their suspicion score increases. Suspected bots get restricted to a fraction of the budget, while legitimate browsers get full speed.
*   **Error Isolation**: Secondary telemetry tasks (statistics tracking, structured logging) are fully wrapped to fail-silent, and the rate limiter fails-open if a Durable Object storage failure occurs, ensuring zero impact on real traffic.
*   **Structured JSON Logging (`src/logger.js`)**: Outputs structured JSON lines for every decision (ALLOW, CHALLENGE, BLOCK, RATE_LIMIT) and error. Loki and Elasticsearch ready.
*   **PII Sanitization**: Coarsens client IP addresses prior to logging or state processing to comply with GDPR and prevent credential leaks.

---

## ⚙️ Configuration Management

Sentinel is fully configurable. All 23 core weights, limits, and thresholds are externalized in `src/config.js` and read dynamically from environment variables defined in `wrangler.toml`:

| Variable | Default | Description |
|---|---|---|
| `VERDICT_CHALLENGE_THRESHOLD` | `60` | Score threshold to trigger challenge |
| `VERDICT_BLOCK_THRESHOLD` | `85` | Score threshold to trigger blocking |
| `LIMIT_BASE_WINDOW_SEC` | `60` | Base window for sliding rate limit |
| `LIMIT_MAX_SUSPICION` | `100` | Clamped maximum suspicion score |
| `LIMIT_MIN_LIMIT_FLOOR` | `5` | Absolute minimum requests allowed in window |
| `WEIGHT_EMPTY_UA` | `50` | Score weight for missing User-Agent |
| `WEIGHT_BOT_UA` | `80` | Score weight for matches on common scrapers/crawlers |
| `WEIGHT_DATACENTER_AS` | `40` | Score weight for residential UAs routing from VPS nodes |
| `WEIGHT_TLS_MISMATCH` | `30` | Score weight for outdated/inconsistent TLS handshakes |

---

## 🧪 Testing & Validation

The codebase includes a comprehensive test suite utilizing **Vitest** for testing all pure routing, scoring, and rate-limiting logic:

*   **90/90 Unit Tests Passing**: Validates client-hint version gates (Chrome ≥90, legacy browsers), HTTP/1.x vs HTTP/2+ transport mismatches, and AS-org reputation scoring.
*   **100% Logic Coverage**: Coverage report covers all heuristics, limits, rate-limit sliding windows, and stats.

To execute tests locally:
```bash
npm run test
```

---

## 🚀 CI/CD Pipeline

A GitHub Actions pipeline (`.github/workflows/ci.yml`) executes automatically on every push or pull request to the `main` branch, ensuring code safety:
1.  **Security Scan**: Checks for dependency anomalies and lockfile validity.
2.  **Lint & Format Check**: Runs ESLint and Prettier formatting checks.
3.  **Unit Tests**: Runs the Vitest test suite.

---

## 🛠️ Deployment

Deploy to Cloudflare edge instantly:
```bash
npm install
wrangler deploy
```

---

## 📄 License

MIT
