import "server-only";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(request, context) {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ detail: "Sign in to continue." }, { status: 401 });
  // Cookie-authenticated browser mutations require a same-origin request.
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const allowedOrigins = process.env.APP_ORIGINS?.split(",").map(x => x.trim()) || [
      new URL(request.url).origin,
      ...(process.env.REPLIT_DEV_DOMAIN && process.env.APP_ENV !== "production" ? [`https://${process.env.REPLIT_DEV_DOMAIN}`] : []),
    ];
    if (!origin || !allowedOrigins.includes(origin)) {
      return Response.json({ detail: "Cross-origin mutation refused." }, { status: 403 });
    }
  }
  const { path } = await context.params;
  if (!path?.length || path[0] !== "v1" || path.some(p => !/^[a-zA-Z0-9_-]+$/.test(p))) {
    return Response.json({ detail: "Invalid API path." }, { status: 400 });
  }
  const base = process.env.STORY_API_URL;
  if (!base) return Response.json({ detail: "Story API is not configured. Set STORY_API_URL on the server." }, { status: 503 });
  const template = process.env.CLERK_JWT_TEMPLATE || "manyways-api";
  let token;
  try { token = await getToken({ template }); } catch {
    return Response.json({ detail: "Configure the manyways-api JWT template in your external Clerk instance." }, { status: 503 });
  }
  if (!token) return Response.json({ detail: "The Clerk API token template is unavailable. Check its configuration." }, { status: 503 });
  try {
    let body;
    if (!["GET", "HEAD"].includes(request.method)) {
      const chunks = []; let total = 0;
      const reader = request.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > 1000000) { await reader.cancel(); return Response.json({ detail: "Request exceeds 1 MB." }, { status: 413 }); }
          chunks.push(value);
        }
        body = Buffer.concat(chunks);
      }
    }
    const response = await fetch(`${base.replace(/\/$/, "")}/${path.join("/")}`, {
      method: request.method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body, cache: "no-store", signal: AbortSignal.timeout(25000), redirect: "error",
    });
    const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    for (const key of ["Content-Type", "Content-Disposition"]) {
      if (response.headers.has(key)) headers.set(key, response.headers.get(key));
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ detail: "Story service is unavailable. Your saved work has not been replaced." }, { status: 503 });
  }
}
export { forward as GET, forward as POST, forward as PUT, forward as DELETE };
