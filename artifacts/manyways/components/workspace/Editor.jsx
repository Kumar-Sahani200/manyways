"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, CornerDownRight, Trash2, Flag, AlertTriangle, RefreshCw, Download, Play, Square, Check, FileUp, Loader2 } from "lucide-react";
import { getProject, saveProject, listRuns, getRun, startRun, cancelRun, downloadExport } from "../../lib/api";
import { analyze, assemble, flatten, descendants, goalErrors, newId, toList, LIMITS } from "./tree";
import { Modal, Skeleton, Rubric, STATUS_LABEL, isActive } from "./ui";
import Results from "./Results";

const TABS = [["write", "Write"], ["goal", "Goal"], ["generate", "Generate"], ["evaluate", "Evaluate"], ["export", "Export"]];
const SAVE_LABEL = { saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving...", error: "Save failed", conflict: "Version conflict", invalid: "Not saved: fix validation" };

export default function Editor({ id, initialTab, notify, onClose }) {
  const [draft, setDraft] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [status, setStatus] = useState("saved");
  const [saveErr, setSaveErr] = useState("");
  const [tab, setTab] = useState(initialTab || "write");
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [runs, setRuns] = useState(null);
  const [runsErr, setRunsErr] = useState(null);
  const [pollErr, setPollErr] = useState(false);
  const [openRun, setOpenRun] = useState(null);

  const draftRef = useRef(null), versionRef = useRef(0), revRef = useRef(0), savedRev = useRef(0);
  const savingRef = useRef(false), conflictRef = useRef(false), timer = useRef(), focusTitle = useRef(false);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const p = await getProject(id);
      const d = { title: p.title, nodes: p.nodes || [], goal: p.goal || {} };
      draftRef.current = d; versionRef.current = p.version; revRef.current = 0; savedRev.current = 0; conflictRef.current = false;
      setDraft(d); setStatus("saved"); setSaveErr(""); setSel((s) => (d.nodes.some((n) => n.id === s) ? s : d.nodes[0]?.id || null));
    } catch (e) { setLoadErr(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadRuns = useCallback(async () => {
    setRunsErr(null);
    try { setRuns(toList(await listRuns(id), "runs")); } catch (e) { setRunsErr(e.message); }
  }, [id]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (savingRef.current || conflictRef.current || !draftRef.current || revRef.current === savedRev.current) return;
    if (analyze(draftRef.current.nodes).errors.length) { setStatus("invalid"); return; }
    savingRef.current = true; setStatus("saving");
    const sent = draftRef.current, sentRev = revRef.current;
    try {
      const res = await saveProject({ id, title: sent.title, nodes: sent.nodes, goal: sent.goal, version: versionRef.current });
      versionRef.current = res.version; savedRev.current = sentRev; setSaveErr("");
      if (revRef.current === sentRev) setStatus("saved");
      else { setStatus("dirty"); timer.current = setTimeout(flush, 300); }
      return revRef.current === sentRev;
    } catch (e) {
      if (e.status === 409) { conflictRef.current = true; setStatus("conflict"); }
      else { setStatus("error"); setSaveErr(e.message); }
    } finally { savingRef.current = false; }
  }, [id]);

  const edit = useCallback((fn) => {
    const next = fn(draftRef.current);
    draftRef.current = next; revRef.current += 1; setDraft(next);
    if (!conflictRef.current) { setStatus("dirty"); clearTimeout(timer.current); timer.current = setTimeout(flush, 1200); }
  }, [flush]);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const h = (e) => { if (status !== "saved") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [status]);

  // job polling
  const activeKey = (runs || []).filter(isActive).map((r) => r.id).join(",");
  useEffect(() => {
    if (!activeKey) { setPollErr(false); return; }
    const ids = activeKey.split(",");
    const t = setInterval(async () => {
      try {
        const upd = await Promise.all(ids.map(getRun));
        setRuns((prev) => prev.map((r) => upd.find((u) => u.id === r.id) || r)); setPollErr(false);
      } catch { setPollErr(true); }
    }, 2000);
    return () => clearInterval(t);
  }, [activeKey]);

  useEffect(() => {
    if (!openRun) return;
    const r = (runs || []).find((x) => x.id === openRun);
    if (r && r.snapshot) return;
    getRun(openRun).then((full) => setRuns((p) => p.map((x) => (x.id === full.id ? full : x)))).catch((e) => notify(e.message));
  }, [openRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async () => {
    await flush();
    if (statusRef.current === "saved" || window.confirm("Some changes are not saved. Leave anyway and lose them?")) onClose();
  };
  const statusRef = useRef(status); statusRef.current = status;

  const info = useMemo(() => (draft ? analyze(draft.nodes) : null), [draft]);
  const gErr = useMemo(() => (draft ? goalErrors(draft.goal) : {}), [draft]);

  if (loadErr) return <main className="wrap ws-list"><div className="empty"><AlertTriangle /><b>This project could not be opened</b><span className="ws-muted">{loadErr}</span><div className="row"><button className="btn ghost" onClick={onClose}>Back to projects</button><button className="btn" onClick={load}><RefreshCw size={14} /> Try again</button></div></div></main>;
  if (!draft) return <main className="wrap ws-list"><Skeleton rows={4} h={80} /></main>;

  const goal = draft.goal;
  const setGoal = (k, v) => edit((d) => ({ ...d, goal: { ...d.goal, [k]: v } }));
  const saved = status === "saved";
  const ctx = { id, draft, edit, info, goal, gErr, saved, notify, runs, setRuns, loadRuns, runsErr, setOpenRun, openRun, pollErr, flush };

  const confirmReload = async () => {
    setModal(null); await load(); notify("Loaded the latest saved version from the server.");
  };
  const downloadLocal = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draftRef.current, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "local-draft.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="wrap ws-ed">
      <div className="ws-edhead">
        <button className="btn ghost sm" onClick={leave}><ArrowLeft size={14} /> Projects</button>
        <div className="field" style={{ flex: 1, minWidth: 200 }}><label className="sr" htmlFor="ptitle">Project title</label>
          <input id="ptitle" className="in ws-title" value={draft.title} maxLength={120} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} /></div>
        <div className={`ws-save s-${status}`} role="status" aria-live="polite">
          {status === "saving" ? <Loader2 size={14} className="spin" /> : status === "saved" ? <Check size={14} /> : <AlertTriangle size={14} />} {SAVE_LABEL[status]}
          {(status === "dirty" || status === "error" || status === "invalid") && <button className="linkbtn" onClick={flush}>Save now</button>}
        </div>
      </div>
      {status === "conflict" && (
        <div className="banner" role="alert"><span><b>This project changed elsewhere.</b> Your local edits are kept but not saved, and autosave is paused so nothing is overwritten. Reload the server version to continue.</span>
          <span className="row"><button className="btn ghost sm" onClick={downloadLocal}><Download size={13} /> Keep a copy</button><button className="btn sm" onClick={() => setModal({ type: "reload" })}>Reload server version</button></span></div>
      )}
      {status === "error" && <div className="banner" role="alert"><span>Could not save: {saveErr}</span><button className="btn ghost sm" onClick={flush}><RefreshCw size={13} /> Retry</button></div>}
      {status === "invalid" && <div className="banner" role="alert"><span>Autosave is paused until the tree is within limits: {info.errors.join(" ")}</span></div>}
      <div className="ws-tabs" role="tablist" aria-label="Project sections">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="tabpanel" tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
            onKeyDown={(e) => { const i = TABS.findIndex(([x]) => x === tab); if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0]; setTab(n); setTimeout(() => document.getElementById(`tab-${n}`)?.focus(), 0); } }}>{l}</button>
        ))}
      </div>
      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="ws-panel" key={tab}>
        {tab === "write" && <WriteTab {...ctx} sel={sel} setSel={setSel} setModal={setModal} focusTitle={focusTitle} />}
        {tab === "goal" && <GoalTab {...ctx} setGoal={setGoal} />}
        {tab === "generate" && <GenerateTab {...ctx} setModal={setModal} setTab={setTab} />}
        {tab === "evaluate" && <EvaluateTab {...ctx} />}
        {tab === "export" && <ExportTab {...ctx} />}
      </div>
      {modal?.type === "reload" && (
        <Modal danger title="Reload the server version?" onClose={() => setModal(null)} actions={<><button data-autofocus className="btn ghost sm" onClick={() => setModal(null)}>Keep my edits</button><button className="btn sm danger" onClick={confirmReload}>Discard local, reload</button></>}>
          <p>Your unsaved local edits will be replaced by the version stored on the server. Download a copy first if you want to keep them.</p></Modal>
      )}
      {modal?.type === "delete" && (
        <Modal danger title="Delete section and everything beneath it?" onClose={() => setModal(null)} actions={<><button data-autofocus className="btn ghost sm" onClick={() => setModal(null)}>Cancel</button>
          <button className="btn sm danger" onClick={() => { const ids = new Set(modal.ids); edit((d) => ({ ...d, nodes: d.nodes.filter((n) => !ids.has(n.id)) })); setSel(modal.fallback); setModal(null); notify(`Deleted ${ids.size} section${ids.size > 1 ? "s" : ""}.`); }}>Delete {modal.ids.length}</button></>}>
          <p>&ldquo;{modal.title}&rdquo; and {modal.ids.length - 1} section{modal.ids.length === 2 ? "" : "s"} beneath it will be removed. Complete paths that pass through it will disappear.</p></Modal>
      )}
      {modal?.type === "apply" && (
        <Modal title="Apply generated proposal?" onClose={() => setModal(null)} actions={<><button data-autofocus className="btn ghost sm" onClick={() => setModal(null)}>Discard proposal</button>
          <button className="btn sm" disabled={modal.errors.length > 0 || conflictRef.current || status === "saving"} onClick={async () => { edit((d) => ({ ...d, nodes: modal.nodes })); setSel(modal.nodes[0]?.id || null); setModal(null); setTab("write"); const saved = await flush(); notify(saved ? "Proposal applied and saved." : "Proposal applied locally. Check the save indicator."); }}>Replace tree and save</button></>}>
          <p>This replaces your current tree ({draft.nodes.length} sections) with {modal.nodes.length} generated sections and saves immediately. Nothing changes if you discard it.</p>
          {modal.errors.map((e) => <p key={e} className="err">{e}</p>)}
          <ul className="ws-outline">{flatten(modal.nodes).map(({ node, depth }) => <li key={node.id} style={{ paddingLeft: (depth - 1) * 16 }}>{node.title}{node.is_end ? " (end)" : ""}</li>)}</ul></Modal>
      )}
    </main>
  );
}

