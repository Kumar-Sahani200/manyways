"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Plus, Trash2, Pencil, RefreshCw, AlertTriangle, ArrowRight, PenLine, FileUp } from "lucide-react";
import Logo from "../Logo";
import Editor from "./Editor";
import { Modal, Skeleton } from "./ui";
import { toList } from "./tree";
import { createProject, deleteProject, listProjects, saveProject, getProject } from "../../lib/api";

export default function Workspace() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [startTab, setStartTab] = useState("write");
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("manual");
  const [formErr, setFormErr] = useState("");
  const tt = useRef();

  const notify = useCallback((m) => { setToast(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(""), 4000); }, []);
  const load = useCallback(async () => {
    setError(null);
    try { setProjects(toList(await listProjects(), "projects")); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setFormErr("Give the project a title."); return; }
    setBusy(true); setFormErr("");
    try {
      const p = await createProject(title.trim());
      setTitle(""); setStartTab(mode === "generate" ? "generate" : "write");
      notify(`Created "${p.title}".`);
      setProjects((ps) => [p, ...(ps || [])]); setOpenId(p.id);
    } catch (err) { setFormErr(err.message); } finally { setBusy(false); }
  };
  const doRename = async () => {
    const { project, value } = dialog;
    if (!value.trim()) return;
    setBusy(true);
    try {
      const full = await getProject(project.id);
      const saved = await saveProject({ ...full, title: value.trim() });
      setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, ...saved, title: value.trim() } : p)));
      notify("Project renamed."); setDialog(null);
    } catch (err) { setDialog({ ...dialog, error: err.status === 409 ? "This project changed elsewhere. Reload the list and try again." : err.message }); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true);
    try {
      await deleteProject(dialog.project.id);
      setProjects((ps) => ps.filter((p) => p.id !== dialog.project.id));
      notify(`Deleted "${dialog.project.title}".`); setDialog(null);
    } catch (err) { setDialog({ ...dialog, error: err.message }); } finally { setBusy(false); }
  };

  return (
    <div className="ws">
      <header className="ws-top">
        <div className="wrap ws-top-in">
          <Link href="/" className="logo"><Logo /> ManyWays</Link>
          <div className="row"><span className="mono">Workspace</span><UserButton /></div>
        </div>
      </header>
      <div className="sr" role="status" aria-live="polite">{toast}</div>
      {toast && <div className="ws-toast" aria-hidden="true">{toast}</div>}
      {openId ? (
        <Editor key={openId} id={openId} initialTab={startTab} notify={notify} onClose={() => { setOpenId(null); load(); }} />
      ) : (
        <main className="wrap ws-list">
          <div className="page-h"><span className="mono">Your projects</span><h2>Choose a story to branch.</h2>
            <p className="lead">Write the tree by hand, or upload a text file and let ManyWays propose one. Every project is private to your account.</p></div>
          <div className="ws-split">
            <form className="panel" onSubmit={create} noValidate>
              <b style={{ fontSize: 18 }}>New project</b>
              <div className="field"><label htmlFor="np-title">Project title</label>
                <input id="np-title" className="in" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="The lighthouse keeper's choice" aria-invalid={!!formErr} aria-describedby="np-err" />
                <span id="np-err" className="err" role="alert">{formErr}</span></div>
              <fieldset className="ws-fs"><legend className="lbl">How do you want to start?</legend>
                <div className="seg">
                  <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")}><span><PenLine size={14} style={{ verticalAlign: -2 }} /> Write manually</span><small>Build the tree node by node</small></button>
                  <button type="button" aria-pressed={mode === "generate"} onClick={() => setMode("generate")}><span><FileUp size={14} style={{ verticalAlign: -2 }} /> Generate from .txt</span><small>Upload source text and a goal</small></button>
                </div></fieldset>
              <button className="btn" type="submit" disabled={busy}>{busy ? "Creating..." : "Create project"} <ArrowRight size={15} /></button>
            </form>
            <section aria-label="Saved projects" className="ws-plist">
              {projects === null && !error && <Skeleton rows={3} h={72} />}
              {error && <div className="empty"><AlertTriangle /><b>Projects could not be loaded</b><span className="ws-muted">{error}</span><button className="btn" onClick={load}><RefreshCw size={14} /> Try again</button></div>}
              {projects?.length === 0 && <div className="empty"><Logo size={34} /><b>No projects yet</b><span className="ws-muted">Name your first story on the left. It will be saved here.</span></div>}
              {projects?.map((p) => (
                <article key={p.id} className="ws-pitem">
                  <button className="ws-popen" onClick={() => { setStartTab("write"); setOpenId(p.id); }}>
                    <b>{p.title || "Untitled"}</b><span>{p.nodes ? `${p.nodes.length} sections` : "Open to edit"}{p.updated_at ? ` \u00b7 updated ${new Date(p.updated_at).toLocaleDateString()}` : ""}</span>
                  </button>
                  <button className="icon-btn" aria-label={`Rename ${p.title}`} onClick={() => setDialog({ type: "rename", project: p, value: p.title || "" })}><Pencil size={15} /></button>
                  <button className="icon-btn" aria-label={`Delete ${p.title}`} onClick={() => setDialog({ type: "delete", project: p })}><Trash2 size={15} /></button>
                </article>
              ))}
            </section>
          </div>
        </main>
      )}
      {dialog?.type === "rename" && (
        <Modal title="Rename project" onClose={() => setDialog(null)} actions={<><button className="btn ghost sm" onClick={() => setDialog(null)}>Cancel</button><button className="btn sm" disabled={busy || !dialog.value.trim()} onClick={doRename}>{busy ? "Saving..." : "Save name"}</button></>}>
          <div className="field"><label htmlFor="rn">Project title</label><input id="rn" data-autofocus className="in" value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doRename()} /></div>
          {dialog.error && <p className="err" role="alert">{dialog.error}</p>}
        </Modal>
      )}
      {dialog?.type === "delete" && (
        <Modal danger title="Delete this project?" onClose={() => setDialog(null)} actions={<><button data-autofocus className="btn ghost sm" onClick={() => setDialog(null)}>Keep project</button><button className="btn sm danger" disabled={busy} onClick={doDelete}>{busy ? "Deleting..." : "Delete permanently"}</button></>}>
          <p>&ldquo;{dialog.project.title}&rdquo; and all of its runs and results will be permanently removed. This cannot be undone.</p>
          {dialog.error && <p className="err" role="alert">{dialog.error}</p>}
        </Modal>
      )}
    </div>
  );
}
