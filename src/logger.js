// Structured JSON logging. One object per line so log shippers (Loki,
// Elasticsearch, Datadog) can ingest without a parser. Emitting must never
// throw into the request path, so every call is wrapped.

const SERVICE = "sentinel";
const VERSION = "0.1";

function emit(level, msg, fields) {
  try {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        service: SERVICE,
        version: VERSION,
        msg,
        ...fields,
      })
    );
  } catch {
    // Logging is best-effort; a serialization failure must not affect the caller.
  }
}

// A firewall decision. ALLOW is info; CHALLENGE/BLOCK/RATE_LIMITED are warn.
export function logDecision(fields) {
  const level = fields.verdict === "ALLOW" ? "info" : "warn";
  emit(level, "decision", fields);
}

export function logError(msg, error, fields = {}) {
  emit("error", msg, {
    ...fields,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { message: String(error) },
  });
}
