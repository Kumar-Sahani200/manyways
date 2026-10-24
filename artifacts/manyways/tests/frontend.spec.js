import { test, expect } from "@playwright/test";

test("marketing describes the agentic product without sample entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Emergent Intelligence for creative decisions", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open workspace/ })).toHaveAttribute("href", "/workspace");
  await expect(page.getByRole("link", { name: /sample/i })).toHaveCount(0);
  await page.getByRole("link", { name: /Start an experiment/ }).click();
  await expect(page).toHaveURL(/\/(setup|sign-in)/);
});

test("workspace and old Studio remain protected without credentials", async ({ page, request }) => {
  await page.goto("/studio?sample=1");
  await expect(page).toHaveURL(/\/(setup|sign-in)/);
  await expect(page.getByText("Illustrative sample report.")).toHaveCount(0);
  const response = await request.get("/api/backend/projects");
  expect([401, 404, 503]).toContain(response.status());
  const body = await response.text();
  expect(body).not.toContain("sk_test_");
});

test("mobile marketing navigation and setup screen fit viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Method", exact: true }).first().click();
  await expect(page).toHaveURL(/#method$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto("/sign-in");
  await expect(page.getByText("Sign-in is not configured in this environment yet.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
