import type { NextRequest } from "next/server";
import { requireAdmin, success, error } from "../_helpers";

const CF_API = "https://api.cloudflare.com/client/v4";

function getCredentials() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) throw new Error("Cloudflare credentials not configured");
  return { token, zoneId };
}

function cfHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function cfGet(path: string) {
  const { token } = getCredentials();
  const res = await fetch(`${CF_API}${path}`, { headers: cfHeaders(token) });
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || "Cloudflare API error");
  return data.result;
}

async function cfPatch(path: string, body: Record<string, unknown>) {
  const { token } = getCredentials();
  const res = await fetch(`${CF_API}${path}`, {
    method: "PATCH", headers: cfHeaders(token), body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || "Cloudflare API error");
  return data.result;
}

async function cfPost(path: string, body?: Record<string, unknown>) {
  const { token } = getCredentials();
  const res = await fetch(`${CF_API}${path}`, {
    method: "POST", headers: cfHeaders(token), body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.errors?.[0]?.message || "Cloudflare API error");
  return data.result;
}

// ── GET ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);

    const { zoneId } = getCredentials();
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "overview";

    switch (action) {
      case "overview": {
        const zone = await cfGet(`/zones/${zoneId}`);
        return success({
          zone: {
            id: zone.id, name: zone.name, status: zone.status,
            plan: zone.plan?.name ?? "Unknown", nameServers: zone.name_servers,
            paused: zone.paused, devMode: zone.development_mode ?? false,
            type: zone.type, created_on: zone.created_on, modified_on: zone.modified_on,
          },
        });
      }
      case "analytics": {
        const since = url.searchParams.get("since") || new Date(Date.now() - 7 * 86400000).toISOString();
        const until = url.searchParams.get("until") || new Date().toISOString();
        const [dashboard, colo] = await Promise.all([
          cfGet(`/zones/${zoneId}/analytics/dashboard?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&continuous=true`),
          cfGet(`/zones/${zoneId}/analytics/colos?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&continuous=true`).catch(() => []),
        ]);
        return success({ dashboard, colo });
      }
      case "dns": {
        const page = url.searchParams.get("page") || "1";
        const records = await cfGet(`/zones/${zoneId}/dns_records?page=${page}&per_page=50`);
        return success({ records });
      }
      case "firewall": {
        const [rules, filters] = await Promise.all([
          cfGet(`/zones/${zoneId}/firewall/rules?per_page=50`).catch(() => []),
          cfGet(`/zones/${zoneId}/filters?per_page=50`).catch(() => []),
        ]);
        return success({ rules, filters });
      }
      case "ssl": {
        const [settings, packs] = await Promise.all([
          cfGet(`/zones/${zoneId}/settings/ssl`),
          cfGet(`/zones/${zoneId}/ssl/certificate_packs?status=all`).catch(() => []),
        ]);
        return success({ settings, packs });
      }
      case "cache": {
        const [cacheLevel, browserCache, alwaysOnline, devMode] = await Promise.all([
          cfGet(`/zones/${zoneId}/settings/cache_level`).catch(() => ({ value: "unknown" })),
          cfGet(`/zones/${zoneId}/settings/browser_cache_ttl`).catch(() => ({ value: 0 })),
          cfGet(`/zones/${zoneId}/settings/always_online`).catch(() => ({ value: "off" })),
          cfGet(`/zones/${zoneId}/settings/development_mode`).catch(() => ({ value: "off" })),
        ]);
        return success({ cacheLevel, browserCache, alwaysOnline, devMode });
      }
      case "waf": {
        const pkgs = await cfGet(`/zones/${zoneId}/firewall/waf/packages?per_page=50`).catch(() => []);
        let rules: unknown[] = [];
        if (pkgs && (pkgs as Array<{ id: string }>).length > 0) {
          const pkgId = (pkgs as Array<{ id: string }>)[0].id;
          rules = await cfGet(`/zones/${zoneId}/firewall/waf/packages/${pkgId}/rules?per_page=50`).catch(() => []);
        }
        return success({ packages: pkgs, rules });
      }
      case "rate_limits": {
        const rules = await cfGet(`/zones/${zoneId}/rate_limits?per_page=50`).catch(() => []);
        return success({ rules });
      }
      case "page_rules": {
        const rules = await cfGet(`/zones/${zoneId}/pagerules?per_page=50`).catch(() => []);
        return success({ rules });
      }
      case "workers": {
        const routes = await cfGet(`/zones/${zoneId}/workers/routes?per_page=50`).catch(() => []);
        return success({ routes });
      }
      case "ip_access": {
        const rules = await cfGet(`/zones/${zoneId}/firewall/access_rules/rules?per_page=50`).catch(() => []);
        return success({ rules });
      }
      case "http": {
        const since = new Date(Date.now() - 86400000).toISOString();
        const [events] = await Promise.all([
          cfGet(`/zones/${zoneId}/security/events?per_page=20`).catch(() => []),
        ]);
        return success({ events });
      }
      case "bots": {
        const botMgmt = await cfGet(`/zones/${zoneId}/bot_management`).catch(() => ({}));
        return success({ botMgmt });
      }
      case "webvitals": {
        return success({ vitals: [], message: "Web Vitals available in Cloudflare Analytics dashboard." });
      }
      case "turnstile": {
        return success({ siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "Not configured" });
      }
      case "healthchecks": {
        const checks = await cfGet(`/zones/${zoneId}/healthchecks?per_page=50`).catch(() => []);
        return success({ checks });
      }
      case "notifications": {
        const alerts = await cfGet(`/zones/${zoneId}/notification_policies?per_page=50`).catch(() => []);
        return success({ alerts });
      }
      case "audit_log": {
        const logs = await cfGet(`/zones/${zoneId}/audit_logs?per_page=50`).catch(() => []);
        return success({ logs });
      }
      case "email": {
        const routing = await cfGet(`/zones/${zoneId}/email/routing`).catch(() => ({}));
        return success({ routing });
      }
      default:
        return error("Invalid action.");
    }
  } catch (e) {
    console.error("Cloudflare GET error:", e);
    return error(e instanceof Error ? e.message : "Cloudflare request failed.", 500);
  }
}

// ── POST ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return error("Not authenticated.", 401);
    const { zoneId } = getCredentials();
    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case "purge_cache": {
        await cfPost(`/zones/${zoneId}/purge_cache`, { purge_everything: true });
        return success({ message: "Cache purged." });
      }
      case "purge_url": {
        const urls: string[] = data.urls || [];
        if (urls.length === 0) return error("URLs required.");
        await cfPost(`/zones/${zoneId}/purge_cache`, { files: urls });
        return success({ message: `Purged ${urls.length} URLs.` });
      }
      case "toggle_dev_mode": {
        const current = await cfGet(`/zones/${zoneId}/settings/development_mode`);
        const newVal = current?.value === "on" ? "off" : "on";
        await cfPatch(`/zones/${zoneId}/settings/development_mode`, { value: newVal });
        return success({ developmentMode: newVal === "on" });
      }
      case "toggle_security_level": {
        const val = data.value || "medium";
        await cfPatch(`/zones/${zoneId}/settings/security_level`, { value: val });
        return success({ message: `Security level: ${val}.` });
      }
      case "toggle_cache_level": {
        const val = data.value || "standard";
        await cfPatch(`/zones/${zoneId}/settings/cache_level`, { value: val });
        return success({ message: `Cache level: ${val}.` });
      }
      case "toggle_ssl": {
        const val = data.value || "full";
        await cfPatch(`/zones/${zoneId}/settings/ssl`, { value: val });
        return success({ message: `SSL: ${val}.` });
      }
      case "toggle_always_online": {
        const val = data.value || "off";
        await cfPatch(`/zones/${zoneId}/settings/always_online`, { value: val });
        return success({ message: `Always Online: ${val}.` });
      }
      default:
        return error("Invalid action.");
    }
  } catch (e) {
    console.error("Cloudflare POST error:", e);
    return error(e instanceof Error ? e.message : "Cloudflare action failed.", 500);
  }
}
