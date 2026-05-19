// Per-client adaptive sliding-window rate limiter.
//
// One Durable Object instance per client key (IP). It keeps the timestamps
// of recent requests and decides whether the *next* one is over budget.
//
// "Adaptive" = the budget shrinks as the caller's suspicion score rises.
// A clean browser gets the full window; a client scoring 60+ gets a
// fraction of it. Abuse gets expensive without punishing real users.

export class RateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { score = 0, windowMs = 10000, baseLimit = 20 } =
      await request.json();

    const now = Date.now();
    const cutoff = now - windowMs;

    let hits = (await this.state.storage.get("hits")) || [];
    hits = hits.filter((t) => t > cutoff);

    // Effective budget: full for clean traffic, down to ~15% for score 100.
    const factor = 1 - Math.min(0.85, score / 100);
    const limit = Math.max(3, Math.floor(baseLimit * factor));

    const count = hits.length;
    const limited = count >= limit;

    if (!limited) {
      hits.push(now);
      await this.state.storage.put("hits", hits);
    }

    const retryAfter = limited
      ? Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000))
      : 0;

    return Response.json({ limited, count: count + (limited ? 0 : 1), limit, retryAfter });
  }
}
