/** Same-origin authenticated gateway. Never send provider keys from the browser. */
export async function api(path, options = {}) {
  const response = await fetch(`/api/backend${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(typeof payload.detail === "string" ? payload.detail : "The request failed. Please try again.");
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function downloadBranches(projectId, branchIds) {
  const response = await fetch(`/api/backend/projects/${projectId}/export`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branchIds }),
  });
  if (!response.ok) throw new Error("Download failed. Make sure your selected paths have end nodes.");
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = branchIds.length === 1 ? "manyways-story.txt" : "manyways-stories.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function completePaths(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return nodes.filter(n => n.kind === "end").map(end => {
    let current = end;
    const chain = [];
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.kind === "section") chain.unshift(current);
      current = byId.get(current.parentId);
    }
    return { id: end.id, title: end.title || chain.at(-1)?.title || "Story path", text: chain.map(n => n.text).join("\n\n"), nodes: chain };
  });
}
