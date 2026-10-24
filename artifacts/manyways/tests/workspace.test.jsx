import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Workspace from "../components/workspace/Workspace";
import Editor from "../components/workspace/Editor";
import Results from "../components/workspace/Results";
import { analyze, assemble } from "../components/workspace/tree";
import * as api from "../lib/api";

vi.mock("@clerk/nextjs", () => ({ UserButton: () => <button>Account</button> }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a> }));
vi.mock("../lib/api", () => ({
  listProjects: vi.fn(), createProject: vi.fn(), getProject: vi.fn(), saveProject: vi.fn(),
  deleteProject: vi.fn(), listRuns: vi.fn(), getRun: vi.fn(), startRun: vi.fn(),
  cancelRun: vi.fn(), downloadExport: vi.fn(),
}));

const goal = { outcome: "Resonate", audience: "Adult fiction readers", age_min: 18, age_max: 65, gender: "", nationality: "", tone: "Hopeful", constraints: "None" };
const root = { id: "root", parent_id: null, title: "Opening", text: "Shared opening.", is_end: false };
const ending = { id: "a", parent_id: "root", title: "Ending A", text: "A hopeful ending.", is_end: true };
const project = () => ({ id: "p1", title: "Lighthouse", version: 1, goal: { ...goal }, nodes: [{ ...root }, { ...ending }] });

beforeEach(() => {
  vi.clearAllMocks();
  api.listProjects.mockResolvedValue([]);
  api.getProject.mockResolvedValue(project());
  api.saveProject.mockImplementation(async (p) => ({ ...p, version: p.version + 1 }));
  api.listRuns.mockResolvedValue([]);
  api.createProject.mockImplementation(async (title) => ({ ...project(), title }));
  api.startRun.mockResolvedValue({ id: "r1", kind: "generation", status: "queued", progress: {} });
  api.getRun.mockResolvedValue({ id: "r1", kind: "evaluation", status: "queued", progress: {},
    snapshot: { goal, nodes: [root, ending], branches: [{ id: "a" }] } });
});
afterEach(cleanup);

