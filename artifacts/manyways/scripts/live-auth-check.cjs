/**
 * Opt-in acceptance check against the CURRENT Replit preview and a Clerk dev
 * instance. Creates and deletes a synthetic Clerk user and an Atlas project.
 * No auth bypass, token logs, traces, or production accounts.
 */
const { createClerkClient } = require("@clerk/nextjs/server");
const { chromium, expect } = require("@playwright/test");

async function main() {
  if (!process.argv.includes("--live") || !process.env.REPLIT_DEV_DOMAIN) {
    throw new Error("Use --live in the configured Replit development environment.");
  }
  const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const domains = await clerk.domains.list();
  if (!domains.data.some(d => !d.isSatellite && new URL(d.frontendApiUrl).hostname.endsWith(".clerk.accounts.dev"))) {
    throw new Error("This check only runs against a Clerk development instance.");
  }
  let user, ticket, browser, page, projectId;
  try {
    user = await clerk.users.createUser({
      emailAddress: [`manyways-acceptance-${Date.now()}+clerk_test@example.com`],
      skipPasswordRequirement: true,
    });
    ticket = await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 90 });
    browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox"] });
    page = await browser.newPage();
    await page.goto(`${origin}/sign-in`);
    await page.waitForFunction(() => window.Clerk?.loaded && window.Clerk?.client);
    const completed = await page.evaluate(async token => {
      const result = await window.Clerk.client.signIn.create({ strategy: "ticket", ticket: token });
      if (result.status !== "complete") return false;
      await window.Clerk.setActive({ session: result.createdSessionId });
      return true;
    }, ticket.token);
    if (!completed) throw new Error("Clerk did not complete the synthetic development sign-in.");
    await page.goto(`${origin}/workspace`);
    await expect(page.getByRole("heading", { name: /Where does your story/ })).toBeVisible({ timeout: 20000 });
    const created = await page.evaluate(async () => {
      const response = await fetch("/api/backend/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Acceptance check — temporary story" }),
      });
      return { status: response.status, project: response.ok ? await response.json() : null };
    });
    if (created.status !== 201) throw new Error(`Authenticated project creation failed (HTTP ${created.status}).`);
    projectId = created.project.id;
    const root = created.project.nodes[0].id;
    const data = {
      title: created.project.title, version: created.project.version,
      goal: { description: "Create curiosity", audience: "Mystery readers" },
      nodes: [
        { id: root, parentId: null, title: "Opening", kind: "section", text: "A door opens." },
        { id: "inside", parentId: root, title: "Inside", kind: "section", text: "She steps inside." },
        { id: "outside", parentId: root, title: "Outside", kind: "section", text: "She walks away." },
        { id: "end-inside", parentId: "inside", title: "Inside ending", kind: "end", text: "" },
        { id: "end-outside", parentId: "outside", title: "Outside ending", kind: "end", text: "" },
      ],
    };
    const saved = await page.evaluate(async ({ id, body }) => {
      const response = await fetch(`/api/backend/projects/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      return response.status;
    }, { id: projectId, body: data });
    if (saved !== 200) throw new Error(`Authenticated project save failed (HTTP ${saved}).`);
    await page.reload();
    await page.getByRole("button", { name: /^Acceptance check — temporary story/ }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("A door opens.");
    await page.getByLabel("Text", { exact: true }).fill("A door opens. A letter waits.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /^Acceptance check — temporary story/ }).click();
    await expect(page.getByLabel("Text", { exact: true })).toHaveValue("A door opens. A letter waits.");
    const exported = await page.evaluate(async id => {
      const response = await fetch(`/api/backend/projects/${id}/export`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchIds: ["end-inside"] }),
      });
      return { status: response.status, text: await response.text() };
    }, projectId);
    if (exported.status !== 200 || exported.text !== "A door opens. A letter waits.\n\nShe steps inside.") {
      throw new Error("Live branch export did not contain the saved root-to-end path.");
    }
    await page.screenshot({ path: "../../generated-artifacts/live-workspace.jpg", fullPage: false });
    console.log("PASS: Real Clerk development sign-in, JWT gateway, Atlas create/save/reopen, UI edit persistence, and branch export.");
  } finally {
    if (projectId && page) {
      try {
        const response = await page.evaluate(async id => (await fetch(`/api/backend/projects/${id}`, { method: "DELETE" })).status, projectId);
        if (response !== 204) console.error("Cleanup warning: synthetic Atlas project was not removed.");
      } catch { console.error("Cleanup warning: synthetic Atlas project deletion failed."); }
    }
    if (ticket) {
      try { await clerk.signInTokens.revokeSignInToken(ticket.id); } catch { /* consumed/expired */ }
    }
    if (user) {
      try { await clerk.users.deleteUser(user.id); } catch { console.error("Cleanup warning: synthetic Clerk user deletion failed."); }
    }
    await browser?.close();
  }
}

main().catch(error => {
  // Only our deliberately sanitized errors are printed; SDK bodies can contain private data.
  const message = error?.constructor === Error ? error.message : `${error.constructor?.name || "ServiceError"} (HTTP ${error.status || "unknown"})`;
  console.error("Live acceptance failed:", message);
  process.exitCode = 1;
});
