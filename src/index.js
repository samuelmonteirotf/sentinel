// Sentinel — edge bot-firewall on Cloudflare Workers.
//
//   GET  /            live dashboard + attack console
//   GET  /api/stats   JSON snapshot powering the dashboard
//   ANY  /api/check   the protected endpoint — score, rate-limit, verdict
//
// Every request to /api/check is scored, run through an adaptive rate
// limiter, recorded, and answered with ALLOW / CHALLENGE / BLOCK.

import { scoreRequest, verdictFor } from "./score.js";
import { renderDashboard } from "./dashboard.js";

export { RateLimiter } from "./ratelimiter.js";
export { Stats } from "./stats.js";

// 429 is reserved strictly for rate limiting; CHALLENGE/BLOCK both deny.
const STATUS = { ALLOW: 200, CHALLENGE: 403, BLOCK: 403, RATE_LIMITED: 429 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const statsId = env.STATS.idFromName("global");
    const stats = env.STATS.get(statsId);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(renderDashboard(url.host), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/stats") {
      const snap = await stats.fetch("https://do/snapshot");
      return new Response(await snap.text(), {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }

    // ---- protected pipeline (everything else, demo'd via /api/check) ----
    const challengeAt = parseInt(env.SCORE_CHALLENGE || "30", 10);
    const blockAt = parseInt(env.SCORE_BLOCK || "60", 10);
    const windowMs = parseInt(env.RL_WINDOW_MS || "10000", 10);
    const baseLimit = parseInt(env.RL_BASE_LIMIT || "20", 10);

    const { score, reasons } = scoreRequest(request);
    const ip = request.headers.get("cf-connecting-ip") || "anon";

    // Adaptive rate limit, isolated per client IP.
    const rlId = env.RATE_LIMITER.idFromName(ip);
    const rl = env.RATE_LIMITER.get(rlId);
    const rlResp = await rl.fetch("https://do/check", {
      method: "POST",
      body: JSON.stringify({ score, windowMs, baseLimit }),
    });
    const { limited, count, limit, retryAfter } = await rlResp.json();

    let verdict = limited ? "RATE_LIMITED" : verdictFor(score, challengeAt, blockAt);

    const reasonList = reasons.map((r) => r.reason);
    if (limited) reasonList.unshift(`rate limit exceeded (${count}/${limit})`);

    // Record asynchronously — never add latency to the verdict.
    ctx.waitUntil(
      stats.fetch("https://do/record", {
        method: "POST",
        body: JSON.stringify({
          t: Date.now(),
          verdict,
          score,
          ip: ip.replace(/\.\d+$|:[^:]+$/, ".x"), // coarsen — don't store full IPs
          ua: (request.headers.get("user-agent") || "—").slice(0, 80),
          country: (request.cf && request.cf.country) || "??",
          reasons: reasonList,
        }),
      })
    );

    const body = {
      sentinel: "v0.1",
      verdict,
      score,
      threshold: { challengeAt, blockAt },
      reasons: reasons,
      rateLimit: { count, limit, windowMs, limited },
      message:
        verdict === "ALLOW"
          ? "Request passed. This is what your origin would receive."
          : verdict === "CHALLENGE"
          ? "Flagged as suspicious. In proxy mode this returns a challenge."
          : verdict === "RATE_LIMITED"
          ? "Too many requests for this client's trust level."
          : "Blocked at the edge. Origin never saw this request.",
    };

    const headers = {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-sentinel-verdict": verdict,
      "x-sentinel-score": String(score),
    };
    if (verdict === "RATE_LIMITED") headers["retry-after"] = String(retryAfter);

    return new Response(JSON.stringify(body, null, 2), {
      status: STATUS[verdict],
      headers,
    });
  },
};
