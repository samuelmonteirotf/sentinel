// Sentinel scoring engine.
//
// Pure function: takes a Request, returns { score, reasons[] }.
// Score is 0-100. Higher = more likely automated / hostile.
//
// Deliberately does NOT use Cloudflare's paid Bot Management signals
// (request.cf.botManagement.*). Everything here is derived from signals
// available on the Workers Free plan: headers, TLS/HTTP metadata, and
// the network the request came from. The heuristics ARE the product.

const BOT_UA = /(bot|crawl|spider|slurp|curl|wget|python-requests|httpx|aiohttp|axios|node-fetch|got\b|go-http-client|java\/|okhttp|scrapy|libwww|mechanize|headlesschrome|phantomjs|puppeteer|playwright|selenium|masscan|zgrab|nuclei|nikto|sqlmap)/i;

const LOOKS_BROWSER = /mozilla\/5\.0/i;
const CHROME_VER = /chrome\/(\d+)/i;

// AS organisations that are hosting/cloud — legit users rarely browse from these.
const DATACENTER_ORG =
  /(amazon|aws|google|gcp|microsoft|azure|ovh|hetzner|digitalocean|linode|akamai|vultr|scaleway|contabo|oracle|alibaba|tencent|leaseweb|choopa|m247|cogent|datacamp|hostwinds| colocation|servers?\.com|cloud)/i;

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreRequest(request) {
  const h = request.headers;
  const cf = request.cf || {};
  const ua = (h.get("user-agent") || "").trim();
  const reasons = [];
  let score = 0;

  const add = (points, reason) => {
    score += points;
    reasons.push({ points, reason });
  };

  // --- User-Agent ---------------------------------------------------------
  if (!ua) {
    add(50, "no User-Agent");
  } else if (BOT_UA.test(ua)) {
    // An unconcealed automation/scanner UA is unambiguous — block outright.
    add(65, "User-Agent matches a known automation/library/scanner");
  }

  const claimsBrowser = LOOKS_BROWSER.test(ua);

  // --- Header shape: real browsers send a predictable header set ----------
  if (claimsBrowser) {
    if (!h.get("accept")) add(20, "browser UA but no Accept header");
    if (!h.get("accept-language")) add(12, "browser UA but no Accept-Language");
    if (!h.get("accept-encoding")) add(10, "browser UA but no Accept-Encoding");

    // Chromium >= 90 always emits Client Hints + Sec-Fetch metadata.
    const m = ua.match(CHROME_VER);
    const chromeMajor = m ? parseInt(m[1], 10) : 0;
    if (chromeMajor >= 90) {
      if (!h.get("sec-ch-ua"))
        add(22, `UA claims Chrome ${chromeMajor} but no Sec-CH-UA (spoofed UA)`);
      if (!h.get("sec-fetch-site"))
        add(18, "modern Chrome UA but no Sec-Fetch-* metadata");
    }
  }

  // --- Transport fingerprint ---------------------------------------------
  // Modern browsers negotiate h2/h3 through Cloudflare. HTTP/1.x + a modern
  // browser UA is a strong tell that the UA is forged by a CLI client.
  const proto = cf.httpProtocol || "";
  if (claimsBrowser && (proto === "HTTP/1.0" || proto === "HTTP/1.1")) {
    add(15, `modern browser UA over ${proto} (expected h2/h3)`);
  }

  const tls = cf.tlsVersion || "";
  if (tls === "TLSv1" || tls === "TLSv1.1") {
    add(20, `obsolete TLS (${tls})`);
  }

  // --- Network reputation -------------------------------------------------
  const org = cf.asOrganization || "";
  if (org && DATACENTER_ORG.test(org)) {
    // Datacenter traffic isn't automatically malicious, but a "browser"
    // coming from AWS/OVH/Hetzner almost always is automation.
    add(claimsBrowser ? 28 : 14, `request from datacenter network (${org})`);
  }

  // Threat score Cloudflare exposes for free on every request.
  const threat = typeof cf.threatScore === "number" ? cf.threatScore : 0;
  if (threat >= 10) add(Math.min(25, threat), `Cloudflare threat score ${threat}`);

  return { score: clamp(score), reasons };
}

export function verdictFor(score, challengeAt, blockAt) {
  if (score >= blockAt) return "BLOCK";
  if (score >= challengeAt) return "CHALLENGE";
  return "ALLOW";
}
