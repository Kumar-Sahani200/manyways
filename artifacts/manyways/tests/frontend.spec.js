import { test, expect } from "@playwright/test";

test("custom draft, independent branches, audience validation and sample report persist", async ({ page }) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Create experiment", exact: true }).click();
  await expect(page.getByText("Add a title.")).toBeVisible();
  await page.getByLabel("Project title").fill("Launch message");
  await page.getByLabel("Original content", { exact: true }).fill("Original draft that must remain preserved.");
  await page.getByRole("button", { name: "Create experiment", exact: true }).click();
  await expect(page.getByLabel("Original content", { exact: true })).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Duplicate as branch" }).first().click();
  await page.getByLabel("Version name").first().fill("New hook");
  await page.getByLabel("New hook content").fill("An independently edited alternative.");
  await page.getByRole("button", { name: "Duplicate as branch" }).first().click();
  await page.getByLabel("Compare").nth(1).check();
  await page.getByLabel("Compare").nth(2).check();
  await page.getByRole("button", { name: "Duplicate as branch" }).first().click();
  await expect(page.getByLabel("Compare").nth(3)).toBeDisabled();
  await expect(page.getByLabel("Original content", { exact: true })).toHaveValue("Original draft that must remain preserved.");
  await page.getByRole("button", { name: "Set audience" }).click();
  await page.getByRole("button", { name: "Generate sample report" }).click();
  await expect(page.getByText("Describe who this is for.")).toBeVisible();
  await page.getByLabel("Audience description").fill("Indie founders");
  await page.getByLabel("Desired outcome").fill("Meaningful discussion");
  await page.getByRole("button", { name: "Generate sample report" }).click();
  await expect(page.getByText("Illustrative sample report.", { exact: true })).toBeVisible();
  await expect(page.getByText("This report is not generated from your content", { exact: false })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Launch message Social Content/ }).click();
  await expect(page.getByLabel("New hook content")).toHaveValue("An independently edited alternative.");
  await expect(page.getByLabel("Original content", { exact: true })).toHaveValue("Original draft that must remain preserved.");
});

test("landing navigation and mobile layout work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Method", exact: true }).first().click();
  await expect(page).toHaveURL(/#method$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.goto("/studio?sample=1");
  await expect(page.getByText("Preserved, read-only")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
