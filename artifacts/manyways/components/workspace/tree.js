export const LIMITS = { nodes: 40, depth: 8, paths: 12, chars: 80000 };
export const newId = () => crypto.randomUUID();

export function analyze(nodes) {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map();
  nodes.forEach((n) => { if (n.parent_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) || []), n.id]); });
  const chain = (id) => { const out = []; let c = map.get(id); let g = 0; while (c && g++ < 100) { out.unshift(c); c = c.parent_id ? map.get(c.parent_id) : null; } return out; };
  const complete = [], unfinished = [];
  let maxDepth = 0;
  nodes.forEach((n) => {
    const d = chain(n.id).length; if (d > maxDepth) maxDepth = d;
    if (!kids.has(n.id)) (n.is_end ? complete : unfinished).push(n.id);
  });
  const chars = nodes.reduce((s, n) => s + (n.title || "").length + (n.text || "").length, 0);
  const roots = nodes.filter((n) => !n.parent_id).length;
  const errors = [];
  if (nodes.length > LIMITS.nodes) errors.push(`Too many sections: ${nodes.length} of ${LIMITS.nodes}.`);
  if (maxDepth > LIMITS.depth) errors.push(`Tree is ${maxDepth} levels deep; the limit is ${LIMITS.depth}.`);
  if (complete.length > LIMITS.paths) errors.push(`${complete.length} complete paths; the limit is ${LIMITS.paths}.`);
  if (chars > LIMITS.chars) errors.push(`${chars.toLocaleString()} characters; the limit is ${LIMITS.chars.toLocaleString()}.`);
  if (roots !== 1) errors.push("Exactly one root section is required.");
  if (map.size !== nodes.length) errors.push("Section IDs must be unique.");
  if (nodes.some((n) => n.parent_id && !map.has(n.parent_id))) errors.push("Every parent section must exist.");
  if (nodes.some((n) => n.is_end && kids.has(n.id))) errors.push("End sections cannot have children.");
  if (nodes.some((n) => chain(n.id).length >= 100)) errors.push("The tree contains a cycle.");
  if (nodes.some((n) => !n.title?.trim() || n.title.length > 120)) errors.push("Section titles need 1 to 120 characters.");
  if (nodes.some((n) => n.text.length > 20000)) errors.push("Each section supports at most 20,000 characters.");
  return { map, kids, chain, complete, unfinished, maxDepth, chars, errors };
}

export function assemble(nodes, endId) {
  const a = analyze(nodes);
  const parts = a.chain(endId);
  return { ids: parts.map((p) => p.id), nodes: parts, text: parts.map((p) => p.text).filter(Boolean).join("\n\n") };
}

export function flatten(nodes) {
  const a = analyze(nodes);
  const out = [];
  const visited = new Set();
  const walk = (n, depth) => { if (!n || visited.has(n.id)) return; visited.add(n.id); out.push({ node: n, depth }); (a.kids.get(n.id) || []).forEach((k) => walk(a.map.get(k), depth + 1)); };
  nodes.filter((n) => !n.parent_id || !a.map.has(n.parent_id)).forEach((r) => walk(r, 1));
  return out;
}

export function descendants(nodes, id) {
  const a = analyze(nodes);
  const out = []; const walk = (x) => { if (out.includes(x)) return; out.push(x); (a.kids.get(x) || []).forEach(walk); };
  walk(id); return out;
}

export function goalErrors(g = {}) {
  const e = {};
  if (!String(g.outcome || "").trim()) e.outcome = "State the outcome you want readers to reach.";
  if (!String(g.audience || "").trim()) e.audience = "Describe who this is for.";
  const lo = g.age_min, hi = g.age_max;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 13 || hi > 100 || lo > hi) e.age = "Use whole ages from 13 to 100, with minimum no greater than maximum.";
  if (!String(g.tone || "").trim()) e.tone = "Name the tone you are aiming for.";
  if (!String(g.constraints || "").trim()) e.constraints = "List constraints, or write 'none'.";
  return e;
}

export const toList = (r, key) => (Array.isArray(r) ? r : Array.isArray(r?.[key]) ? r[key] : []);
