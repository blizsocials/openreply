import { getMetaGraphApiVersion, requireEnv } from "@/lib/env";

/**
 * Instagram API with Facebook Login (Blizsocials multi-client mode).
 *
 * An agency signs in once with Facebook and gets every Page it manages in
 * Business Manager, each with its linked Instagram professional account. Such
 * accounts are called through graph.facebook.com with the Page access token
 * instead of graph.instagram.com with an Instagram user token.
 *
 * To keep the rest of OpenReply unchanged, a Facebook-login account stores a
 * composite token: "FBL1." + base64url(JSON {ig, page, t}). Every Graph call in
 * lib/meta/client.ts goes through metaFetch(), which recognises the composite
 * token and rewrites the request for the Facebook Graph API. Instagram-login
 * tokens pass through untouched.
 */

const PREFIX = "FBL1.";

export type FacebookLoginToken = { ig: string; page: string; t: string };

export function encodeFacebookLoginToken(value: FacebookLoginToken): string {
  return PREFIX + Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeFacebookLoginToken(token: string | null | undefined): FacebookLoginToken | null {
  if (!token || !token.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(token.slice(PREFIX.length), "base64url").toString("utf8"));
    if (parsed && typeof parsed.ig === "string" && typeof parsed.page === "string" && typeof parsed.t === "string") {
      return parsed as FacebookLoginToken;
    }
  } catch {
    // fall through
  }
  return null;
}

export function isFacebookLoginToken(token: string | null | undefined): boolean {
  return decodeFacebookLoginToken(token) !== null;
}

function facebookGraphHost() {
  return "graph.facebook.com";
}

function bearerOf(init?: RequestInit): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  let value: string | null | undefined;
  if (headers instanceof Headers) value = headers.get("Authorization");
  else if (Array.isArray(headers)) value = headers.find(([k]) => k.toLowerCase() === "authorization")?.[1];
  else value = (headers as Record<string, string>).Authorization ?? (headers as Record<string, string>).authorization;
  if (!value || !value.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length);
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit | undefined {
  if (!init?.headers) return init;
  const headers = new Headers(init.headers as HeadersInit);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * Rewrites one Graph request for a Facebook-login account. Exported for tests.
 */
export function rewriteForFacebookLogin(
  input: string,
  init?: RequestInit
): { url: string; init?: RequestInit } {
  const url = new URL(input);
  const queryToken = url.searchParams.get("access_token");
  const headerToken = bearerOf(init);
  const fb = decodeFacebookLoginToken(queryToken) ?? decodeFacebookLoginToken(headerToken);
  if (!fb) return { url: input, init };

  if (url.hostname === "graph.instagram.com") url.hostname = facebookGraphHost();

  // Path is /<version>/<node>/<edge?>
  const parts = url.pathname.split("/");
  // parts[0] = "", parts[1] = version, parts[2] = node, parts[3] = edge
  if (parts[2] === "me") parts[2] = fb.ig;
  const node = parts[2];
  const edge = parts[3];

  if (node === fb.ig && (edge === "messages" || edge === "conversations" || edge === "subscribed_apps")) {
    parts[2] = fb.page;
    if (edge === "conversations") url.searchParams.set("platform", "instagram");
  }
  url.pathname = parts.join("/");

  // The Instagram-login only field user_id does not exist on the Facebook
  // Graph IG user node; the node id already is the professional account id.
  const fields = url.searchParams.get("fields");
  if (fields && node === fb.ig && !edge) {
    url.searchParams.set(
      "fields",
      fields
        .split(",")
        .filter((f) => f.trim() !== "user_id")
        .join(",")
    );
  }

  if (queryToken) url.searchParams.set("access_token", fb.t);
  let nextInit = headerToken ? withBearer(init, fb.t) : init;

  // Page webhook subscription takes Page fields, not Instagram fields.
  if (edge === "subscribed_apps" && nextInit?.method === "POST") {
    url.searchParams.set("subscribed_fields", "feed");
    nextInit = { ...nextInit, body: JSON.stringify({ subscribed_fields: ["feed"] }) };
  }

  return { url: url.toString(), init: nextInit };
}

/** fetch() for Meta Graph calls that understands Facebook-login accounts. */
export function metaFetch(input: string, init?: RequestInit): Promise<Response> {
  const rewritten = rewriteForFacebookLogin(input, init);
  return fetch(rewritten.url, rewritten.init);
}

// ---- OAuth (Facebook Login for Business) -------------------------------

export const FACEBOOK_LOGIN_SCOPES = [
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "business_management",
];

function graphBase() {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`;
}

export function getFacebookAuthorizationUrl(redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${getMetaGraphApiVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID;
  if (configId) url.searchParams.set("config_id", configId);
  else url.searchParams.set("scope", FACEBOOK_LOGIN_SCOPES.join(","));
  return url.toString();
}

async function graphJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString());
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data as { error?: unknown }).error) {
    const err = (data as { error?: { message?: string; code?: number } }).error;
    throw new Error(`Facebook ${err?.code ?? response.status}: ${err?.message ?? "request failed"}`);
  }
  return data as T;
}

export async function exchangeFacebookCode(code: string, redirectUri: string): Promise<string> {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const data = await graphJson<{ access_token: string }>(url);
  return data.access_token;
}

export async function getLongLivedFacebookUserToken(shortToken: string): Promise<string> {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortToken);
  const data = await graphJson<{ access_token: string }>(url);
  return data.access_token;
}

export type ManagedInstagramAccount = {
  pageId: string;
  pageName: string;
  pageToken: string;
  instagramId: string | null;
  username: string | null;
  name: string | null;
  profilePictureUrl: string | null;
};

/**
 * Every Page the signed-in user manages (directly or as a Business Manager
 * partner), with its linked Instagram professional account when there is one.
 * Page tokens obtained from a long-lived user token do not expire.
 */
export async function listManagedInstagramAccounts(userToken: string): Promise<ManagedInstagramAccount[]> {
  const results: ManagedInstagramAccount[] = [];
  let next: string | null = (() => {
    const url = new URL(`${graphBase()}/me/accounts`);
    url.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}"
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", userToken);
    return url.toString();
  })();
  let guard = 0;
  while (next && guard++ < 20) {
    const page: {
      data: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
      }>;
      paging?: { next?: string };
    } = await graphJson(new URL(next));
    for (const p of page.data ?? []) {
      const ig = p.instagram_business_account;
      results.push({
        pageId: p.id,
        pageName: p.name,
        pageToken: p.access_token,
        instagramId: ig?.id ?? null,
        username: ig?.username ?? null,
        name: ig?.name ?? null,
        profilePictureUrl: ig?.profile_picture_url ?? null,
      });
    }
    next = page.paging?.next ?? null;
  }
  return results;
}
