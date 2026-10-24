export const LIMITS = { nodes: 60, depth: 12, paths: 12, title: 100, text: 12000, total: 60000 };

export const emptyGoal = { description: "", audience: "", ageMin: null, ageMax: null, gender: "", nationality: "", tone: "" };
export const normGoal = (g) => ({ ...emptyGoal, ...(g || {}), gender: g?.gender || "", nationality: g?.nationality || "", tone: g?.tone || "" });

export function childrenMap(nodes) {
  const m = new Map();
  nodes.forEach((n) => {
    const k = n.parentId ?? "__root";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(n);
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  nodes.filter(n => n.kind === "end").forEach(end => {
    let current = byId.get(end.parentId);
    const seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (!current.text.trim()) errs.push("Complete paths cannot contain empty sections. Write each section before saving an ending.");
      current = byId.get(current.parentId);
    }
  });
  return m;
}
export function depthOf(nodes, id) {
  const by = new Map(nodes.map((n) => [n.id, n]));
  let d = 1, c = by.get(id);
  while (c && c.parentId) { d++; c = by.get(c.parentId); }
  return d;
}
export function subtreeIds(nodes, id) {
  const cm = childrenMap(nodes);
  const out = new Set();
  const walk = (i) => { out.add(i); (cm.get(i) || []).forEach((c) => walk(c.id)); };
  walk(id);
  return out;
}
export const newId = () => "n_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function validateNodes(nodes) {
  const errs = [];
  let total = 0;
  nodes.forEach((n) => {
    total += (n.text || "").length;
    if (!n.title.trim()) errs.push("Every node needs a title.");
    if (n.title.length > LIMITS.title) errs.push(`"${n.title.slice(0, 20)}" title is over ${LIMITS.title} characters.`);
    if ((n.text || "").length > LIMITS.text) errs.push(`"${n.title.slice(0, 20)}" text is over ${LIMITS.text} characters.`);
  });
  if (total > LIMITS.total) errs.push(`Total text is over ${LIMITS.total} characters.`);
  if (nodes.length > LIMITS.nodes) errs.push(`Over ${LIMITS.nodes} nodes.`);
  if (nodes.filter((n) => n.kind === "end").length > LIMITS.paths) errs.push(`Over ${LIMITS.paths} complete paths.`);
  return [...new Set(errs)];
}
export function validateGoal(g, forRun) {
  const e = [];
  if (forRun && !g.description.trim()) e.push("Describe what the story should achieve.");
  if (forRun && !g.audience.trim()) e.push("Name the audience.");
  const { ageMin: a, ageMax: b } = g;
  if (a != null && (a < 0 || a > 120 || !Number.isInteger(a))) e.push("Minimum age must be a whole number from 0 to 120.");
  if (b != null && (b < 0 || b > 120 || !Number.isInteger(b))) e.push("Maximum age must be a whole number from 0 to 120.");
  if (a != null && b != null && a > b) e.push("Minimum age cannot exceed maximum age.");
  return e;
}

export async function readTxt(file) {
  if (!file) throw new Error("Choose a file.");
  if (!/\.txt$/i.test(file.name)) throw new Error("Only .txt files can be imported.");
  if (file.size > 100 * 1024) throw new Error("File is larger than 100 KB.");
  const buf = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { throw new Error("This file is not valid UTF-8 text."); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("This looks like a binary file, not text.");
  if (text.trim().length < 20) throw new Error("The story must contain at least 20 characters.");
  if (text.length > 60000) throw new Error("Text is longer than 60,000 characters.");
  return text;
}

export const fmt = (v) => (v == null ? "n/a" : typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v));
export const isActive = (r) => r && (r.status === "queued" || r.status === "running");
export const when = (s) => { try { return new Date(s).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };
