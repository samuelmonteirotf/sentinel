import { describe, it, expect } from "vitest";
import { scoreRequest, verdictFor } from "../src/score.js";
import { makeReq, cleanBrowser } from "./helpers.js";

const reasonText = (result) => result.reasons.map((r) => r.reason);

describe("scoreRequest — User-Agent", () => {
  it("scores a clean, complete browser request as 0", () => {
    const { score, reasons } = scoreRequest(cleanBrowser());
    expect(score).toBe(0);
    expect(reasons).toEqual([]);
  });

  it("flags a missing User-Agent", () => {
    const { score, reasons } = scoreRequest(makeReq({ headers: {} }));
    expect(score).toBe(50);
    expect(reasonText({ reasons })).toContain("no User-Agent");
  });

  it.each([
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Go-http-client/2.0",
    "scrapy/2.11",
    "sqlmap/1.8",
    "nuclei/3.1",
    "axios/1.6.0",
    "okhttp/4.12.0",
    "Java/17.0.1",
    "masscan/1.3",
  ])("flags known automation/scanner UA: %s", (ua) => {
    const { score, reasons } = scoreRequest(makeReq({ headers: { "user-agent": ua } }));
    expect(score).toBe(65);
    expect(reasonText({ reasons })[0]).toMatch(/automation\/library\/scanner/);
  });

  it("does not penalise a non-browser, non-bot custom client UA", () => {
    const { score } = scoreRequest(makeReq({ headers: { "user-agent": "MyService/1.0" } }));
    expect(score).toBe(0);
  });

  it("tolerates a request with no cf metadata object", () => {
    const { score } = scoreRequest({ headers: new Headers({ "user-agent": "curl/8.0" }) });
    expect(score).toBe(65);
  });
});

describe("scoreRequest — browser header shape", () => {
  it("penalises a browser UA missing Accept", () => {
    const req = cleanBrowser();
    req.headers.delete("accept");
    const { score, reasons } = scoreRequest(req);
    expect(score).toBe(20);
    expect(reasonText({ reasons })).toContain("browser UA but no Accept header");
  });

  it("penalises a browser UA missing Accept-Language", () => {
    const req = cleanBrowser();
    req.headers.delete("accept-language");
    expect(scoreRequest(req).score).toBe(12);
  });

  it("penalises a browser UA missing Accept-Encoding", () => {
    const req = cleanBrowser();
    req.headers.delete("accept-encoding");
    expect(scoreRequest(req).score).toBe(10);
  });

  it("penalises Chrome >= 90 with no Sec-CH-UA (spoofed UA)", () => {
    const req = cleanBrowser();
    req.headers.delete("sec-ch-ua");
    const { score, reasons } = scoreRequest(req);
    expect(score).toBe(22);
    expect(reasonText({ reasons }).join()).toMatch(/Sec-CH-UA/);
  });

  it("penalises Chrome >= 90 with no Sec-Fetch metadata", () => {
    const req = cleanBrowser();
    req.headers.delete("sec-fetch-site");
    expect(scoreRequest(req).score).toBe(18);
  });

  it("accumulates all three missing header signals additively", () => {
    const req = cleanBrowser();
    req.headers.delete("accept");
    req.headers.delete("accept-language");
    req.headers.delete("accept-encoding");
    const { score, reasons } = scoreRequest(req);
    expect(score).toBe(42); // 20 + 12 + 10
    expect(reasons).toHaveLength(3);
  });

  it("does not demand Client Hints from a non-Chrome browser (Firefox)", () => {
    const req = cleanBrowser({
      headers: {
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
      },
    });
    req.headers.delete("sec-ch-ua");
    req.headers.delete("sec-fetch-site");
    expect(scoreRequest(req).score).toBe(0);
  });

  it("does NOT expect Client Hints from Chrome < 90", () => {
    const req = cleanBrowser({
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/85.0.4183.121 Safari/537.36",
      },
    });
    req.headers.delete("sec-ch-ua");
    req.headers.delete("sec-fetch-site");
    expect(scoreRequest(req).score).toBe(0);
  });
});

describe("scoreRequest — transport fingerprint", () => {
  it.each(["HTTP/1.0", "HTTP/1.1"])("flags a modern browser UA over %s", (proto) => {
    const req = cleanBrowser({ cf: { httpProtocol: proto } });
    const { score, reasons } = scoreRequest(req);
    expect(score).toBe(15);
    expect(reasonText({ reasons }).join()).toMatch(/expected h2\/h3/);
  });

  it("does not flag a browser over HTTP/2", () => {
    expect(scoreRequest(cleanBrowser({ cf: { httpProtocol: "HTTP/2" } })).score).toBe(0);
  });

  it.each(["TLSv1", "TLSv1.1"])("flags obsolete TLS %s", (tls) => {
    const req = cleanBrowser({ cf: { tlsVersion: tls } });
    const { score, reasons } = scoreRequest(req);
    expect(score).toBe(20);
    expect(reasonText({ reasons }).join()).toMatch(/obsolete TLS/);
  });

  it.each(["TLSv1.2", "TLSv1.3"])("does not flag modern TLS %s", (tls) => {
    expect(scoreRequest(cleanBrowser({ cf: { tlsVersion: tls } })).score).toBe(0);
  });
});

