import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("returns documented defaults for an empty env", () => {
    const c = loadConfig({});
    expect(c.thresholds).toEqual({ challengeAt: 30, blockAt: 60 });
    expect(c.score.noUa).toBe(50);
    expect(c.score.botUa).toBe(65);
    expect(c.score.chromeClientHintsMinVersion).toBe(90);
    expect(c.score.threatMinScore).toBe(10);
    expect(c.rateLimit).toEqual({
      windowMs: 10000,
      baseLimit: 20,
      maxSuspicion: 0.85,
      minLimit: 3,
      scoreScale: 100,
    });
    expect(c.stats).toEqual({ maxEvents: 40, maxReasons: 6, uaMaxLen: 80 });
  });

  it("parses integer overrides from env", () => {
    const c = loadConfig({ SCORE_CHALLENGE: "40", RL_BASE_LIMIT: "100" });
    expect(c.thresholds.challengeAt).toBe(40);
    expect(c.rateLimit.baseLimit).toBe(100);
  });

  it("parses float overrides from env", () => {
    expect(loadConfig({ RL_MAX_SUSPICION: "0.5" }).rateLimit.maxSuspicion).toBe(0.5);
  });

  it("falls back to defaults for non-numeric env values", () => {
    const c = loadConfig({ SCORE_CHALLENGE: "abc", RL_MAX_SUSPICION: "xyz" });
    expect(c.thresholds.challengeAt).toBe(30);
    expect(c.rateLimit.maxSuspicion).toBe(0.85);
  });

  it("memoizes per env object", () => {
    const env = { SCORE_BLOCK: "70" };
    expect(loadConfig(env)).toBe(loadConfig(env));
  });

  it("produces independent config for different env objects", () => {
    expect(loadConfig({ SCORE_BLOCK: "70" })).not.toBe(loadConfig({ SCORE_BLOCK: "80" }));
    expect(loadConfig({ SCORE_BLOCK: "80" }).thresholds.blockAt).toBe(80);
  });
});
