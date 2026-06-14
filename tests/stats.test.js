import { describe, it, expect, vi, afterEach } from "vitest";
import { Stats } from "../src/stats.js";
import { makeState, doRequest } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const event = (over = {}) => ({
  t: 1700000000000,
  verdict: "BLOCK",
  score: 80,
  ip: "1.2.3.x",
  ua: "curl/8",
  country: "US",
  reasons: ["no User-Agent"],
  ...over,
});

async function record(stats, ev) {
  return stats.fetch(doRequest("https://do/record", ev));
}

async function snapshot(stats) {
  const resp = await stats.fetch(doRequest("https://do/snapshot", null, "GET"));
  return resp.json();
}

describe("Stats — recording & snapshot", () => {
  it("aggregates totals and verdict counts", async () => {
    const stats = new Stats(makeState(), {});
    await record(stats, event({ verdict: "ALLOW" }));
    await record(stats, event({ verdict: "BLOCK" }));
    const snap = await snapshot(stats);
    expect(snap.totals.total).toBe(2);
    expect(snap.totals.ALLOW).toBe(1);
    expect(snap.totals.BLOCK).toBe(1);
  });

  it("keeps the newest events first", async () => {
    const stats = new Stats(makeState(), {});
    await record(stats, event({ score: 1 }));
    await record(stats, event({ score: 2 }));
    const snap = await snapshot(stats);
    expect(snap.events[0].score).toBe(2);
    expect(snap.events[1].score).toBe(1);
  });

  it("caps the event ring buffer at STATS_MAX_EVENTS", async () => {
    const stats = new Stats(makeState(), { STATS_MAX_EVENTS: "3" });
    for (let i = 0; i < 6; i++) await record(stats, event({ score: i }));
    const snap = await snapshot(stats);
    expect(snap.events).toHaveLength(3);
    expect(snap.events[0].score).toBe(5);
  });

  it("defaults to 40 events when env is missing", async () => {
    const stats = new Stats(makeState(), undefined);
    expect(stats.maxEvents).toBe(40);
  });

  it("ranks the top reasons by frequency", async () => {
    const stats = new Stats(makeState(), {});
    await record(stats, event({ reasons: ["a", "b"] }));
    await record(stats, event({ reasons: ["a"] }));
    const snap = await snapshot(stats);
    expect(snap.topReasons[0]).toEqual({ reason: "a", n: 2 });
  });

  it("caps the number of top reasons at STATS_MAX_REASONS", async () => {
    const stats = new Stats(makeState(), { STATS_MAX_REASONS: "2" });
    await record(stats, event({ reasons: ["a", "b", "c", "d"] }));
    const snap = await snapshot(stats);
    expect(snap.topReasons).toHaveLength(2);
  });

  it("uses '—' as the top signal when reasons are empty", async () => {
    const stats = new Stats(makeState(), {});
    await record(stats, event({ reasons: [] }));
    const snap = await snapshot(stats);
    expect(snap.events[0].top).toBe("—");
  });

  it("does not create counters for unknown verdicts", async () => {
    const stats = new Stats(makeState(), {});
    await record(stats, event({ verdict: "MYSTERY" }));
    const snap = await snapshot(stats);
    expect(snap.totals.total).toBe(1);
    expect(snap.totals.MYSTERY).toBeUndefined();
  });
});

describe("Stats — error isolation", () => {
  it("returns 500 (not a throw) when a record write fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const state = makeState();
    state.storage.put = async () => {
      throw new Error("write failed");
    };
    const stats = new Stats(state, {});
    const resp = await record(stats, event());
    expect(resp.status).toBe(500);
  });

  it("returns an empty snapshot when a read fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const state = makeState();
    state.storage.get = async () => {
      throw new Error("read failed");
    };
    const stats = new Stats(state, {});
    const snap = await snapshot(stats);
    expect(snap).toMatchObject({ topReasons: [], events: [] });
    expect(snap.totals.total).toBe(0);
  });
});
