import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { BACKEND_URL } from "@/lib/backend";
import { COOKIES, MAX_AGE, cookieOptions } from "@/lib/session-cookies";

/**
 * Passerelle navigateur -> API DONNA : /api/donna/<chemin> -> <backend>/app/<chemin>.
 * Le jeton reste dans le cookie httpOnly et n'est ajouté qu'ici. Les réponses (y compris
 * le flux SSE de /chat/stream) sont retransmises telles quelles, sans mise en mémoire.
 * Seules les routes utiles à l'interface passent : pas d'accès générique à l'API.
 */
const ALLOWED = [/^chat(\/|$)/, /^rag\/documents\/[^/]+\/file$/, /^auth\/oauth\/me\/accounts$/];

// En-têtes de réponse relayés (le reste — cookies backend, CORS — reste côté serveur).
const RESPONSE_HEADERS = ["content-type", "content-disposition", "content-length", "cache-control"];

async function refreshTokens(refreshToken: string) {
  try {
    const response = await fetch(`${BACKEND_URL}/app/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.access_token ? (data as { access_token: string; refresh_token: string }) : null;
  } catch {
    return null;
  }
}

async function forward(request: NextRequest, { params }: RouteContext<"/api/donna/[...path]">) {
  const { path } = await params;
  const joined = path.map(encodeURIComponent).join("/");
  if (!ALLOWED.some((rule) => rule.test(path.join("/")))) {
    return Response.json({ detail: "Not found" }, { status: 404 });
  }

  const store = await cookies();
  let access = store.get(COOKIES.access)?.value;
  const refresh = store.get(COOKIES.refresh)?.value;
  if (!access && !refresh) return Response.json({ detail: "Session expirée" }, { status: 401 });

  // Corps lu une fois : il peut être renvoyé après un renouvellement de jeton.
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const target = `${BACKEND_URL}/app/${joined}${request.nextUrl.search}`;

  const call = (token: string | undefined) =>
    fetch(target, {
      method: request.method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(request.headers.get("content-type") ? { "content-type": request.headers.get("content-type")! } : {}),
        accept: request.headers.get("accept") ?? "*/*",
      },
      body,
      cache: "no-store",
      // Interrompt l'appel backend si le navigateur abandonne (bouton « Arrêter », navigation).
      signal: request.signal,
    });

  let renewed: Awaited<ReturnType<typeof refreshTokens>> = null;
  let upstream: Response;
  try {
    upstream = await call(access);
    if (upstream.status === 401 && refresh) {
      renewed = await refreshTokens(refresh);
      if (renewed) {
        access = renewed.access_token;
        upstream = await call(access);
      }
    }
  } catch {
    return Response.json({ detail: "Service indisponible" }, { status: 503 });
  }

  const headers = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (headers.get("content-type")?.startsWith("text/event-stream")) {
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
  }
  if (renewed) {
    store.set(COOKIES.access, renewed.access_token, cookieOptions(MAX_AGE.access));
    store.set(COOKIES.refresh, renewed.refresh_token, cookieOptions(MAX_AGE.refresh));
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
