// Helper to wrap API responses with CORS headers so the storefront
// (running on the shop's domain) can call our app's API endpoints.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function corsJson(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function corsError(message: string, status = 400) {
  return corsJson({ error: message }, { status });
}
