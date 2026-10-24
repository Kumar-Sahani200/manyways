import { test, expect } from "@playwright/test";

test("marketing explains the actual product without sample entry points", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("every version");
  await expect(page.getByRole("link", { name: /sample/i })).toHaveCount(0);
  await expect(page.locator('a[href^="/studio"]')).toHaveCount(0);
  await expect(page.locator('a[href="/workspace"]').first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("YC-backed");
});

test("workspace and obsolete studio require sign-in without honoring hostile returns", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/studio?sample=1&redirect_url=https://evil.example");
  await expect(page).toHaveURL(/\/sign-in/);
  expect(new URL(page.url()).hostname).not.toBe("evil.example");
});

test("mobile marketing navigation is accessible without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open menu" });
  await menu.click();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("anonymous backend requests are refused", async ({ request }) => {
  const response = await request.get("/api/backend/v1/projects");
  expect(response.status()).toBe(401);
});
