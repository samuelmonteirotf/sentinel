// Central configuration. Every tunable threshold, weight and limit lives here
// with a safe default and an environment-variable override, so behaviour can be
// retuned through Wrangler vars without shipping code. See wrangler.toml.

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function float(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function build(env) {
  const e = env || {};
  return {
    thresholds: {
      challengeAt: int(e.SCORE_CHALLENGE, 30),
      blockAt: int(e.SCORE_BLOCK, 60),
    },
    score: {
      noUa: int(e.SCORE_NO_UA, 50),
      botUa: int(e.SCORE_BOT_UA, 65),
      noAccept: int(e.SCORE_NO_ACCEPT, 20),
      noAcceptLanguage: int(e.SCORE_NO_ACCEPT_LANGUAGE, 12),
      noAcceptEncoding: int(e.SCORE_NO_ACCEPT_ENCODING, 10),
      noSecChUa: int(e.SCORE_NO_SEC_CH_UA, 22),
      noSecFetch: int(e.SCORE_NO_SEC_FETCH, 18),
      http1Browser: int(e.SCORE_HTTP1_BROWSER, 15),
      obsoleteTls: int(e.SCORE_OBSOLETE_TLS, 20),
      datacenterBrowser: int(e.SCORE_DATACENTER_BROWSER, 28),
      datacenter: int(e.SCORE_DATACENTER, 14),
      threatMax: int(e.SCORE_THREAT_MAX, 25),
      chromeClientHintsMinVersion: int(e.SCORE_CHROME_CH_MIN_VERSION, 90),
      threatMinScore: int(e.SCORE_THREAT_MIN, 10),
    },
    rateLimit: {
      windowMs: int(e.RL_WINDOW_MS, 10000),
      baseLimit: int(e.RL_BASE_LIMIT, 20),
      maxSuspicion: float(e.RL_MAX_SUSPICION, 0.85),
      minLimit: int(e.RL_MIN_LIMIT, 3),
      scoreScale: int(e.RL_SCORE_SCALE, 100),
    },
    stats: {
      maxEvents: int(e.STATS_MAX_EVENTS, 40),
      maxReasons: int(e.STATS_MAX_REASONS, 6),
      uaMaxLen: int(e.STATS_UA_MAX_LEN, 80),
    },
  };
}

const cache = new WeakMap();

export function loadConfig(env) {
  if (!env || typeof env !== "object") return build(env);
  let cfg = cache.get(env);
  if (!cfg) {
    cfg = build(env);
    cache.set(env, cfg);
  }
  return cfg;
}
