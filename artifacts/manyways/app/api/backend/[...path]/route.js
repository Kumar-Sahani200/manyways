import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowed = /^(projects(?:\/[a-zA-Z0-9_-]+(?:\/(?:runs|export))?)?|runs\/[a-zA-Z0-9_-]+(?:\/(?:cancel|apply))?|ready)$/;

async function gateway(request, context) {
  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return Response.json({ detail: "Clerk is not configured." }, { status: 503 });
  }
  const session = await auth();
  if (!session.userId) return Response.json({ detail: "Sign in to continue." }, { status: 401 });
  const token = await session.getToken();
  if (!token) return Response.json({ detail: "Session expired." }, { status: 401 });
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!allowed.test(endpoint)) return Response.json({ detail: "Not found." }, { status: 404 });
  const origin = process.env.MANYWAYS_API_URL;
  if (!origin) return Response.json({ detail: "The story API is not configured yet." }, { status: 503 });
  let url;
  try {
    url = new URL(origin);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error();
  } catch {
    return Response.json({ detail: "The story API origin is invalid." }, { status: 503 });
  }
  const raw = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();
  if (raw && Buffer.byteLength(raw) > 350000) {
    return Response.json({ detail: "Request is too large." }, { status: 413 });
  }
  try {
    const upstream = await fetch(`${origin.replace(/\/$/, "")}/v1/${endpoint}`, {
      method: request.method, body: raw, cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const headers = { "Cache-Control": "no-store", "Content-Type": upstream.headers.get("content-type") || "application/json" };
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers["Content-Disposition"] = disposition;
    return new Response(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status, headers });
  } catch {
    return Response.json({ detail: "The story API is temporarily unreachable. Your saved work has not been changed." }, { status: 503 });
  }
}

export { gateway as GET, gateway as POST, gateway as PUT, gateway as DELETE };
