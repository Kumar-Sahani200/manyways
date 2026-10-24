// All browser calls are same-origin; Clerk tokens are added only on the server.
export async function api(path, options = {}) {
  const response = await fetch(`/api/backend/v1${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  if (response.status === 401) {
    window.location.assign("/sign-in");
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export const listProjects = () => api("/projects");
export const createProject = (title) => api("/projects", { method: "POST", body: JSON.stringify({ title }) });
export const getProject = (id) => api(`/projects/${id}`);
export const saveProject = (project) => api(`/projects/${project.id}`, {
  method: "PUT", body: JSON.stringify({ title: project.title, nodes: project.nodes, goal: project.goal, version: project.version }),
});
export const deleteProject = (id) => api(`/projects/${id}`, { method: "DELETE" });
export const listRuns = (id) => api(`/projects/${id}/runs`);
export const getRun = (id) => api(`/runs/${id}`);
export const startRun = (id, input) => api(`/projects/${id}/runs`, { method: "POST", body: JSON.stringify(input) });
export const cancelRun = (id) => api(`/runs/${id}/cancel`, { method: "POST" });
export async function downloadExport(id, branchIds, format = "text") {
  const response = await fetch(`/api/backend/v1/projects/${id}/export`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch_ids: branchIds, format }),
  });
  if (response.status === 401) {
    window.location.assign("/sign-in");
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok) throw new Error("Export failed. Check your session and branch selection.");
  const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "manyways-export";
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Contract:
// project: {id,title,version,nodes:[{id,parent_id:null|string,title,text,is_end:boolean}],
// goal:{outcome,audience,age_min,age_max,gender,nationality,tone,constraints}}
// Default goal fields may be empty while drafting. Root can be edited; is_end nodes
// cannot have children. Limits: 40 nodes, depth 8, 12 complete paths, 80,000 total chars.
// startRun input: {kind:"generation"|"evaluation",request_id:crypto.randomUUID(),
// branch_ids:[endNodeId],persona_count:10..15,source_name:"file.txt",source_text:"..."}
// Goal must be complete before either run. Generation requires UTF-8 .txt <=64KiB.
// run: {id,kind,status:"queued"|"running"|"completed"|"partial"|"failed"|"cancelled",
// progress:{total,succeeded,failed},error,personas:[],evaluations:[],
// rankings:null|{items:[{branch_id,rank,rationale,strengths:[],risks:[],suggested_edits:[]}],
// audience_disagreement,uncertainty,suggested_next_edits:[]},
// advisory:{status,run_id?,message},generated_nodes:[],snapshot:{goal,branches,nodes}}
// Persona: {id,name,reading_style,motivations,genre_preferences,attention_pattern,
// skepticism,accessibility_needs,goal_connection}
// Evaluation: {persona_id,branch_id,status:"completed"|"failed",error?,
// reaction,emotional_trajectory:[],attention_points:[],comprehension,
// credibility,memorability,goal_fit,evidence:[{quote,explanation}],objections:[],revisions:[]}
// Scores are integers 1..5, same anchored rubric across every branch.
// Generation produces a proposal only; apply with saveProject after explicit confirmation.
// getRun includes immutable snapshots so old results must never be labelled current.