/* ---------- Write ---------- */
function WriteTab({ draft, edit, info, sel, setSel, setModal, focusTitle }) {
  const nodes = draft.nodes;
  const rows = useMemo(() => flatten(nodes), [nodes]);
  const node = info.map.get(sel);
  const titleRef = useRef(null);
  const depth = node ? info.chain(node.id).length : 0;
  const full = nodes.length >= LIMITS.nodes;
  useEffect(() => { if (focusTitle.current) { focusTitle.current = false; titleRef.current?.focus(); titleRef.current?.select(); } });
  const add = (parent_id) => {
    const n = { id: newId(), parent_id, title: "Untitled section", text: "", is_end: false };
    edit((d) => ({ ...d, nodes: [...d.nodes, n] })); setSel(n.id); focusTitle.current = true;
  };
  const patch = (p) => edit((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === sel ? { ...n, ...p } : n)) }));
  const hasKids = node && info.kids.has(node.id);
  const onKey = (e) => {
    const i = rows.findIndex((r) => r.node.id === sel);
    let j = null;
    if (e.key === "ArrowDown") j = Math.min(rows.length - 1, i + 1);
    else if (e.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (e.key === "Home") j = 0; else if (e.key === "End") j = rows.length - 1;
    else if (e.key === "ArrowRight" && node && info.kids.has(node.id)) j = i + 1;
    else if (e.key === "ArrowLeft" && node?.parent_id) j = rows.findIndex((r) => r.node.id === node.parent_id);
    if (j == null || j < 0) return;
    e.preventDefault(); setSel(rows[j].node.id);
    setTimeout(() => document.querySelector(`[data-nid="${rows[j].node.id}"]`)?.focus(), 0);
  };
  return (
    <div className="ws-grid">
      <div>
        <div className="row sp" style={{ marginBottom: 10 }}><span className="mono">Story tree</span><span className="ws-muted" style={{ fontSize: 12 }}>{nodes.length} of {LIMITS.nodes} sections</span></div>
        {rows.length === 0 ? (
          <div className="empty"><b>Start with a root section</b><span className="ws-muted">The root is where every path begins.</span><button className="btn" onClick={() => add(null)}><Plus size={14} /> Create root section</button></div>
        ) : (
          <div role="tree" aria-label="Story tree. Use arrow keys to move." className="wtree" onKeyDown={onKey}>
            {rows.map(({ node: n, depth: d }) => {
              const kind = n.is_end ? "end" : info.kids.has(n.id) ? "mid" : "open";
              return (
                <div key={n.id} role="none" className="wrow" style={{ paddingLeft: (d - 1) * 20 }}>
                  <button role="treeitem" aria-level={d} aria-selected={n.id === sel} data-nid={n.id} tabIndex={n.id === sel || (!sel && n === rows[0].node) ? 0 : -1} className={`wnode k-${kind} ${n.id === sel ? "on" : ""}`} onClick={() => setSel(n.id)}>
                    <i className="wdot" aria-hidden="true" /><span className="wt">{n.title || "Untitled"}</span>
                    <small>{!n.parent_id ? "Root" : ""}{!n.parent_id && kind !== "mid" ? ", " : ""}{kind === "end" ? "End" : kind === "open" ? "Unfinished" : ""}</small>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="ws-legend"><span><i className="wdot" /> Branches on</span><span><i className="wdot e" /> Ends</span><span><i className="wdot o" /> Unfinished</span></div>
        <div className="ws-stats">
          <b>{info.complete.length}</b> complete path{info.complete.length === 1 ? "" : "s"} of {LIMITS.paths} &middot; <b>{info.unfinished.length}</b> unfinished (excluded from evaluation and export) &middot; depth {info.maxDepth} of {LIMITS.depth} &middot; {info.chars.toLocaleString()} of {LIMITS.chars.toLocaleString()} characters
        </div>
        {info.errors.map((e) => <p key={e} className="err" role="alert">{e}</p>)}
      </div>
      <div>
        {!node ? <div className="empty"><b>Select a section</b><span className="ws-muted">Pick a node in the tree to edit its text.</span></div> : (
          <div className="panel" key={node.id}>
            <div className="row">
              <button className="btn ghost sm" disabled={node.is_end || full || depth >= LIMITS.depth} onClick={() => add(node.id)}><CornerDownRight size={13} /> Add child</button>
              <button className="btn ghost sm" disabled={!node.parent_id || full} onClick={() => add(node.parent_id)}><Plus size={13} /> Add sibling</button>
              <button className="btn ghost sm danger" disabled={!node.parent_id} title={!node.parent_id ? "Every story needs its root. Edit it, or delete the entire project from Projects." : undefined} onClick={() => { const ids = descendants(nodes, node.id); setModal({ type: "delete", ids, title: node.title, fallback: node.parent_id || nodes.find((n) => !ids.includes(n.id))?.id || null }); }}><Trash2 size={13} /> Delete</button>
            </div>
            {(full || depth >= LIMITS.depth) && !node.is_end && <p className="ws-muted" style={{ fontSize: 13 }}>{full ? "Section limit reached." : "Maximum depth reached for children."}</p>}
            <div className="field"><label htmlFor="ntitle">Section title</label><input id="ntitle" ref={titleRef} className="in" maxLength={120} value={node.title} onChange={(e) => patch({ title: e.target.value })} /></div>
            <div className="field"><label htmlFor="ntext">Section text</label><textarea id="ntext" className="ta" maxLength={20000} style={{ minHeight: 280 }} value={node.text} onChange={(e) => patch({ text: e.target.value })} /></div>
            <label className="check"><input type="checkbox" checked={node.is_end} disabled={hasKids} onChange={(e) => patch({ is_end: e.target.checked })} /> <Flag size={13} /> This section ends the story{hasKids ? " (remove its children first)" : ""}</label>
            {node.is_end && <div className="ws-pathprev"><span className="mono">Assembled path</span><pre className="ws-path">{assemble(nodes, node.id).text}</pre></div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Goal ---------- */
function AgeInput({ id, label, value, onCommit }) {
  const [t, setT] = useState(value ?? "");
  return (<div className="field"><label htmlFor={id}>{label}</label><input id={id} className="in" style={{ width: 120 }} inputMode="numeric" value={t} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setT(v); onCommit(v === "" ? null : parseInt(v, 10)); }} /></div>);
}
function GoalTab({ goal, setGoal, gErr }) {
  const [touched, setTouched] = useState(false);
  const F = ({ k, label, hint, area, optional }) => (
    <div className="field"><label htmlFor={`g-${k}`}>{label}{optional && <span className="ws-muted"> (optional)</span>}</label>
      {area ? <textarea id={`g-${k}`} className="ta" style={{ minHeight: 90 }} value={goal[k] || ""} onChange={(e) => setGoal(k, e.target.value)} />
        : <input id={`g-${k}`} className="in" value={goal[k] || ""} onChange={(e) => setGoal(k, e.target.value)} />}
      {hint && <span className="ws-muted" style={{ fontSize: 12 }}>{hint}</span>}
      {touched && gErr[k] && <span className="err" role="alert">{gErr[k]}</span>}</div>
  );
  return (
    <div className="panel" onBlur={() => setTouched(true)}>
      <p className="ws-muted">The goal is saved with the project and frozen into every generation and evaluation run. It must be complete before either can start.</p>
      <F k="outcome" label="Intended outcome" hint="What should a reader feel, understand or do by the end?" />
      <F k="audience" label="Audience" hint="Who is this for? Describe interests and context, not stereotypes." />
      <div className="row" style={{ alignItems: "flex-start" }}>
        <AgeInput id="g-amin" label="Minimum age" value={goal.age_min} onCommit={(v) => setGoal("age_min", v)} />
        <AgeInput id="g-amax" label="Maximum age" value={goal.age_max} onCommit={(v) => setGoal("age_max", v)} />
      </div>
      {touched && gErr.age && <span className="err" role="alert">{gErr.age}</span>}
      <div className="row" style={{ alignItems: "flex-start" }}><F k="gender" label="Gender" optional /><F k="nationality" label="Nationality" optional /></div>
      <F k="tone" label="Tone" hint="For example: wry, tender, restrained." />
      <F k="constraints" label="Constraints" area hint="Content limits, length, themes to avoid. Write 'none' if there are none." />
      {Object.keys(gErr).length === 0 ? <p className="ws-ok"><Check size={14} /> Goal is complete.</p> : <p className="ws-muted">{Object.keys(gErr).length} required item{Object.keys(gErr).length > 1 ? "s" : ""} still needed before runs can start.</p>}
    </div>
  );
}

/* ---------- Runs helpers ---------- */
function useStart({ id, setRuns, notify, setOpenRun }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const start = async (input) => {
    setBusy(true); setErr("");
    try {
      const run = await startRun(id, { ...input, request_id: crypto.randomUUID() });
      setRuns((p) => [run, ...(p || []).filter((r) => r.id !== run.id)]); setOpenRun?.(run.id);
      notify(`${input.kind === "generation" ? "Generation" : "Evaluation"} started.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return { busy, err, start };
}
function RunList({ runs, kind, openRun, setOpenRun, notify, pollErr, loadRuns, runsErr, onReview }) {
  const [busyId, setBusyId] = useState(null);
  if (runsErr) return <div className="banner" role="alert"><span>Runs could not be loaded: {runsErr}</span><button className="btn ghost sm" onClick={loadRuns}>Retry</button></div>;
  if (!runs) return <Skeleton rows={2} h={52} />;
  const list = runs.filter((r) => r.kind === kind);
  const cancel = async (r) => {
    setBusyId(r.id);
    try { const u = await cancelRun(r.id); notify("Cancel requested."); if (u?.id) loadRuns(); else loadRuns(); } catch (e) { notify(e.message); } finally { setBusyId(null); }
  };
  return (
    <div className="ws-runs">
      {pollErr && <p className="err" role="status">Connection lost. Retrying automatically.</p>}
      {list.length === 0 && <div className="empty"><b>No {kind} runs yet</b><span className="ws-muted">Started runs continue on the server and will appear here if you leave and come back.</span></div>}
      {list.map((r) => { const p = r.progress || {}; return (
        <div key={r.id} className={`ws-run ${openRun === r.id ? "on" : ""}`}>
          <div><b>{STATUS_LABEL[r.status] || r.status}</b> <span className="ws-muted">{p.total ? `${(p.succeeded || 0) + (p.failed || 0)} of ${p.total} done` : ""}{p.failed ? `, ${p.failed} failed` : ""}{r.created_at ? ` \u00b7 ${new Date(r.created_at).toLocaleString()}` : ""}</span>
            {r.error && <div className="err">{r.error}</div>}</div>
          <div className="row">
            {isActive(r) && <button className="btn ghost sm danger" disabled={busyId === r.id} onClick={() => cancel(r)}><Square size={12} /> Cancel run</button>}
            {onReview ? (r.status === "completed" || r.status === "partial") && <button className="btn ghost sm" onClick={() => onReview(r)}>Review proposal</button>
              : <button className="btn ghost sm" aria-pressed={openRun === r.id} onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>{openRun === r.id ? "Hide results" : "View results"}</button>}
          </div>
        </div>); })}
    </div>
  );
}

/* ---------- Generate ---------- */
async function readTxt(file) {
  if (!/\.txt$/i.test(file.name)) throw new Error("Choose a file ending in .txt.");
  if (file.size === 0) throw new Error("The file is empty.");
  if (file.size > 65536) throw new Error(`The file is ${file.size.toLocaleString()} bytes; the limit is 65,536.`);
  const buf = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { throw new Error("The file is not valid UTF-8 text."); }
  if (text.includes("\u0000")) throw new Error("The file contains NUL characters and is not plain text.");
  if (!text.trim()) throw new Error("The file has no readable text.");
  return text;
}
function GenerateTab(c) {
  const { gErr, saved, runs, openRun, setOpenRun, notify, pollErr, loadRuns, runsErr, info, setModal } = c;
  const [file, setFile] = useState(null);
  const [fileErr, setFileErr] = useState("");
  const { busy, err, start } = useStart(c);
  const goalOk = Object.keys(gErr).length === 0;
  const pick = async (e) => {
    const f = e.target.files?.[0]; setFile(null); setFileErr("");
    if (!f) return;
    try { setFile({ name: f.name, size: f.size, text: await readTxt(f) }); } catch (x) { setFileErr(x.message); }
  };
  const review = async (r) => {
    let run = r;
    if (!r.generated_nodes) { try { run = await getRun(r.id); } catch (e) { notify(e.message); return; } }
    const nodes = run.generated_nodes || [];
    if (!nodes.length) { notify("This run produced no sections."); return; }
    setModal({ type: "apply", nodes, errors: analyze(nodes).errors });
  };
  const blocked = !goalOk ? "Complete the Goal tab first." : !saved ? "Wait for autosave to finish first." : !file ? "Choose a .txt file." : "";
  return (
    <div className="ws-stack">
      <div className="panel">
        <p>Upload a plain-text source and ManyWays proposes an editable tree. The proposal never touches your tree until you review and confirm it.{info && c.draft.nodes.length > 0 && " Applying it will replace your current tree."}</p>
        <div className="field"><label htmlFor="src">Source file (.txt, UTF-8, up to 64 KiB)</label><input id="src" className="in" type="file" accept=".txt,text/plain" onChange={pick} /></div>
        {fileErr && <p className="err" role="alert">{fileErr}</p>}
        {file && <p className="ws-ok"><Check size={14} /> {file.name}, {file.size.toLocaleString()} bytes, {file.text.length.toLocaleString()} characters ready.</p>}
        {!goalOk && <p className="ws-muted">Goal is incomplete: {Object.values(gErr).join(" ")}</p>}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row"><button className="btn" disabled={!!blocked || busy} onClick={() => start({ kind: "generation", source_name: file.name, source_text: file.text })}><FileUp size={14} /> {busy ? "Starting..." : "Generate proposal"}</button>{blocked && <span className="ws-muted" style={{ fontSize: 13 }}>{blocked}</span>}</div>
      </div>
      <b>Generation runs</b>
      <RunList runs={runs} kind="generation" openRun={openRun} setOpenRun={setOpenRun} notify={notify} pollErr={pollErr} loadRuns={loadRuns} runsErr={runsErr} onReview={review} />
    </div>
  );
}

/* ---------- Evaluate ---------- */
function EvaluateTab(c) {
  const { info, gErr, saved, runs, openRun, setOpenRun, notify, pollErr, loadRuns, runsErr, draft } = c;
  const [pick, setPick] = useState([]);
  const [count, setCount] = useState("12");
  const { busy, err, start } = useStart(c);
  const complete = info.complete.filter((x) => info.map.has(x));
  const chosen = pick.filter((x) => complete.includes(x));
  const n = Number(count);
  const countOk = Number.isInteger(n) && n >= 10 && n <= 15;
  const goalOk = Object.keys(gErr).length === 0;
  const blocked = !goalOk ? "Complete the Goal tab first." : !saved ? "Wait for autosave to finish first." : !chosen.length ? "Choose at least one complete path." : !countOk ? "Persona count must be 10 to 15." : info.errors.length ? "Fix tree limits first." : "";
  const run = (runs || []).find((r) => r.id === openRun && r.kind === "evaluation");
  const toggle = (x) => setPick((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]));
  return (
    <div className="ws-stack">
      <Rubric />
      <div className="panel">
        <fieldset className="ws-fs"><legend className="lbl">Complete paths to evaluate</legend>
          {complete.length === 0 ? <div className="empty"><b>No complete paths yet</b><span className="ws-muted">Mark at least one leaf section as an end in the Write tab. Unfinished paths are never evaluated.</span></div> : (
            <div className="ws-picks">{complete.map((x) => <label key={x} className="check ws-pick"><input type="checkbox" checked={chosen.includes(x)} onChange={() => toggle(x)} /><span><b>{info.map.get(x).title}</b><small>{info.chain(x).length} sections, {assemble(draft.nodes, x).text.length.toLocaleString()} characters</small></span></label>)}</div>)}
          {complete.length > 0 && <button className="btn ghost sm" style={{ justifySelf: "start" }} onClick={() => setPick(chosen.length === complete.length ? [] : complete)}>{chosen.length === complete.length ? "Clear selection" : "Select all"}</button>}
        </fieldset>
        <div className="field"><label htmlFor="pc">Number of personas (10 to 15)</label><input id="pc" className="in" style={{ width: 120 }} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))} aria-invalid={!countOk} />
          {!countOk && <span className="err" role="alert">Enter a whole number from 10 to 15.</span>}</div>
        <p className="ws-muted" style={{ fontSize: 13 }}>Each persona evaluates every chosen path: {chosen.length} path{chosen.length === 1 ? "" : "s"} x {countOk ? n : "?"} personas = {countOk ? chosen.length * n : "?"} evaluations. Personas are simulated.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row"><button className="btn" disabled={!!blocked || busy} onClick={() => start({ kind: "evaluation", branch_ids: chosen, persona_count: n })}><Play size={14} /> {busy ? "Starting..." : "Start evaluation"}</button>{blocked && <span className="ws-muted" style={{ fontSize: 13 }}>{blocked}</span>}</div>
      </div>
      <b>Evaluation runs</b>
      <RunList runs={runs} kind="evaluation" openRun={openRun} setOpenRun={setOpenRun} notify={notify} pollErr={pollErr} loadRuns={loadRuns} runsErr={runsErr} />
      {run && (run.snapshot ? <Results run={run} currentNodes={draft.nodes} currentGoal={draft.goal} /> : <Skeleton rows={3} h={90} />)}
    </div>
  );
}

/* ---------- Export ---------- */
function ExportTab({ id, info, saved, draft, notify }) {
  const complete = info.complete;
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState("");
  const chosen = pick.filter((x) => complete.includes(x));
  const go = async (label, ids, format = "text") => {
    setBusy(label); setErr("");
    try { await downloadExport(id, ids, format); notify("Download started."); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  return (
    <div className="panel">
      <p>Exports are assembled from the last saved version, root to end, with shared ancestors included in every branch. Unfinished paths are left out.</p>
      {!saved && <p className="note" role="status"><AlertTriangle size={16} /> Exports use the saved version. Wait for autosave to finish so the download matches what you see.</p>}
      {complete.length === 0 ? <div className="empty"><b>Nothing to export yet</b><span className="ws-muted">Mark a leaf section as an end to create a complete branch.</span></div> : (
        <div className="ws-picks">{complete.map((x) => <label key={x} className="check ws-pick"><input type="checkbox" checked={chosen.includes(x)} onChange={() => setPick((p) => (p.includes(x) ? p.filter((y) => y !== x) : [...p, x]))} /><span><b>{info.map.get(x).title}</b><small>{assemble(draft.nodes, x).text.length.toLocaleString()} characters</small></span></label>)}</div>)}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="row">
        <button className="btn" disabled={!saved || !chosen.length || !!busy} onClick={() => go("sel", chosen)}><Download size={14} /> {busy === "sel" ? "Preparing..." : chosen.length > 1 ? `Download ${chosen.length} branches (ZIP)` : "Download selected"}</button>
        <button className="btn ghost" disabled={!saved || !complete.length || !!busy} onClick={() => go("all", complete)}>{busy === "all" ? "Preparing..." : `Download all ${complete.length}`}</button>
        <button className="btn ghost" disabled={!saved || !complete.length || !!busy} onClick={() => go("json", complete, "json")}>{busy === "json" ? "Preparing..." : "Project JSON"}</button>
      </div>
    </div>
  );
}
