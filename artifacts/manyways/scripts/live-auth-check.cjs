/**
 * Real development acceptance check. No auth bypass, saved tokens, traces or real users.
 * Opt in with --live. Creates/deletes synthetic Clerk users and their Atlas project.
 */
const { createClerkClient } = require("@clerk/nextjs/server");
const { chromium, expect } = require("@playwright/test");

async function main() {
  if (!process.argv.includes("--live") || !process.env.REPLIT_DEV_DOMAIN ||
      !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
      !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    throw new Error("Use --live only in the configured Replit/Clerk development instance.");
  }
  const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const users = [], tickets = [];
  let browser, page, projectId;
  async function signIn() {
    const user = await clerk.users.createUser({
      emailAddress: [`manyways-${Date.now()}-${users.length}+clerk_test@example.com`],
      skipPasswordRequirement: true,
    });
    users.push(user);
    const ticket = await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 90 });
    tickets.push(ticket);
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(origin + "/sign-in");
    await p.waitForFunction(() => window.Clerk?.loaded && window.Clerk?.client);
    const complete = await p.evaluate(async token => {
      const result = await window.Clerk.client.signIn.create({ strategy: "ticket", ticket: token });
      if (result.status !== "complete") return false;
      await window.Clerk.setActive({ session: result.createdSessionId });
      return true;
    }, ticket.token);
    if (!complete) throw new Error("Synthetic Clerk sign-in did not complete.");
    await p.goto(origin + "/workspace");
    await expect(p.getByLabel("Project title")).toBeVisible({ timeout: 20000 });
    return p;
  }
  async function call(p, method, path, body) {
    return p.evaluate(async ({ method, path, body }) => {
      const r = await fetch("/api/backend/v1" + path, {
        method, headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch {}
      return { status: r.status, data, text };
    }, { method, path, body });
  }
  try {
    browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
    page = await signIn();
    console.log("Live check: real Clerk session established.");
    const title = "Acceptance check - temporary story";
    await page.getByLabel("Project title").fill(title);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByLabel("Section text")).toBeVisible();
    const projects = await call(page, "GET", "/projects");
    if (projects.status !== 200) throw new Error(`Authenticated project list failed (${projects.status}).`);
    projectId = projects.data.find(p => p.title === title)?.id;
    if (!projectId) throw new Error("Created project was not persisted.");
    await page.getByLabel("Section text").fill("A door opens. A letter waits.");
    await page.getByRole("button", { name: "Add child" }).click();
    await page.getByLabel("Section text").fill("She steps inside.");
    await page.getByRole("checkbox", { name: /end/i }).check();
    await page.getByRole("button", { name: "Save now" }).click();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    console.log("Live check: manual edits saved through the JWT gateway.");
    const saved = await call(page, "GET", `/projects/${projectId}`);
    const end = saved.data.nodes.find(n => n.is_end);
    if (!end) throw new Error("Manual end node did not persist.");
    const exported = await call(page, "POST", `/projects/${projectId}/export`, { branch_ids: [end.id], format: "text" });
    if (exported.status !== 200 || !exported.text.includes("A door opens. A letter waits.\n\nShe steps inside.")) {
      throw new Error("Authenticated selected-branch export was incorrect.");
    }
    await page.reload();
    await page.getByRole("button", { name: new RegExp("^" + title) }).click();
    await expect(page.getByLabel("Section text")).toHaveValue("A door opens. A letter waits.");
    console.log("Live check: reopened saved tree and verified text export.");
    const second = await signIn();
    console.log("Live check: second independent session established.");
    for (const method of ["GET", "DELETE"]) {
      const denied = await call(second, method, `/projects/${projectId}`);
      if (denied.status !== 404) throw new Error(`Cross-user ${method} was not denied (${denied.status}).`);
    }
    const invalidReturn = origin + "/sign-in?redirect_url=https://evil.example";
    await second.goto(invalidReturn);
    await expect(second).toHaveURL(/\/workspace/);
    await page.setViewportSize({ width: 390, height: 844 });
    if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) {
      throw new Error("Signed-in editor overflows a phone viewport.");
    }
    await page.screenshot({ path: "../../generated-artifacts/live-workspace.jpg" });
    await second.waitForFunction(() => window.Clerk?.loaded && window.Clerk?.session);
    await second.evaluate(() => window.Clerk.signOut());
    await second.waitForFunction(() => window.Clerk?.loaded && !window.Clerk.session);
    await second.goto(origin + "/workspace");
    await expect(second).toHaveURL(/\/sign-in/);
    console.log("PASS: real Clerk dev sign-in, API-template JWT, Atlas CRUD, rendered manual editor, persistence, selected export, two-user isolation, safe returns, mobile layout and sign-out.");
  } finally {
    if (projectId && page) {
      try {
        if ((await call(page, "DELETE", `/projects/${projectId}`)).status !== 204) console.error("Synthetic project cleanup needs attention.");
      } catch { console.error("Synthetic project cleanup needs attention."); }
    }
    for (const t of tickets) { try { await clerk.signInTokens.revokeSignInToken(t.id); } catch {} }
    for (const u of users) { try { await clerk.users.deleteUser(u.id); } catch { console.error("Synthetic development user cleanup needs attention."); } }
    await browser?.close();
  }
}
main().catch(error => {
  // Clerk SDK error objects may include private request details. Never print them.
  console.error("Live acceptance failed:", error?.constructor === Error ? error.message : `${error.constructor?.name || "ServiceError"} (HTTP ${error.status || "unknown"})`);
  process.exitCode = 1;
});
