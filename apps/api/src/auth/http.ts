// The little bit of HTTP the API needs from requests and responses, without pulling in Express's types.
export interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface HttpResponse {
  setHeader(name: string, value: string | string[]): unknown;
  getHeader(name: string): unknown;
  redirect(status: number, url: string): void;
}

/** Who's asking, as the proxy in front saw them. Caddy sets this header itself; on a laptop there may be none. */
export function clientIp(req: HttpRequest): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0].trim();
  return first || null;
}

export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = Array.isArray(header) ? header.join("; ") : (header ?? "");
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // A malformed cookie from somewhere else on the domain: ignore it.
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

// Session cookies are HttpOnly (page scripts can't read them) and SameSite=Lax (other sites can't make
// the browser send them with a POST, which is what protects the API from cross-site request forgery).
export function setCookie(res: HttpResponse, name: string, value: string, o: CookieOptions) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${o.maxAgeSeconds}`];
  if (o.secure) parts.push("Secure");
  const existing = res.getHeader("Set-Cookie");
  const list = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  res.setHeader("Set-Cookie", [...list, parts.join("; ")]);
}

export function clearCookie(res: HttpResponse, name: string, secure: boolean) {
  setCookie(res, name, "", { maxAgeSeconds: 0, secure });
}
