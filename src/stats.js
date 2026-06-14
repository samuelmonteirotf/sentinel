// Single global Durable Object that aggregates what Sentinel has seen.
//
// This powers the live dashboard and the honest numbers for the portfolio:
// counters only ever reflect real traffic that actually hit the demo. Recording
// is fire-and-forget from the main worker, so failures here are contained and
// never surface to the client.

import { loadConfig } from "./config.js";
import { logError } from "./logger.js";

const VERDICTS = new Set(["ALLOW", "CHALLENGE", "BLOCK", "RATE_LIMITED"]);

function emptyTotals() {
  return {
    total: 0,
    ALLOW: 0,
    CHALLENGE: 0,
    BLOCK: 0,
    RATE_LIMITED: 0,
    reasons: {},
    since: Date.now(),
  };
}

export class Stats {
  constructor(state, env) {
    this.state = state;
    const cfg = loadConfig(env).stats;
    this.maxEvents = cfg.maxEvents;
    this.maxReasons = cfg.maxReasons;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/record" && request.method === "POST") {
      try {
        const ev = await request.json();
        const totals = (await this.state.storage.get("totals")) || emptyTotals();

        totals.total++;
        // Only known verdicts get a counter — never let an unexpected value
        // create arbitrary keys on the totals object.
        if (VERDICTS.has(ev.verdict)) {
          totals[ev.verdict] = (totals[ev.verdict] || 0) + 1;
        }
        for (const r of ev.reasons || []) {
          totals.reasons[r] = (totals.reasons[r] || 0) + 1;
        }

        let events = (await this.state.storage.get("events")) || [];
        events.unshift({
          t: ev.t,
          verdict: ev.verdict,
          score: ev.score,
          ip: ev.ip,
          ua: ev.ua,
          country: ev.country,
          top: (ev.reasons || [])[0] || "—",
        });
        events = events.slice(0, this.maxEvents);

        await this.state.storage.put({ totals, events });
        return new Response("ok");
      } catch (err) {
        logError("stats_record_error", err);
        return new Response("error", { status: 500 });
      }
    }

    // GET /snapshot -> everything the dashboard needs.
    try {
      const totals = (await this.state.storage.get("totals")) || emptyTotals();
      const events = (await this.state.storage.get("events")) || [];

      const topReasons = Object.entries(totals.reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.maxReasons)
        .map(([reason, n]) => ({ reason, n }));

      return Response.json({ totals, topReasons, events });
    } catch (err) {
      logError("stats_snapshot_error", err);
      return Response.json({ totals: emptyTotals(), topReasons: [], events: [] });
    }
  }
}
