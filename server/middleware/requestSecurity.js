import { URL } from "url";

const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .split(":")[0];
}

function buildOriginSet() {
  const configured = [
    process.env.SITE_ORIGIN,
    process.env.SITE_ORIGIN_2,
    "https://martin-luther-website.onrender.com",
    "https://www.martinlutheroshkosh.com",
    "https://martinlutheroshkosh.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean);

  const set = new Set();
  for (const item of configured) {
    try {
      set.add(new URL(item).origin);
    } catch {
      // Ignore malformed env values instead of crashing startup.
    }
  }
  return set;
}

export function getAllowedOrigins() {
  return buildOriginSet();
}

export function isLocalDevOrigin(originValue) {
  try {
    const host = normalizeHost(new URL(originValue).host);
    return DEV_HOSTS.has(host);
  } catch {
    return false;
  }
}

function requestHost(req) {
  const forwardedHost = String(req.get("x-forwarded-host") || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.get("host") || "").split(",")[0].trim();
  return normalizeHost(host);
}

function originHost(originValue) {
  try {
    return normalizeHost(new URL(originValue).host);
  } catch {
    return "";
  }
}

function isAllowedOrigin(originValue, req) {
  const oHost = originHost(originValue);
  const rHost = requestHost(req);
  if (DEV_HOSTS.has(oHost) && DEV_HOSTS.has(rHost)) return true;
  if (oHost && rHost && oHost === rHost) return true;

  const allowedOrigins = getAllowedOrigins();
  try {
    const normalizedOrigin = new URL(originValue).origin;
    return allowedOrigins.has(normalizedOrigin);
  } catch {
    return false;
  }
}

export function enforceTrustedOrigin(options = {}) {
  const { allowNoOrigin = false } = options;

  return (req, res, next) => {
    const origin = req.get("origin");
    const referer = req.get("referer");

    if (origin) {
      if (isAllowedOrigin(origin, req)) return next();
      return res.status(403).json({ error: "Bad Origin" });
    }

    // Browser form posts may have no Origin but include Referer.
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (isAllowedOrigin(refOrigin, req)) return next();
      } catch {
        return res.status(403).json({ error: "Bad Referer" });
      }
      return res.status(403).json({ error: "Bad Referer" });
    }

    // Some same-site navigations/forms may omit both Origin and Referer.
    // Accept only if Fetch Metadata indicates same-site context.
    const fetchSite = String(req.get("sec-fetch-site") || "").toLowerCase();
    if (["same-origin", "same-site", "none"].includes(fetchSite)) {
      return next();
    }

    // Some browsers/proxies omit Fetch Metadata on first-party navigations.
    const fetchMode = String(req.get("sec-fetch-mode") || "").toLowerCase();
    const fetchDest = String(req.get("sec-fetch-dest") || "").toLowerCase();
    if (!fetchSite && fetchMode === "navigate" && fetchDest === "document") {
      return next();
    }

    if (allowNoOrigin) return next();
    return res.status(403).json({ error: "Origin required" });
  };
}
