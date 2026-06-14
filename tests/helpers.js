// Lightweight test doubles for the Workers runtime objects Sentinel touches.

// scoreRequest only reads request.headers.get(...) and request.cf, so a plain
// object with a real Headers instance is enough — no full Request needed.
export function makeReq({ headers = {}, cf = {} } = {}) {
  return { headers: new Headers(headers), cf };
}

// A full, clean Chrome-120 browser request: everything a real browser sends.
export function cleanBrowser(overrides = {}) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br",
    "sec-ch-ua": '"Chromium";v="120"',
    "sec-fetch-site": "none",
    ...(overrides.headers || {}),
  };
  const cf = {
    httpProtocol: "HTTP/2",
    tlsVersion: "TLSv1.3",
    asOrganization: "Comcast Cable",
    threatScore: 0,
    country: "US",
    ...(overrides.cf || {}),
  };
  return makeReq({ headers, cf });
}

// In-memory DurableObjectState.storage supporting both put(key, value) and
// put({ k1: v1, k2: v2 }), matching the Workers storage API.
export function makeState(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    storage: {
      async get(key) {
        return store.get(key);
      },
      async put(key, value) {
        if (key && typeof key === "object") {
          for (const [k, v] of Object.entries(key)) store.set(k, v);
        } else {
          store.set(key, value);
        }
      },
    },
    _store: store,
  };
}

// A minimal request for a Durable Object .fetch() call.
export function doRequest(url, body, method = "POST") {
  return { url, method, json: async () => body };
}
