"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { AlertTriangle, Download, FileText, FilePlus2, PenLine, Pencil, Plus, Save, Trash2, Upload, Sparkles, X } from "lucide-react";
import Logo from "../Logo";
import { api, downloadBranches, completePaths } from "../../lib/api";
import { LIMITS, normGoal, validateNodes, validateGoal, subtreeIds, newId, depthOf, readTxt, isActive, when } from "./lib";
import { useConfirm } from "./Confirm";
import TreeEditor from "./TreeEditor";
import RunView from "./RunView";

const TABS = [["tree", "Story tree"], ["goal", "Goal"], ["paths", "Paths"], ["runs", "Runs"]];
const snap = (p) => JSON.stringify({ t: p.title, n: p.nodes, g: p.goal });

export default function Workspace() {
  const { confirm, dialog } = useConfirm();
  const [list, setList] = useState({ loading: true, error: null, items: [] });
  const [proj, setProj] = useState(null); // saved server copy
  const [draft, setDraft] = useState(null); // editable
  const [loadingProj, setLoadingProj] = useState(false);
  const [tab, setTab] = useState("tree");
  const [selNode, setSelNode] = useState(null);
  const [picked, setPicked] = useState([]);
  const [runs, setRuns] = useState([]);
  const [runsErr, setRunsErr] = useState(null);
  const [runId, setRunId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // {kind, text}
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [personaCount, setPersonaCount] = useState(12);
  const [mode, setMode] = useState(null); // null | import | manual
  const titleRef = useRef(null);
  const draftRef = useRef(null);
  draftRef.current = draft;

  const dirty = !!(proj && draft && snap(proj) !== snap(draft));
  const dirtyRef = useRef(false); dirtyRef.current = dirty;

  const loadList = useCallback(async () => {
    setList((l) => ({ ...l, loading: true, error: null }));
    try { const items = await api("/projects"); setList({ loading: false, error: null, items: Array.isArray(items) ? items : [] }); }
    catch (e) { setList({ loading: false, error: e.message || "Could not reach the server.", items: [] }); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const h = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const setSaved = (p) => {
    const q = { ...p, goal: normGoal(p.goal) };
    setProj(q); setDraft(structuredClone(q));
    setList((l) => ({ ...l, items: l.items.some((i) => i.id === q.id) ? l.items.map((i) => (i.id === q.id ? { ...i, title: q.title, updatedAt: q.updatedAt, version: q.version } : i)) : [q, ...l.items] }));
    return q;
  };

  const guard = async (what) => {
    if (saving) { setMsg({ kind: "error", text: "Wait for the current save to finish before switching projects." }); return false; }
    return !dirtyRef.current || confirm({ title: "Discard unsaved changes?", body: `You have edits that are not saved. ${what}`, ok: "Discard changes", danger: true });
  };

  const open = async (id, opts = {}) => {
    if (proj && proj.id === id && !opts.force) return;
    if (!(await guard("Opening another project will lose them."))) return;
    setLoadingProj(true); setMsg(null); setConflict(false); setMode(null);
    try {
      const p = await api(`/projects/${id}`);
      const q = setSaved(p);
      setSelNode(q.nodes.find((n) => n.parentId == null)?.id || null);
      setPicked([]); setRunId(null); setRuns([]); setRunsErr(null);
      setTab(opts.tab || "tree");
      try { const r = await api(`/projects/${id}/runs`); setRuns(Array.isArray(r) ? r : []); } catch (e) { setRunsErr(e.message); }
      if (opts.focusTitle) setTimeout(() => titleRef.current?.focus(), 50);
    } catch (e) { setMsg({ kind: "error", text: e.message || "Could not open the project." }); }
    finally { setLoadingProj(false); }
  };

  const close = async () => {
    if (!(await guard("Leaving will lose them."))) return;
    setProj(null); setDraft(null); setRuns([]); setRunId(null); setMsg(null); setConflict(false);
  };

  const errs = useMemo(() => (draft ? [...validateNodes(draft.nodes), ...(!draft.title.trim() ? ["Project title is required."] : draft.title.length > 100 ? ["Project title is over 100 characters."] : []), ...validateGoal(draft.goal, false)] : []), [draft]);

  const save = async () => {
    if (!draft || saving || errs.length) return null;
    setSaving(true); setMsg(null);
    const submitted = structuredClone(draft);
    try {
      const p = await api(`/projects/${draft.id}`, { method: "PUT", body: { title: draft.title.trim(), nodes: draft.nodes, goal: draft.goal, version: proj.version } });
      const newerEdits = draftRef.current?.id === submitted.id && snap(draftRef.current) !== snap(submitted)
        ? structuredClone(draftRef.current) : null;
      setSaved(p);
      if (newerEdits) setDraft({ ...newerEdits, version: p.version });
      setMsg({ kind: "ok", text: newerEdits ? "Earlier changes saved. Your latest edits are still unsaved." : "Saved." }); setConflict(false);
      return p;
    } catch (e) {
      if (e.status === 409) setConflict(true);
      setMsg({ kind: "error", text: e.status === 409 ? "This project changed elsewhere. Your edits were not saved over the newer version." : e.message });
      return null;
    } finally { setSaving(false); }
  };
  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (dirtyRef.current) document.getElementById("wk-save")?.click(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const reloadLatest = async () => {
    if (!(await confirm({ title: "Replace your edits with the latest version?", body: "Your unsaved edits will be discarded.", ok: "Load latest", danger: true }))) return;
    const id = proj.id; dirtyRef.current = false; await open(id, { force: true });
  };

  const create = async (title, goal) => {
    setBusy(true); setMsg(null);
    try {
      let p = await api("/projects", { method: "POST", body: { title } });
      if (goal) p = await api(`/projects/${p.id}`, { method: "PUT", body: { title: p.title, nodes: p.nodes, goal, version: p.version } });
      return p;
    } catch (e) { setMsg({ kind: "error", text: e.message }); return null; }
    finally { setBusy(false); }
  };
  const startManual = async (title) => {
    if (!(await guard("Creating a project will lose them."))) return;
    dirtyRef.current = false;
    const p = await create(title);
    if (p) { await open(p.id, { force: true, focusTitle: false }); }
  };
  const startImport = async (title, text, goal) => {
    if (!(await guard("Importing will lose them."))) return;
    dirtyRef.current = false;
    const p = await create(title, goal);
    if (!p) return;
    try {
      const run = await api(`/projects/${p.id}/runs`, { method: "POST", body: { kind: "generate", sourceText: text, personaCount: 12, expectedVersion: p.version } });
      await open(p.id, { force: true, tab: "runs" });
      setRuns((r) => [run, ...r.filter((x) => x.id !== run.id)]); setRunId(run.id);
    } catch (e) { await open(p.id, { force: true }); setMsg({ kind: "error", text: "The project was created, but generation could not start: " + e.message }); }
  };

  const remove = async (item) => {
    if (!(await confirm({ title: `Delete "${item.title}"?`, body: "The project and its runs are removed permanently.", ok: "Delete project", cancel: "Keep it", danger: true }))) return;
    try {
      await api(`/projects/${item.id}`, { method: "DELETE" });
      setList((l) => ({ ...l, items: l.items.filter((i) => i.id !== item.id) }));
      if (proj?.id === item.id) { dirtyRef.current = false; setProj(null); setDraft(null); }
    } catch (e) { setMsg({ kind: "error", text: e.message }); }
  };

  // tree editing
  const upd = (fn) => setDraft((d) => ({ ...d, nodes: fn(d.nodes) }));
  const addNode = (parentId, kind) => {
    const id = newId();
    upd((ns) => [...ns, { id, parentId, title: kind === "end" ? "The end" : "New section", text: "", kind }]);
    setSelNode(id);
  };
  const addSibling = (id) => { const n = draft.nodes.find((x) => x.id === id); if (n?.parentId) addNode(n.parentId, "section"); };
  const delNode = async (id) => {
    const ids = subtreeIds(draft.nodes, id);
    const n = draft.nodes.find((x) => x.id === id);
    if (!(await confirm({ title: `Delete "${n.title}"?`, body: ids.size > 1 ? `This also removes ${ids.size - 1} node${ids.size > 2 ? "s" : ""} below it. You can discard by not saving.` : "This node will be removed.", ok: "Delete", cancel: "Keep", danger: true }))) return;
    upd((ns) => ns.filter((x) => !ids.has(x.id)));
    setPicked((p) => p.filter((x) => !ids.has(x)));
    setSelNode(n.parentId);
  };
  const patchNode = (id, patch) => upd((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const addDisabled = (parentId) => draft.nodes.length >= LIMITS.nodes || depthOf(draft.nodes, parentId) >= LIMITS.depth;

  // runs
  const activeKey = runs.filter(isActive).map((r) => r.id).join(",");
  useEffect(() => {
    if (!activeKey) return;
    const ids = activeKey.split(",");
    let alive = true;
    let t;
    const poll = async () => {
      for (const id of ids) {
        if (!alive) return;
        try { const r = await api(`/runs/${id}`); if (alive) { setRuns((rs) => rs.map((x) => (x.id === id ? r : x))); setRunsErr(null); } }
        catch (e) { if (alive) setRunsErr("Lost contact while checking run status: " + e.message); }
      }
      if (alive) t = setTimeout(poll, 2000);
    };
    t = setTimeout(poll, 2000);
    return () => { alive = false; clearTimeout(t); };
  }, [activeKey]);

  const pushRun = (run) => { setRuns((r) => [run, ...r.filter((x) => x.id !== run.id)]); setRunId(run.id); setTab("runs"); };
  useEffect(() => {
    if (!runId || !proj) return;
    let alive = true;
    api(`/runs/${runId}`).then(r => {
      if (alive) { setRuns(rs => rs.map(x => x.id === r.id ? r : x)); setRunsErr(null); }
    }).catch(e => { if (alive) setRunsErr("Could not load this run: " + e.message); });
    return () => { alive = false; };
  }, [runId, proj?.id]);
  const startEvaluate = async () => {
    setBusy(true); setMsg(null);
    try { pushRun(await api(`/projects/${proj.id}/runs`, { method: "POST", body: { kind: "evaluate", personaCount, branchIds: picked, expectedVersion: proj.version } })); }
    catch (e) { setMsg({ kind: "error", text: e.status === 409 ? "The project version changed. Reload and try again." : e.message }); }
    finally { setBusy(false); }
  };
  const cancelRun = async (r) => {
    setBusy(true);
    try { const x = await api(`/runs/${r.id}/cancel`, { method: "POST" }); setRuns((rs) => rs.map((y) => (y.id === x.id ? x : y))); }
    catch (e) { setMsg({ kind: "error", text: e.message }); } finally { setBusy(false); }
  };
  const applyRun = async (r) => {
    if (!(await confirm({ title: "Apply generated draft?", body: dirty ? "This replaces the story tree and discards your unsaved edits." : "This replaces the current story tree with the generated draft.", ok: "Apply draft", cancel: "Not yet", danger: true }))) return;
    setBusy(true);
    try { const p = await api(`/runs/${r.id}/apply`, { method: "POST" }); const q = setSaved(p); setSelNode(q.nodes.find((n) => n.parentId == null)?.id); setPicked([]); setTab("tree"); setMsg({ kind: "ok", text: "Draft applied and saved." }); }
    catch (e) { setMsg({ kind: "error", text: e.status === 409 ? "Cannot apply: the project changed after this run began. Reload and run again." : e.message }); }
    finally { setBusy(false); }
  };
  const retry = (r) => {
    if (dirty) { setMsg({ kind: "error", text: "Save your changes before starting another run." }); return; }
    if (r.kind === "generate" && r.sourceText && proj) {
      setBusy(true);
      api(`/projects/${proj.id}/runs`, { method: "POST", body: { kind: "generate", sourceText: r.sourceText, personaCount: 12, expectedVersion: proj.version } })
        .then(pushRun).catch((e) => setMsg({ kind: "error", text: e.message })).finally(() => setBusy(false));
    } else if (r.kind === "evaluate") setTab("paths");
    else setMsg({ kind: "error", text: "Import the source file to start a new generation." });
  };

  const paths = useMemo(() => (draft ? completePaths(draft.nodes) : []), [draft]);
  const savedPaths = useMemo(() => (proj ? completePaths(proj.nodes) : []), [proj]);
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const doExport = async (ids) => {
    if (dirty) { setMsg({ kind: "error", text: "Save your changes first. Downloads use the saved version." }); return; }
    setBusy(true); setMsg(null);
    try { await downloadBranches(proj.id, ids); } catch (e) { setMsg({ kind: "error", text: e.message }); } finally { setBusy(false); }
  };
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(proj, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `${proj.title.replace(/[^\w-]+/g, "-") || "project"}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const tabKey = (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n == null) return;
    const k = TABS[(n + TABS.length) % TABS.length][0]; setTab(k);
    setTimeout(() => document.getElementById("wk-tab-" + k)?.focus(), 0);
  };

  const run = runs.find((r) => r.id === runId);
  const outdated = (r) => !!proj && (r.projectVersion !== undefined ? r.projectVersion !== proj.version : !!r.snapshot && (JSON.stringify(r.snapshot.nodes) !== JSON.stringify(proj.nodes) || JSON.stringify(normGoal(r.snapshot.goal)) !== JSON.stringify(proj.goal)));
  const sel = draft?.nodes.find((n) => n.id === selNode);
  const goalReady = draft && validateGoal(draft.goal, true).length === 0;
  const evalWhy = !proj ? "" : dirty ? "Save your changes first." : !goalReady ? "Add a goal with a description and audience." : picked.length < 2 ? "Select at least 2 complete paths." : picked.length > 12 ? "Select at most 12 paths." : "";

  return (
    <div className="wk">
      <a className="wk-skip" href="#wk-main">Skip to workspace</a>
      <header className="wk-top">
        <div className="wk-logo"><Logo /> <b>ManyWays</b><span className="wk-mono">Workspace</span></div>
        <UserButton />
      </header>
      <div className="wk-body">
        <aside className="wk-side" aria-label="Projects">
          <div className="wk-row sp"><span className="wk-lbl">Projects</span><button className="wk-btn sm" onClick={async () => { if (await guard("Starting a new project will lose them.")) { dirtyRef.current = false; setProj(null); setDraft(null); setMode("choose"); } }}><Plus size={14} /> New</button></div>
          {list.loading && <div className="wk-stack">{[0, 1, 2].map((i) => <div key={i} className="wk-skel" style={{ height: 54 }} />)}</div>}
          {list.error && <div className="wk-banner" role="alert"><AlertTriangle size={16} /><span>{list.error}</span><button className="wk-btn sm ghost" onClick={loadList}>Retry</button></div>}
          {!list.loading && !list.error && list.items.length === 0 && <p className="wk-dim">No saved projects yet. Begin one on the right.</p>}
          <ul className="wk-plist">
            {list.items.map((it) => (
              <li key={it.id} className={proj?.id === it.id ? "on" : ""}>
                <button className="wk-open" onClick={() => open(it.id)} aria-current={proj?.id === it.id ? "true" : undefined}><b>{it.title}</b><small>{it.updatedAt ? "Edited " + when(it.updatedAt) : ""}</small></button>
                <button className="wk-ic" aria-label={`Rename ${it.title}`} title="Rename" onClick={() => open(it.id, { force: true, focusTitle: true })}><Pencil size={14} /></button>
                <button className="wk-ic del" aria-label={`Delete ${it.title}`} title="Delete" onClick={() => remove(it)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </aside>

        <main id="wk-main" className="wk-main" tabIndex={-1}>
          {msg && <div className={"wk-banner " + msg.kind} role={msg.kind === "error" ? "alert" : "status"}><span>{msg.text}</span><button className="wk-ic" aria-label="Dismiss" onClick={() => setMsg(null)}><X size={14} /></button></div>}
          {loadingProj && <div className="wk-stack"><div className="wk-skel" style={{ height: 70 }} /><div className="wk-skel" style={{ height: 320 }} /></div>}
          {!loadingProj && !draft && <Start mode={mode} setMode={setMode} busy={busy} onManual={startManual} onImport={startImport} />}
          {!loadingProj && draft && (
            <div className="wk-rise">
              <div className="wk-head">
                <div className="wk-grow">
                  <label className="wk-sr" htmlFor="wk-title">Project title</label>
                  <input id="wk-title" ref={titleRef} className="wk-title" value={draft.title} maxLength={100} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  <div className="wk-dim wk-row">
                    <span className={"wk-dirty" + (dirty ? " on" : "")}><i /> {dirty ? "Unsaved changes" : "All changes saved"}</span>
                    <span>v{proj.version}</span><span>{proj.updatedAt && "Edited " + when(proj.updatedAt)}</span>
                  </div>
                </div>
                <div className="wk-row">
                  <button className="wk-btn ghost sm" onClick={exportJson}><FileText size={14} /> JSON</button>
                  <button className="wk-btn ghost sm" onClick={close}>Close</button>
                  <button id="wk-save" className="wk-btn" disabled={!dirty || saving || errs.length > 0} onClick={save}><Save size={15} /> {saving ? "Saving..." : "Save"}</button>
                </div>
              </div>
              {conflict && <div className="wk-banner" role="alert"><span>Version conflict. Your draft is kept on screen. Copy anything you need, then load the latest.</span><button className="wk-btn sm" onClick={reloadLatest}>Load latest</button></div>}
              {errs.length > 0 && <ul className="wk-errs" role="status">{errs.slice(0, 4).map((e) => <li key={e}>{e}</li>)}</ul>}

              <div className="wk-tabs" role="tablist" aria-label="Project sections" onKeyDown={tabKey}>
                {TABS.map(([k, l]) => (
                  <button key={k} id={"wk-tab-" + k} role="tab" aria-selected={tab === k} aria-controls="wk-panel" tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{l}{k === "paths" && paths.length ? <small>{paths.length}</small> : null}{k === "runs" && runs.some(isActive) ? <small className="live">live</small> : null}</button>
                ))}
              </div>

              <div id="wk-panel" role="tabpanel" aria-labelledby={"wk-tab-" + tab} className="wk-pane">
                {tab === "tree" && (
                  <div className="wk-split">
                    <div className="wk-panel">
                      <TreeEditor nodes={draft.nodes} selectedId={selNode} onSelect={setSelNode} onAddChild={(id) => addNode(id, "section")} onAddEnd={(id) => addNode(id, "end")} onAddSibling={addSibling} onDelete={delNode} />
                    </div>
                    <div className="wk-panel wk-editor">
                      {sel ? (
                        <>
                          <span className="wk-lbl">{sel.kind === "end" ? "Ending" : sel.parentId == null ? "Root section" : "Section"}</span>
                          <div className="wk-field"><label htmlFor="nt">Title</label>
                            <input id="nt" className="wk-in" value={sel.title} onChange={(e) => patchNode(sel.id, { title: e.target.value })} aria-invalid={!sel.title.trim() || sel.title.length > 100} />
                            <small className={sel.title.length > 100 ? "wk-err" : "wk-dim"}>{sel.title.length}/100</small></div>
                          <div className="wk-field"><label htmlFor="nx">Text</label>
                            <textarea id="nx" className="wk-ta" value={sel.text} disabled={sel.kind === "end"} placeholder={sel.kind === "end" ? "This end node completes the path above. Edit its story sections to change the text." : "Write this section…"} onChange={(e) => patchNode(sel.id, { text: e.target.value })} />
                            <small className={sel.text.length > 12000 ? "wk-err" : "wk-dim"}>{sel.text.length.toLocaleString()}/12,000 - total {draft.nodes.reduce((a, n) => a + n.text.length, 0).toLocaleString()}/60,000</small></div>
                          {sel.kind === "section" && (
                            <div className="wk-row">
                              <button className="wk-btn ghost sm" disabled={addDisabled(sel.id)} onClick={() => addNode(sel.id, "section")}><Plus size={14} /> Child</button>
                              <button className="wk-btn ghost sm" disabled={addDisabled(sel.id) || paths.length >= LIMITS.paths} onClick={() => addNode(sel.id, "end")}>End story here</button>
                            </div>
                          )}
                        </>
                      ) : <p className="wk-dim">Select a node in the tree to edit it.</p>}
                    </div>
                  </div>
                )}
                {tab === "goal" && <GoalForm goal={draft.goal} onChange={(g) => setDraft({ ...draft, goal: g })} />}
                {tab === "paths" && (
                  <div className="wk-panel">
                    <div className="wk-row sp"><div><h3 className="wk-h3">Complete paths</h3><p className="wk-dim">Root to ending. Select paths to download or to simulate readers.</p></div>
                      <span className="wk-count" aria-live="polite">{picked.length} selected</span></div>
                    {paths.length === 0 ? <div className="wk-empty"><b>No complete paths yet</b><p>End a branch from the story tree to create one.</p></div> : (
                      <ul className="wk-paths">
                        {paths.map((p) => (
                          <li key={p.id}><label><input type="checkbox" checked={picked.includes(p.id)} onChange={() => togglePick(p.id)} /><span><b>{p.title}</b><small>{p.nodes.map((n) => n.title).join("  >  ")}</small></span></label>
                            <button className="wk-ic" aria-label={`Download ${p.title}`} disabled={busy || dirty} onClick={() => doExport([p.id])}><Download size={15} /></button></li>
                        ))}
                      </ul>
                    )}
                    <div className="wk-row">
                      <button className="wk-btn ghost sm" onClick={() => setPicked(paths.map((p) => p.id))}>Select all</button>
                      <button className="wk-btn ghost sm" onClick={() => setPicked([])} disabled={!picked.length}>Clear</button>
                      <button className="wk-btn sm" disabled={busy || dirty || picked.length === 0 || picked.some((id) => !savedPaths.find((p) => p.id === id))} onClick={() => doExport(picked)}><Download size={14} /> Download {picked.length || ""} selected</button>
                      <button className="wk-btn ghost sm" disabled={busy || dirty || savedPaths.length === 0} onClick={() => doExport(savedPaths.map((p) => p.id))}>Download all {savedPaths.length}</button>
                    </div>
                    <hr />
                    <h3 className="wk-h3">Simulate readers</h3>
                    <p className="wk-dim">Invented personas read your selected paths and disagree. This is a simulation, not a forecast of real readers. Each run uses paid model calls.</p>
                    <div className="wk-field narrow"><label htmlFor="pc">Personas (10 to 15)</label>
                      <input id="pc" type="number" min={10} max={15} className="wk-in" value={personaCount} onChange={(e) => setPersonaCount(Math.max(10, Math.min(15, Number(e.target.value) || 10)))} /></div>
                    <div className="wk-row"><button className="wk-btn" disabled={busy || !!evalWhy} onClick={startEvaluate}><Sparkles size={15} /> Run simulation</button>{evalWhy && <small className="wk-dim">{evalWhy}</small>}</div>
                  </div>
                )}
                {tab === "runs" && (
                  <div className="wk-split runs">
                    <div className="wk-panel">
                      <span className="wk-lbl">History</span>
                      {runsErr && <div className="wk-banner" role="alert">{runsErr}</div>}
                      {runs.length === 0 ? <div className="wk-empty"><b>No runs yet</b><p>Simulate readers from the Paths tab, or import a .txt to generate a draft.</p></div> : (
                        <ul className="wk-runs">{runs.map((r) => (
                          <li key={r.id}><button className={r.id === runId ? "on" : ""} onClick={() => setRunId(r.id)} aria-current={r.id === runId ? "true" : undefined}><b>{r.kind === "generate" ? "Generate draft" : "Simulate readers"}</b><span className={"wk-status " + r.status}>{r.status}</span><small>{when(r.createdAt)}{outdated(r) ? " - outdated" : ""}</small></button></li>
                        ))}</ul>
                      )}
                    </div>
                    <div>{run ? <RunView run={run} outdated={outdated(run)} dirty={dirty} busy={busy || saving} onCancel={() => cancelRun(run)} onApply={() => applyRun(run)} onRetry={() => retry(run)} /> : <div className="wk-empty"><b>Select a run</b><p>Results appear here.</p></div>}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      {dialog}
    </div>
  );
}

function Start({ mode, setMode, busy, onManual, onImport }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState(null);
  const [goal, setGoal] = useState(normGoal());
  const pick = async (f) => {
    setErr(null); setText(""); setFile(null);
    if (!f) return;
    try { const t = await readTxt(f); setText(t); setFile(f); if (!title) setTitle(f.name.replace(/\.txt$/i, "").slice(0, 100)); } catch (e) { setErr(e.message); }
  };
  const gerr = validateGoal(goal, true);
  return (
    <div className="wk-rise">
      <p className="wk-mono">A quiet laboratory for alternate stories</p>
      <h1 className="wk-h1">Where does your story <em>fork</em>?</h1>
      <div className="wk-choice" role="group" aria-label="How to begin">
        <button aria-pressed={mode === "manual"} onClick={() => setMode("manual")}><PenLine size={20} /><b>Write by hand</b><span>Start with one root section and branch it yourself.</span></button>
        <button aria-pressed={mode === "import"} onClick={() => setMode("import")}><Upload size={20} /><b>Import a .txt</b><span>Give us a draft and a goal. We propose a branching tree you can apply or ignore.</span></button>
      </div>
      {mode === "manual" && (
        <form className="wk-panel" onSubmit={(e) => { e.preventDefault(); title.trim() && onManual(title.trim()); }}>
          <div className="wk-field"><label htmlFor="mt">Project title</label><input id="mt" autoFocus className="wk-in" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><button className="wk-btn" disabled={busy || !title.trim()}><FilePlus2 size={15} /> {busy ? "Creating..." : "Create project"}</button></div>
        </form>
      )}
      {mode === "import" && (
        <form className="wk-panel" onSubmit={(e) => { e.preventDefault(); if (text && !gerr.length && title.trim()) onImport(title.trim(), text, goal); }}>
          <div className="wk-field"><label htmlFor="it">Project title</label><input id="it" className="wk-in" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="wk-field"><label htmlFor="if">Text file (.txt, UTF-8, up to 100 KB)</label><input id="if" type="file" accept=".txt,text/plain" className="wk-in" onChange={(e) => pick(e.target.files?.[0])} />
            {file && <small className="wk-dim">{file.name} - {text.length.toLocaleString()} characters</small>}
            {err && <small className="wk-err" role="alert">{err}</small>}</div>
          <GoalFields goal={goal} onChange={setGoal} />
          <p className="wk-dim">Generation makes paid model calls. Your goal is saved to the project first.</p>
          {gerr.length > 0 && file && <small className="wk-err">{gerr[0]}</small>}
          <div><button className="wk-btn" disabled={busy || !text || gerr.length > 0 || !title.trim()}><Sparkles size={15} /> {busy ? "Starting..." : "Create and generate"}</button></div>
        </form>
      )}
    </div>
  );
}

function GoalFields({ goal, onChange }) {
  const set = (k, v) => onChange({ ...goal, [k]: v });
  const num = (k, v) => set(k, v === "" ? null : Number(v));
  return (
    <div className="wk-stack">
      <div className="wk-field"><label htmlFor="g1">What should this story achieve? (required)</label><textarea id="g1" className="wk-ta short" value={goal.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div className="wk-field"><label htmlFor="g2">Audience (required)</label><input id="g2" className="wk-in" value={goal.audience} onChange={(e) => set("audience", e.target.value)} /></div>
      <div className="wk-grid">
        <div className="wk-field"><label htmlFor="g3">Min age</label><input id="g3" type="number" min={0} max={120} className="wk-in" value={goal.ageMin ?? ""} onChange={(e) => num("ageMin", e.target.value)} /></div>
        <div className="wk-field"><label htmlFor="g4">Max age</label><input id="g4" type="number" min={0} max={120} className="wk-in" value={goal.ageMax ?? ""} onChange={(e) => num("ageMax", e.target.value)} /></div>
        <div className="wk-field"><label htmlFor="g5">Gender (optional)</label><input id="g5" className="wk-in" value={goal.gender} onChange={(e) => set("gender", e.target.value)} /></div>
        <div className="wk-field"><label htmlFor="g6">Nationality (optional)</label><input id="g6" className="wk-in" value={goal.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
        <div className="wk-field"><label htmlFor="g7">Tone (optional)</label><input id="g7" className="wk-in" value={goal.tone} onChange={(e) => set("tone", e.target.value)} /></div>
      </div>
    </div>
  );
}

function GoalForm({ goal, onChange }) {
  const e = validateGoal(goal, true);
  return (
    <div className="wk-panel">
      <h3 className="wk-h3">Goal and audience</h3>
      <p className="wk-dim">Saved with the project. Required before running a simulation.</p>
      <GoalFields goal={goal} onChange={onChange} />
      {e.length > 0 && <ul className="wk-errs">{e.map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}
