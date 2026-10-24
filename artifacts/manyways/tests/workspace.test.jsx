import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Workspace from "../components/workspace/Workspace";
import RunView from "../components/workspace/RunView";
import { completePaths } from "../lib/api";
import { readTxt } from "../components/workspace/lib";

vi.mock("@clerk/nextjs", () => ({ UserButton: () => <button>Account (test stub)</button> }));
vi.mock("../lib/api", async original => {
  const actual = await original();
  return { ...actual, api: vi.fn(), downloadBranches: vi.fn() };
});
import { api, downloadBranches } from "../lib/api";

const initial = () => ({
  id: "project-1", title: "Two futures", version: 1, updatedAt: new Date().toISOString(),
  nodes: [{ id: "root", parentId: null, kind: "section", title: "Opening", text: "" }],
  goal: { description: "", audience: "", ageMin: null, ageMax: null, gender: "", nationality: "", tone: "" },
});
let project, runs;
beforeEach(() => {
  project = initial(); runs = [];
  api.mockReset();
  downloadBranches.mockReset();
  api.mockImplementation(async (path, options = {}) => {
    const method = options.method || "GET";
    if (path === "/projects" && method === "GET") return [];
    if (path === "/projects" && method === "POST") return structuredClone({ ...project, title: options.body.title });
    if (path === "/projects/project-1" && method === "GET") return structuredClone(project);
    if (path === "/projects/project-1" && method === "PUT") {
      if (options.body.version !== project.version) throw Object.assign(new Error("Conflict"), { status: 409 });
      project = { ...project, ...structuredClone(options.body), version: project.version + 1 };
      return structuredClone(project);
    }
    if (path === "/projects/project-1/runs" && method === "GET") return structuredClone(runs);
    if (path === "/projects/project-1/runs" && method === "POST") {
      const run = { id: "run-1", kind: options.body.kind, status: "queued", progress: 0, total: 24,
        snapshot: { nodes: project.nodes, goal: project.goal }, createdAt: new Date().toISOString(),
        personas: [], evaluations: [], ranking: null, stage: "Waiting for worker" };
      runs.push(run); return structuredClone(run);
    }
    if (path === "/runs/run-1") return structuredClone(runs[0]);
    throw new Error("Unexpected API call in test: " + path);
  });
});
afterEach(cleanup);

async function openManual() {
  const user = userEvent.setup();
  render(<Workspace />);
  await user.click(screen.getByRole("button", { name: /Write by hand/ }));
  await user.type(screen.getByLabelText("Project title"), "Two futures");
  await user.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("tab", { name: "Story tree" });
  return user;
}

test("manual branching saves complete paths, edits every section, then requests a full audience run", async () => {
  const user = await openManual();
  await user.type(screen.getByLabelText("Text", { exact: true }), "A door opens.");
  await user.click(screen.getByRole("button", { name: "Child", exact: true }));
  await user.clear(screen.getByLabelText("Title", { exact: true }));
  await user.type(screen.getByLabelText("Title", { exact: true }), "Enter");
  await user.type(screen.getByLabelText("Text", { exact: true }), "She steps inside.");
  await user.click(screen.getByRole("button", { name: "End story here", exact: true }));
  expect(screen.getByLabelText("Text", { exact: true }).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: /Root Opening/ }));
  await user.click(screen.getByRole("button", { name: "Child", exact: true }));
  await user.clear(screen.getByLabelText("Title", { exact: true }));
  await user.type(screen.getByLabelText("Title", { exact: true }), "Leave");
  await user.type(screen.getByLabelText("Text", { exact: true }), "She walks away.");
  await user.click(screen.getByRole("button", { name: "End story here", exact: true }));
  await user.click(screen.getByRole("tab", { name: "Goal", exact: true }));
  await user.type(screen.getByLabelText(/What should this story achieve/), "Leave a sense of mystery");
  await user.type(screen.getByLabelText("Audience (required)"), "Mystery readers");
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  await screen.findByText("Saved.");
  expect(completePaths(project.nodes).map(p => p.text)).toEqual([
    "A door opens.\n\nShe steps inside.", "A door opens.\n\nShe walks away.",
  ]);
  await user.click(screen.getByRole("tab", { name: /Paths/ }));
  for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
  await user.click(screen.getByRole("button", { name: /Download 2 selected/ }));
  expect(downloadBranches).toHaveBeenCalledWith("project-1", completePaths(project.nodes).map(p => p.id));
  await user.click(screen.getByRole("button", { name: "Run simulation" }));
  await screen.findByText("Waiting for worker");
  const request = api.mock.calls.find(([path, opt]) => path.endsWith("/runs") && opt?.method === "POST");
  expect(request[1].body.personaCount).toBe(12);
  expect(request[1].body.branchIds).toHaveLength(2);
});

test("failed saves preserve edits and show a conflict instead of overwriting", async () => {
  const user = await openManual();
  await user.type(screen.getByLabelText("Text", { exact: true }), "Keep this unsaved sentence.");
  project.version = 2;
  await user.click(screen.getByRole("button", { name: "Save", exact: true }));
  await screen.findByText(/Version conflict/);
  expect(screen.getByLabelText("Text", { exact: true }).value).toBe("Keep this unsaved sentence.");
  expect(project.nodes[0].text).toBe("");
});

test("backend unavailable is explicit and never replaced with a sample project", async () => {
  api.mockRejectedValue(new Error("Story API unavailable"));
  render(<Workspace />);
  await screen.findByText("Story API unavailable");
  expect(screen.queryByText("Illustrative sample report.")).toBe(null);
  expect(screen.getByRole("button", { name: "Retry", exact: true })).toBeTruthy();
});

test("text import rejects invalid formats, control characters and oversized input", async () => {
  const file = (name, text) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
  await expect(readTxt(file("draft.pdf", "Not text"))).rejects.toThrow("Only .txt");
  await expect(readTxt(file("draft.txt", "\0".repeat(30)))).rejects.toThrow("binary");
  await expect(readTxt(file("draft.txt", "short"))).rejects.toThrow("20 characters");
  await expect(readTxt(file("draft.txt", "x".repeat(110000)))).rejects.toThrow("100 KB");
  expect(await readTxt(file("story.txt", "A long enough original story."))).toContain("original story");
});

test("partial reports explain missing ranking and expose persona evidence", async () => {
  const run = {
    kind: "evaluate", status: "partial", progress: 1, total: 20,
    createdAt: new Date().toISOString(), snapshot: { nodes: [{ id: "end", title: "A future" }] },
    personas: [{ id: "p", name: "The skeptic", readingStyle: "Close reading", preferences: ["Mystery"] }],
    evaluations: [{ personaId: "p", branchId: "end", reaction: "I want more stakes.",
      emotionalTrajectory: ["Curious", "Uncertain"], dropOffPoints: ["Ending"],
      comprehension: 8, credibility: 5, memorability: 7, goalFit: 8,
      evidence: [{ quote: "A door opens.", interpretation: "Invites curiosity" }],
      objections: ["Unclear cost"], revisions: ["Add stakes"] }],
  };
  render(<RunView run={run} onCancel={() => {}} onApply={() => {}} onRetry={() => {}} />);
  expect(screen.getByText(/No final ranking was generated/)).toBeTruthy();
  await userEvent.click(screen.getByText("The skeptic", { selector: "b" }));
  expect(screen.getByText("Invites curiosity")).toBeTruthy();
  expect(screen.getByText(/Simulated personas, not real readers/)).toBeTruthy();
});
