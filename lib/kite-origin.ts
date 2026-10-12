// Zerodha accepts plain HTTP only for 127.0.0.1. A session cookie set on
// localhost is not sent when the browser returns to 127.0.0.1.
export function kiteCallbackOrigin(redirectUrl: string | undefined): URL | null {
  if (!redirectUrl) return null;
  let target: URL;
  try {
    target = new URL(redirectUrl);
  } catch {
    return null;
  }
  if (target.protocol === "http:" && target.hostname === "localhost") {
    target.hostname = "127.0.0.1";
  }
  return target;
}

function loopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function portOf(url: URL): string {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

// Next's request.url can say localhost while the browser used 127.0.0.1.
// Only accept that swap, or the configured callback host. Anything else stays put.
export function browserUrl(request: Request, callback?: URL | null): URL {
  const url = new URL(request.url);
  const rawHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!rawHost) return url;
  const host = rawHost.split(",")[0]?.trim();
  if (!host) return url;
  const next = new URL(url.href);
  next.host = host;
  const trusted =
    next.host === url.host ||
    (callback != null && next.host === callback.host) ||
    (portOf(next) === portOf(url) && loopback(next.hostname) && loopback(url.hostname));
  if (!trusted) return url;
  url.host = next.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "http" || proto === "https") url.protocol = `${proto}:`;
  return url;
}