describe("scoreRequest — network reputation (AS-org)", () => {
  it.each([
    "Amazon AWS",
    "OVH SAS",
    "Hetzner Online GmbH",
    "DigitalOcean LLC",
    "Google Cloud",
  ])("flags a browser from datacenter org %s with the higher weight", (org) => {
    const req = cleanBrowser({ cf: { asOrganization: org } });
    const { score, reasons } = scoreRequest(req);
    expect(score).toBe(28);
    expect(reasonText({ reasons }).join()).toMatch(/datacenter network/);
  });

  it("flags a non-browser client from a datacenter org with the lower weight", () => {
    const req = makeReq({
      headers: { "user-agent": "MyService/1.0" },
      cf: { asOrganization: "OVH SAS" },
    });
    expect(scoreRequest(req).score).toBe(14);
  });

  it("does not flag a residential/ISP AS-org", () => {
    expect(scoreRequest(cleanBrowser({ cf: { asOrganization: "Comcast Cable" } })).score).toBe(
      0
    );
  });
});

describe("scoreRequest — Cloudflare threat score", () => {
  it("ignores threat scores below the minimum", () => {
    expect(scoreRequest(cleanBrowser({ cf: { threatScore: 9 } })).score).toBe(0);
  });

  it("adds the threat score once at/above the minimum", () => {
    expect(scoreRequest(cleanBrowser({ cf: { threatScore: 10 } })).score).toBe(10);
  });

  it("adds a value between the minimum and the cap verbatim", () => {
    expect(scoreRequest(cleanBrowser({ cf: { threatScore: 15 } })).score).toBe(15);
  });

  it("adds exactly threatMax at the cap boundary", () => {
    expect(scoreRequest(cleanBrowser({ cf: { threatScore: 25 } })).score).toBe(25);
  });

  it("caps the threat contribution at threatMax", () => {
    expect(scoreRequest(cleanBrowser({ cf: { threatScore: 100 } })).score).toBe(25);
  });
});

describe("scoreRequest — clamping & shape", () => {
  it("clamps a heavily-flagged request to 100", () => {
    const req = makeReq({
      headers: {},
      cf: { asOrganization: "AWS", tlsVersion: "TLSv1", threatScore: 100 },
    });
    // 50 (no UA) + 14 (datacenter) + 20 (TLS) + 25 (threat) = 109 -> clamped
    expect(scoreRequest(req).score).toBe(100);
  });

  it("never returns a negative score", () => {
    expect(scoreRequest(cleanBrowser()).score).toBeGreaterThanOrEqual(0);
  });

  it("returns reasons as { points, reason } objects", () => {
    const { reasons } = scoreRequest(makeReq({ headers: {} }));
    expect(reasons[0]).toEqual({ points: 50, reason: "no User-Agent" });
  });
});

describe("scoreRequest — config overrides", () => {
  it("uses caller-supplied weights over the defaults", () => {
    const { score } = scoreRequest(makeReq({ headers: {} }), { noUa: 7 });
    expect(score).toBe(7);
  });

  it("applies a custom botUa weight to a matching UA", () => {
    const req = makeReq({ headers: { "user-agent": "curl/8.0" } });
    expect(scoreRequest(req, { botUa: 99 }).score).toBe(99);
  });

  it("leaves unspecified weights at their defaults", () => {
    // Override botUa only; a no-UA request still uses the default noUa (50).
    const { score } = scoreRequest(makeReq({ headers: {} }), { botUa: 99 });
    expect(score).toBe(50);
  });
});

describe("verdictFor", () => {
  it.each([
    [0, "ALLOW"],
    [29, "ALLOW"],
    [30, "CHALLENGE"],
    [59, "CHALLENGE"],
    [60, "BLOCK"],
    [100, "BLOCK"],
  ])("score %i -> %s", (score, expected) => {
    expect(verdictFor(score, 30, 60)).toBe(expected);
  });

  it("respects custom thresholds", () => {
    expect(verdictFor(40, 50, 80)).toBe("ALLOW");
    expect(verdictFor(50, 50, 80)).toBe("CHALLENGE");
    expect(verdictFor(80, 50, 80)).toBe("BLOCK");
  });
});