it.each([
  ["outcome", "Intended outcome", "Leave readers hopeful"],
  ["audience", "Audience", "Readers of short fiction"],
  ["tone", "Tone", "Quiet and hopeful"],
  ["constraints", "Constraints", "No violence"],
])("preserves focus and successive keystrokes when entering %s", async (field, label, text) => {
  const user = userEvent.setup();
  api.getProject.mockResolvedValue({ ...project(), goal: { ...goal, [field]: "" } });
  render(<Editor id="p1" initialTab="goal" notify={vi.fn()} onClose={vi.fn()} />);
  const input = await screen.findByLabelText(label);
  await user.type(input, text[0]);
  expect(document.activeElement).toBe(input);
  await user.keyboard(text.slice(1));
  expect(screen.getByLabelText(label)).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe(text);
  await user.click(screen.getByRole("button", { name: "Save now" }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalled());
  expect(api.saveProject.mock.lastCall[0].goal[field]).toBe(text);
});

it("assembles shared ancestors identically to exports and excludes unfinished paths", () => {
  const nodes = [root, ending, { ...ending, id: "b", is_end: false }];
  expect(assemble(nodes, "a").text).toBe("Shared opening.\n\nA hopeful ending.");
  expect(analyze(nodes).complete).toEqual(["a"]);
  expect(analyze([{ ...root, parent_id: "missing" }]).errors.length).toBeGreaterThan(0);
});

it("creates a project through the manual versus automatic choice", async () => {
  const user = userEvent.setup();
  render(<Workspace />);
  await user.type(screen.getByLabelText("Project title"), "My story");
  await user.click(screen.getByRole("button", { name: /Write manually/ }));
  await user.click(screen.getByRole("button", { name: /Create project/ }));
  await screen.findByLabelText("Section text");
  expect(api.createProject).toHaveBeenCalledWith("My story");
});

it("edits any root, adds children and siblings, and confirms subtree deletion", async () => {
  const user = userEvent.setup();
  render(<Editor id="p1" notify={vi.fn()} onClose={vi.fn()} />);
  const text = await screen.findByLabelText("Section text");
  await user.clear(text);
  await user.type(text, "Edited opening.");
  await user.click(screen.getByRole("button", { name: /Add child/ }));
  await user.type(screen.getByLabelText("Section text"), "A new scene.");
  await user.click(screen.getByRole("button", { name: /Add sibling/ }));
  expect(screen.getAllByRole("treeitem")).toHaveLength(4);
  await user.click(screen.getByRole("button", { name: "Delete", exact: true }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete 1" }));
  expect(screen.getAllByRole("treeitem")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: "Save now" }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalled());
  expect(api.saveProject.mock.lastCall[0].nodes[0].text).toBe("Edited opening.");
});

it("preserves dirty edits when autosave detects a version conflict", async () => {
  const user = userEvent.setup();
  api.saveProject.mockRejectedValue(Object.assign(new Error("Conflict"), { status: 409 }));
  render(<Editor id="p1" notify={vi.fn()} onClose={vi.fn()} />);
  const text = await screen.findByLabelText("Section text");
  await user.clear(text); await user.type(text, "Unsaved local edit");
  await user.click(screen.getByRole("button", { name: "Save now" }));
  await screen.findByText("This project changed elsewhere.");
  expect(screen.getByLabelText("Section text").value).toBe("Unsaved local edit");
  expect(api.getProject).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Reload server version" })).toBeTruthy();
});

it("validates UTF-8 upload and submits automatic generation without replacing the tree", async () => {
  const user = userEvent.setup();
  render(<Editor id="p1" initialTab="generate" notify={vi.fn()} onClose={vi.fn()} />);
  const input = await screen.findByLabelText(/Source file/);
  const invalid = new File(["abc"], "bad.txt", { type: "text/plain" });
  invalid.arrayBuffer = async () => new Uint8Array([0xff, 0xfe]).buffer;
  await user.upload(input, invalid);
  await screen.findByText("The file is not valid UTF-8 text.");
  const valid = new File(["Draft"], "story.txt", { type: "text/plain" });
  valid.arrayBuffer = async () => new TextEncoder().encode("Draft").buffer;
  await user.upload(input, valid);
  await user.click(screen.getByRole("button", { name: "Generate proposal" }));
  await waitFor(() => expect(api.startRun).toHaveBeenCalled());
  expect(api.startRun.mock.lastCall[1]).toMatchObject({ kind: "generation", source_name: "story.txt", source_text: "Draft" });
  expect(api.saveProject).not.toHaveBeenCalled();
});

it("only applies a generated proposal after explicit confirmation", async () => {
  const user = userEvent.setup();
  const nodes = [{ ...root, text: "Generated opening." }, ending];
  api.listRuns.mockResolvedValue([{ id: "r1", kind: "generation", status: "completed", generated_nodes: nodes }]);
  render(<Editor id="p1" initialTab="generate" notify={vi.fn()} onClose={vi.fn()} />);
  await user.click(await screen.findByRole("button", { name: "Review proposal" }));
  expect(api.saveProject).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Replace tree and save" }));
  await waitFor(() => expect(api.saveProject).toHaveBeenCalled());
  expect(api.saveProject.mock.lastCall[0].nodes[0].text).toBe("Generated opening.");
});

it("evaluates selected complete paths using a validated persona count", async () => {
  const user = userEvent.setup();
  render(<Editor id="p1" initialTab="evaluate" notify={vi.fn()} onClose={vi.fn()} />);
  await screen.findByText("Complete paths to evaluate");
  await user.click(screen.getByLabelText(/Ending A/));
  const count = screen.getByLabelText(/Number of personas/);
  await user.clear(count); await user.type(count, "10");
  await user.click(screen.getByRole("button", { name: /Start evaluation/ }));
  await waitFor(() => expect(api.startRun).toHaveBeenCalled());
  expect(api.startRun.mock.lastCall[1]).toMatchObject({ kind: "evaluation", branch_ids: ["a"], persona_count: 10 });
});

it("never presents a partial matrix as a final ranking", () => {
  render(<Results run={{ kind: "evaluation", status: "partial", progress: { total: 10, succeeded: 9, failed: 1 },
    personas: [], evaluations: [], snapshot: { goal, nodes: [root, ending], branches: [{ id: "a" }] },
    rankings: { items: [{ branch_id: "a", rank: 1 }] } }} currentNodes={[root, ending]} />);
  expect(screen.getByText("Not a final ranking.")).toBeTruthy();
  expect(screen.queryByText("Ranking, full matrix")).toBeNull();
});
