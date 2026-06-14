// Sentinel — edge bot-firewall on Cloudflare Workers.
//
//   GET  /            live dashboard + attack console
//   GET  /api/stats   JSON snapshot powering the dashboard
//   ANY  /api/check   the protected endpoint — score, rate-limit, verdict
//
// Every request to /api/check is scored, run through an adaptive rate limiter,
// recorded, and answered with ALLOW / CHALLENGE / BLOCK / RATE_LIMITED. Scoring
// and the verdict are the main flow; stats recording, logging and the stats read
// are secondary and are isolated so they can never break a client request.

import { scoreRequest, verdictFor } from "./score.js";
import { renderDashboard } from "./dashboard.js";
import { loadConfig } from "./config.js";
import { logDecision, logError } from "./logger.js";

export { RateLimiter } from "./ratelimiter.js";
export { Stats } from "./stats.js";

// 429 is reserved strictly for rate limiting; CHALLENGE/BLOCK both deny.
const STATUS = { ALLOW: 200, CHALLENGE: 403, BLOCK: 403, RATE_LIMITED: 429 };

const MESSAGES = {
  ALLOW: "Request passed. This is what your origin would receive.",
  CHALLENGE: "Flagged as suspicious. In proxy mode this returns a challenge.",
  RATE_LIMITED: "Too many requests for this client's trust level.",
  BLOCK: "Blocked at the edge. Origin never saw this request.",
};

function coarsenIp(ip) {
  // Drop the last IPv4 octet / final IPv6 group so full client IPs are never stored or logged.
  return ip.replace(/\.\d+$|:[^:]+$/, ".x");
}

function emptySnapshot() {
  return JSON.stringify({
    totals: {
      total: 0,
      ALLOW: 0,
      CHALLENGE: 0,
      BLOCK: 0,
      RATE_LIMITED: 0,
      reasons: {},
      since: Date.now(),
    },
    topReasons: [],
    events: [],
  });
}

async function checkRateLimit(env, ip, coarseIp, score, rl) {
  // The rate limiter is on the main flow, but a Durable Object failure must not
  // deny a real user — degrade to "not limited" and report (with a coarsened IP).
  try {
    const id = env.RATE_LIMITER.idFromName(ip);
    const stub = env.RATE_LIMITER.get(id);
    const resp = await stub.fetch("https://do/check", {
      method: "POST",
      body: JSON.stringify({ score, ...rl }),
    });
    return await resp.json();
  } catch (err) {
    logError("rate_limiter_unavailable", err, { ip: coarseIp });
    return { limited: false, count: 0, limit: rl.baseLimit, retryAfter: 0, degraded: true };
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const cfg = loadConfig(env);
      const statsId = env.STATS.idFromName("global");
      const stats = env.STATS.get(statsId);

      if (url.pathname === "/" || url.pathname === "") {
        return new Response(renderDashboard(url.host), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/api/stats") {
        let payload = emptySnapshot();
        try {
          const snap = await stats.fetch("https://do/snapshot");
          payload = await snap.text();
        } catch (err) {
          logError("stats_read_error", err);
        }
        return new Response(payload, {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }

      // ---- protected pipeline (everything else, demo'd via /api/check) ----
      const { challengeAt, blockAt } = cfg.thresholds;
      const { score, reasons } = scoreRequest(request, cfg.score);
      const ip = request.headers.get("cf-connecting-ip") || "anon";
      const coarseIp = coarsenIp(ip);

      const { limited, count, limit, retryAfter } = await checkRateLimit(
        env,
        ip,
        coarseIp,
        score,
        cfg.rateLimit
      );

      const verdict = limited ? "RATE_LIMITED" : verdictFor(score, challengeAt, blockAt);

      const reasonList = reasons.map((r) => r.reason);
      if (limited) reasonList.unshift(`rate limit exceeded (${count}/${limit})`);

      const ua = (request.headers.get("user-agent") || "—").slice(0, cfg.stats.uaMaxLen);
      const country = (request.cf && request.cf.country) || "??";

      logDecision({
        verdict,
        score,
        path: url.pathname,
        method: request.method,
        ip: coarseIp,
        country,
        ua,
        rateLimit: { limited, count, limit },
        reasons: reasonList,
      });

      // Record asynchronously and in isolation — never add latency to, or break,
      // the verdict that goes back to the client.
      ctx.waitUntil(
        stats
          .fetch("https://do/record", {
            method: "POST",
            body: JSON.stringify({
              t: Date.now(),
              verdict,
              score,
              ip: coarseIp,
              ua,
              country,
              reasons: reasonList,
            }),
          })
          .catch((err) => logError("stats_record_dispatch_error", err))
      );

      const body = {
        sentinel: "v0.1",
        verdict,
        score,
        threshold: { challengeAt, blockAt },
        reasons,
        rateLimit: { count, limit, windowMs: cfg.rateLimit.windowMs, limited },
        message: MESSAGES[verdict],
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
    } catch (err) {
      // Last-resort boundary: an unexpected failure on the main path must return
      // a controlled response, not an unhandled exception.
      logError("worker_unhandled_error", err);
      return new Response(
        JSON.stringify({ sentinel: "v0.1", verdict: "ERROR", message: "Internal error." }),
        {
          status: 500,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }
      );
    }
  },
};
