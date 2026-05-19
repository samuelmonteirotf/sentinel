// Single global Durable Object that aggregates what Sentinel has seen.
//
// This is what powers the live dashboard and — more importantly — the
// HONEST numbers for the portfolio. No invented "99.998%": these counters
// only ever reflect real traffic that actually hit the demo.

const MAX_EVENTS = 40;

export class Stats {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/record" && request.method === "POST") {
      const ev = await request.json();
      const totals =
        (await this.state.storage.get("totals")) || {
          total: 0,
          ALLOW: 0,
          CHALLENGE: 0,
          BLOCK: 0,
          RATE_LIMITED: 0,
          reasons: {},
          since: Date.now(),
        };

      totals.total++;
      totals[ev.verdict] = (totals[ev.verdict] || 0) + 1;
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
      events = events.slice(0, MAX_EVENTS);

      await this.state.storage.put({ totals, events });
      return new Response("ok");
    }

    // GET /snapshot -> everything the dashboard needs.
    const totals =
      (await this.state.storage.get("totals")) || {
        total: 0,
        ALLOW: 0,
        CHALLENGE: 0,
        BLOCK: 0,
        RATE_LIMITED: 0,
        reasons: {},
        since: Date.now(),
      };
    const events = (await this.state.storage.get("events")) || [];

    const topReasons = Object.entries(totals.reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason, n]) => ({ reason, n }));

    return Response.json({ totals, topReasons, events });
  }
}
