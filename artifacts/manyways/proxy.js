import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const protectedRoute = createRouteMatcher(["/workspace(.*)", "/api/backend(.*)"]);
const configured = () => !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

const authenticated = clerkMiddleware(async (auth, request) => {
  if (protectedRoute(request)) await auth.protect();
}, { signInUrl: "/sign-in", signUpUrl: "/sign-up" });

export default function proxy(request, event) {
  if (!configured()) {
    if (request.nextUrl.pathname.startsWith("/api/backend")) {
      return NextResponse.json({ detail: "Clerk is not configured." }, { status: 503 });
    }
    if (protectedRoute(request)) return NextResponse.redirect(new URL("/setup", request.url));
    return NextResponse.next();
  }
  return authenticated(request, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|map|txt|xml)).*)", "/(api)(.*)"],
};
