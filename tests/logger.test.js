import { describe, it, expect, vi, afterEach } from "vitest";
import { logDecision, logError } from "../src/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function captureLog(fn) {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  fn();
  const calls = spy.mock.calls.map((args) => JSON.parse(args[0]));
  return calls;
}

describe("logDecision", () => {
  it("emits a single structured JSON line with the standard envelope", () => {
    const [line] = captureLog(() =>
      logDecision({ verdict: "ALLOW", score: 0, ip: "1.2.3.x" })
    );
    expect(line).toMatchObject({
      level: "info",
      service: "sentinel",
      msg: "decision",
      verdict: "ALLOW",
      score: 0,
      ip: "1.2.3.x",
    });
    expect(line.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(line.version).toBeDefined();
  });

  it.each(["CHALLENGE", "BLOCK", "RATE_LIMITED"])(
    "logs a %s decision at warn level",
    (verdict) => {
      const [line] = captureLog(() => logDecision({ verdict }));
      expect(line.level).toBe("warn");
    }
  );

  it("never throws on a non-serializable payload", () => {
    const circular = { verdict: "ALLOW" };
    circular.self = circular;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => logDecision(circular)).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("logError", () => {
  it("serializes an Error with name and message at error level", () => {
    const [line] = captureLog(() =>
      logError("rate_limiter_storage_error", new TypeError("boom"), { ip: "9.9.9.x" })
    );
    expect(line).toMatchObject({
      level: "error",
      msg: "rate_limiter_storage_error",
      ip: "9.9.9.x",
      error: { name: "TypeError", message: "boom" },
    });
  });

  it("coerces a non-Error reason to a message string", () => {
    const [line] = captureLog(() => logError("oops", "plain string"));
    expect(line.error.message).toBe("plain string");
  });
});
