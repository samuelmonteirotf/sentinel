// Per-client adaptive sliding-window rate limiter.
//
// One Durable Object instance per client key (IP). It keeps the timestamps of
// recent requests and decides whether the *next* one is over budget.
//
// "Adaptive" = the budget shrinks as the caller's suspicion score rises. A
// clean browser gets the full window; a high-scoring client gets a fraction of
// it. Abuse gets expensive without punishing real users. All tunables arrive in
// the request body (sourced from config.js) with safe defaults.

import { logError } from "./logger.js";

const DEFAULTS = {
  windowMs: 10000,
  baseLimit: 20,
  maxSuspicion: 0.85,
  minLimit: 3,
  scoreScale: 100,
};

export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const body = await request.json().catch(() => ({}));
    const score = Number.isFinite(body.score) ? body.score : 0;
    const windowMs = Number.isFinite(body.windowMs) ? body.windowMs : DEFAULTS.windowMs;
    const baseLimit = Number.isFinite(body.baseLimit) ? body.baseLimit : DEFAULTS.baseLimit;
    const maxSuspicion = Number.isFinite(body.maxSuspicion)
      ? body.maxSuspicion
      : DEFAULTS.maxSuspicion;
    const minLimit = Number.isFinite(body.minLimit) ? body.minLimit : DEFAULTS.minLimit;
    const scoreScale =
      Number.isFinite(body.scoreScale) && body.scoreScale > 0
        ? body.scoreScale
        : DEFAULTS.scoreScale;

    // Effective budget: full for clean traffic, down to (1 - maxSuspicion) of it
    // for the highest scores.
    const factor = 1 - Math.min(maxSuspicion, Math.max(0, score) / scoreScale);
    const limit = Math.max(minLimit, Math.floor(baseLimit * factor));

    try {
      const now = Date.now();
      const cutoff = now - windowMs;

      let hits = (await this.state.storage.get("hits")) || [];
      hits = hits.filter((t) => t > cutoff);

      const count = hits.length;
      const limited = count >= limit;

      if (!limited) {
        hits.push(now);
        await this.state.storage.put("hits", hits);
      }

      const retryAfter = limited
        ? Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000))
        : 0;

      return Response.json({
        limited,
        count: count + (limited ? 0 : 1),
        limit,
        retryAfter,
      });
    } catch (err) {
      // Storage failure must not deny a real user — fail open and report.
      logError("rate_limiter_storage_error", err);
      return Response.json({ limited: false, count: 0, limit, retryAfter: 0, degraded: true });
    }
  }
}
