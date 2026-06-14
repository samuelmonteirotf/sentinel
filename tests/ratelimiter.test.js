import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimiter } from "../src/ratelimiter.js";
import { makeState, doRequest } from "./helpers.js";

async function check(rl, body) {
  const resp = await rl.fetch(doRequest("https://do/check", body));
  return resp.json();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RateLimiter — sliding window", () => {
  it("allows requests under the limit and increments the count", async () => {
    const rl = new RateLimiter(makeState());
    const r1 = await check(rl, { score: 0, windowMs: 10000, baseLimit: 5 });
    expect(r1).toMatchObject({ limited: false, count: 1, limit: 5 });
    const r2 = await check(rl, { score: 0, windowMs: 10000, baseLimit: 5 });
    expect(r2).toMatchObject({ limited: false, count: 2, limit: 5 });
  });

  it("limits once the window is full and stops incrementing", async () => {
    const rl = new RateLimiter(makeState());
    const body = { score: 0, windowMs: 10000, baseLimit: 3 };
    await check(rl, body); // 1
    await check(rl, body); // 2
    const third = await check(rl, body); // 3 -> at budget
    expect(third).toMatchObject({ limited: false, count: 3 });
    const fourth = await check(rl, body);
    expect(fourth).toMatchObject({ limited: true, count: 3, limit: 3 });
    expect(fourth.retryAfter).toBeGreaterThan(0);
    // A second over-budget call must not push more hits.
    const fifth = await check(rl, body);
    expect(fifth).toMatchObject({ limited: true, count: 3 });
  });

  it("drops hits older than the window", async () => {
    const now = 1_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);
    const rl = new RateLimiter(makeState());
    const body = { score: 0, windowMs: 10000, baseLimit: 2, minLimit: 1 };
    await check(rl, body);
    await check(rl, body);
    expect((await check(rl, body)).limited).toBe(true);

    // Advance past the window — the old hits expire and budget resets.
    nowSpy.mockReturnValue(now + 20000);
    const after = await check(rl, body);
    expect(after).toMatchObject({ limited: false, count: 1 });
  });

  it("computes retryAfter from the oldest hit in the window", async () => {
    const now = 5_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const rl = new RateLimiter(makeState());
    const body = { score: 0, windowMs: 10000, baseLimit: 1, minLimit: 1 };
    await check(rl, body);
    const limited = await check(rl, body);
    expect(limited.limited).toBe(true);
    expect(limited.retryAfter).toBe(10); // ceil(10000 / 1000)
  });
});

describe("RateLimiter — adaptive budget", () => {
  it("shrinks the limit as the suspicion score rises", async () => {
    const rl = new RateLimiter(makeState());
    // score 50, scale 100 -> factor 0.5 -> floor(20 * 0.5) = 10
    const r = await check(rl, { score: 50, baseLimit: 20, windowMs: 10000 });
    expect(r.limit).toBe(10);
  });

  it("caps the reduction at maxSuspicion", async () => {
    const rl = new RateLimiter(makeState());
    // score 100 -> min(0.85, 1.0) = 0.85 -> factor 0.15 -> floor(100 * 0.15) = 15
    const r = await check(rl, {
      score: 100,
      baseLimit: 100,
      windowMs: 10000,
      maxSuspicion: 0.85,
      scoreScale: 100,
    });
    expect(r.limit).toBe(15);
  });

  it("never drops below minLimit", async () => {
    const rl = new RateLimiter(makeState());
    // floor(10 * 0.15) = 1, but minLimit floors it at 3
    const r = await check(rl, { score: 100, baseLimit: 10, minLimit: 3, windowMs: 10000 });
    expect(r.limit).toBe(3);
  });

  it("honours custom minLimit", async () => {
    const rl = new RateLimiter(makeState());
    const r = await check(rl, { score: 100, baseLimit: 10, minLimit: 5, windowMs: 10000 });
    expect(r.limit).toBe(5);
  });

  it("treats a negative score as zero suspicion (full budget)", async () => {
    const rl = new RateLimiter(makeState());
    const r = await check(rl, { score: -50, baseLimit: 20, windowMs: 10000 });
    expect(r.limit).toBe(20);
  });

  it("falls back to the default scale when scoreScale is non-positive", async () => {
    const rl = new RateLimiter(makeState());
    // scoreScale 0 would divide to Infinity — guard falls back to the default 100,
    // so score 50 -> factor 0.5 -> floor(20 * 0.5) = 10.
    const r = await check(rl, { score: 50, baseLimit: 20, scoreScale: 0, windowMs: 10000 });
    expect(r.limit).toBe(10);
  });
});

describe("RateLimiter — defaults & robustness", () => {
  it("falls back to defaults when the body omits fields", async () => {
    const rl = new RateLimiter(makeState());
    const r = await check(rl, {});
    expect(r.limit).toBe(20); // default baseLimit, score defaults to 0
    expect(r.limited).toBe(false);
  });

  it("tolerates an unparseable body", async () => {
    const rl = new RateLimiter(makeState());
    const resp = await rl.fetch({
      json: async () => {
        throw new Error("bad json");
      },
    });
    const r = await resp.json();
    expect(r.limited).toBe(false);
    expect(r.limit).toBe(20);
  });

  it("fails open if storage throws", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const state = makeState();
    state.storage.get = async () => {
      throw new Error("storage down");
    };
    const rl = new RateLimiter(state);
    const r = await check(rl, { score: 0, baseLimit: 7, windowMs: 10000 });
    expect(r).toMatchObject({ limited: false, degraded: true, limit: 7 });
  });
});
