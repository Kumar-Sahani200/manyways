import { clerkMiddleware } from "@clerk/nextjs/server";

// Route handlers and the workspace perform their own checks as well.
export default clerkMiddleware();
export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|txt|map)).*)", "/(api)(.*)"],
};
