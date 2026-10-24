"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Copy, ArrowRight, ArrowLeft, Info, AlertTriangle, RefreshCw, FileText, Check } from "lucide-react";
import Logo from "../Logo";
import { STORAGE_KEY, SAMPLES, COLORS, uid, buildProject, sampleReport } from "../../lib/data";

const STEPS = ["Create", "Versions", "Audience", "Results"];
const colorOf = (p, b) => (b.isOriginal ? "#17160f" : COLORS[Math.max(0, p.branches.filter((x) => !x.isOriginal).findIndex((x) => x.id === b.id)) % COLORS.length]);

export default function Studio() {
  const [projects, setProjects] = useState([]);
  const [ready, setReady] = useState(false);
  const [storeErr, setStoreErr] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [step, setStep] = useState(0);
  const loaded = useRef(false);

  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) throw new Error("bad shape");
      setProjects(list);
      setStoreErr(null);
      return list;
    } catch (e) {
      setStoreErr("Saved projects could not be read from this browser.");
      return [];
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const list = load();
      loaded.current = true;
      if (new URLSearchParams(window.location.search).get("sample") === "1") {
        const p = buildProject({ ...SAMPLES.social, sample: SAMPLES.social });
        setProjects([p, ...list]);
        setActiveId(p.id);
        setStep(1);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); }
    catch (e) { setStoreErr("Could not save to this browser. Storage may be full or disabled."); }
  }, [projects]);

  const project = projects.find((p) => p.id === activeId) || null;
  const update = (fn) => setProjects((ps) => ps.map((p) => (p.id === activeId ? { ...fn(p), updatedAt: new Date().toISOString() } : p)));
  const open = (id) => { setActiveId(id); setStep(1); };
  const remove = (id) => {
    if (!window.confirm("Delete this project from this browser?")) return;
    setProjects((ps) => ps.filter((p) => p.id !== id));
    if (id === activeId) { setActiveId(null); setStep(0); }
  };
  const create = (data) => {
    const p = buildProject(data);
    setProjects((ps) => [p, ...ps]); setActiveId(p.id); setStep(1);
  };
  const canGo = (i) => i === 0 || (project && (i < 3 || (project.selected.length >= 2)));

  return (
    <div className="app">
      <aside className="side" aria-label="Projects">
        <Link href="/" className="logo"><Logo /> ManyWays</Link>
        <button className="btn sm" onClick={() => { setActiveId(null); setStep(0); }}><Plus size={14} /> New experiment</button>
        <div className="mono">Saved in this browser</div>
        <div style={{ display: "grid", gap: 4 }}>
          {!ready && [1, 2, 3].map((k) => <div key={k} className="skel" style={{ height: 52 }} />)}
          {ready && projects.length === 0 && <p style={{ fontSize: 13, color: "var(--ink3)" }}>No projects yet. Create one or load a sample.</p>}
          {ready && projects.map((p) => (
            <div key={p.id} className={`proj ${p.id === activeId ? "on" : ""}`}>
              <button className="open" onClick={() => open(p.id)}><b>{p.title || "Untitled"}</b><span>{p.type === "story" ? "Storytelling" : "Social Content"} &middot; {p.branches.length} versions</span></button>
              <button className="icon-btn" aria-label={`Delete ${p.title}`} onClick={() => remove(p.id)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <Link href="/" className="btn ghost sm" style={{ marginTop: "auto", justifySelf: "start" }}><ArrowLeft size={14} /> Back to site</Link>
      </aside>
      <main className="main">
        {storeErr && (
          <div className="banner" role="alert"><span><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {storeErr}</span><button className="btn ghost sm" onClick={() => { load(); }}><RefreshCw size={13} /> Retry</button></div>
        )}
        <nav className="stepper" aria-label="Steps">
          {STEPS.map((s, i) => (
            <button key={s} disabled={!canGo(i)} aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}>
              <span className="n">{step > i && canGo(i) ? <Check size={12} /> : i + 1}</span>{s}
            </button>
          ))}
        </nav>
        {!ready ? (
          <div style={{ display: "grid", gap: 14 }}><div className="skel" style={{ height: 60, maxWidth: 420 }} /><div className="skel" style={{ height: 320 }} /></div>
        ) : step === 0 || !project ? (
          <Create onCreate={create} hasProjects={projects.length > 0} />
        ) : step === 1 ? (
          <Versions p={project} update={update} next={() => setStep(2)} />
        ) : step === 2 ? (
          <Audience p={project} update={update} back={() => setStep(1)} next={() => setStep(3)} />
        ) : (
          <Results p={project} update={update} back={() => setStep(2)} />
        )}
      </main>
    </div>
  );
}

function Create({ onCreate, hasProjects }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("social");
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const bad = touched && (!title.trim() || !text.trim());
  const submit = (e) => {
    e.preventDefault(); setTouched(true);
    if (!title.trim() || !text.trim()) return;
    onCreate({ title: title.trim(), type, original: text.trim() });
  };
  const useSample = () => { const s = SAMPLES[type]; onCreate({ ...s, sample: s }); };
  return (
    <form onSubmit={submit} noValidate>
      <div className="page-h"><span className="mono">Step 1 / Create experiment</span><h2>Start with the draft you have.</h2>
        <p className="lead">Paste your text. We keep it as the Original and never overwrite it.</p></div>
      <div className="panel">
        <div className="field"><span className="lbl">Content type</span>
          <div className="seg">
            <button type="button" aria-pressed={type === "social"} onClick={() => setType("social")}>Social Content<small>Posts, hooks, copy</small></button>
            <button type="button" aria-pressed={type === "story"} onClick={() => setType("story")}>Storytelling<small>Scenes, excerpts, decisions</small></button>
          </div></div>
        <div className="field"><label htmlFor="t">Project title</label>
          <input id="t" className="in" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My LinkedIn post" />
          {touched && !title.trim() && <span className="err">Add a title.</span>}</div>
        <div className="field"><label htmlFor="c">Original content</label>
          <textarea id="c" className="ta" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your draft here" />
          {touched && !text.trim() && <span className="err">Paste some content to branch from.</span>}</div>
        <div className="row sp">
          <button type="button" className="btn ghost" onClick={useSample}><FileText size={15} /> Use {type === "story" ? "story" : "social"} sample</button>
          <button className="btn" type="submit" aria-describedby={bad ? "t" : undefined}>Create experiment <ArrowRight size={15} /></button>
        </div>
      </div>
      {!hasProjects && <div className="empty" style={{ marginTop: 20 }}><Logo size={34} /><b>Nothing saved yet</b><span style={{ color: "var(--ink2)", fontSize: 14 }}>Your experiments will appear in the sidebar and persist in this browser.</span></div>}
    </form>
  );
}

function Versions({ p, update, next }) {
  const sel = p.selected;
  const toggle = (id) => update((x) => {
    const has = x.selected.includes(id);
    if (!has && x.selected.length >= 3) return x;
    return { ...x, selected: has ? x.selected.filter((s) => s !== id) : [...x.selected, id], result: null };
  });
  const dup = (b) => update((x) => {
    const n = x.branches.filter((y) => !y.isOriginal).length;
    const nb = { id: uid(), parentId: b.id, name: `Version ${String.fromCharCode(65 + n)}`, content: b.content, isOriginal: false };
    return { ...x, branches: [...x.branches, nb], result: null };
  });
  const edit = (id, patch) => update((x) => ({ ...x, branches: x.branches.map((b) => (b.id === id && !b.isOriginal ? { ...b, ...patch } : b)), result: null }));
  const del = (id) => update((x) => ({
    ...x, result: null,
    branches: x.branches.filter((b) => b.id !== id).map((b) => (b.parentId === id ? { ...b, parentId: x.branches.find((y) => y.id === id).parentId } : b)),
    selected: x.selected.filter((s) => s !== id),
  }));
  const parentName = (b) => p.branches.find((y) => y.id === b.parentId)?.name;
  return (
    <div>
      <div className="page-h"><span className="mono">Step 2 / Versions</span><h2>{p.title}</h2>
        <p className="lead">Duplicate any version to fork it. Rename and edit branches freely. Select up to three to compare.</p></div>
      <div className="vgrid">
        {p.branches.map((b, i) => (
          <div key={b.id} className={`vcard ${sel.includes(b.id) ? "sel" : ""}`} style={{ "--c": colorOf(p, b), animationDelay: `${i * 50}ms` }}>
            <div className="row sp">
              {b.isOriginal ? <b style={{ fontSize: 17 }}>Original</b> : (
                <input className="in" style={{ maxWidth: 300, fontWeight: 500 }} aria-label="Version name" value={b.name} onChange={(e) => edit(b.id, { name: e.target.value })} />
              )}
              <div className="row" style={{ gap: 8 }}>
                {b.isOriginal ? <span className="chip acc">Preserved, read-only</span> : <span className="chip">Parent: {parentName(b) || "none"}</span>}
                <label className="check"><input type="checkbox" checked={sel.includes(b.id)} disabled={!sel.includes(b.id) && sel.length >= 3} onChange={() => toggle(b.id)} /> Compare</label>
              </div>
            </div>
            <textarea className="ta" aria-label={`${b.name} content`} readOnly={b.isOriginal} value={b.content} onChange={(e) => edit(b.id, { content: e.target.value })} />
            <div className="row">
              <button className="btn ghost sm" onClick={() => dup(b)}><Copy size={13} /> Duplicate as branch</button>
              {!b.isOriginal && <button className="btn ghost sm danger" onClick={() => del(b.id)}><Trash2 size={13} /> Delete</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="row sp" style={{ marginTop: 22 }}>
        <span style={{ fontSize: 14, color: "var(--ink2)" }}>{sel.length} of 3 selected{sel.length < 2 && " (select at least 2 to continue)"}</span>
        <button className="btn" disabled={sel.length < 2} onClick={next}>Set audience <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

function Audience({ p, update, back, next }) {
  const g = p.goal;
  const [touched, setTouched] = useState(false);
  const set = (k, v) => update((x) => ({ ...x, goal: { ...x.goal, [k]: v }, result: null }));
  const errs = {};
  if (!g.audience.trim()) errs.audience = "Describe who this is for.";
  if (!g.outcome.trim()) errs.outcome = "State the outcome you want.";
  if (!(Number(g.ageMin) >= 13 && Number(g.ageMax) <= 100 && Number(g.ageMin) <= Number(g.ageMax))) errs.age = "Use ages 13 to 100, with minimum no greater than maximum.";
  const go = () => { setTouched(true); if (Object.keys(errs).length === 0) next(); };
  return (
    <div>
      <div className="page-h"><span className="mono">Step 3 / Audience setup</span><h2>Who is this for?</h2>
        <p className="lead">Criteria frame the comparison. Comparing {p.selected.length} versions.</p></div>
      <div className="panel">
        <div className="field"><label htmlFor="a">Audience description</label>
          <input id="a" className="in" value={g.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Early-career software engineers" />
          {touched && errs.audience && <span className="err">{errs.audience}</span>}</div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field"><label htmlFor="amin">Age from</label><input id="amin" type="number" className="in" style={{ width: 110 }} value={g.ageMin} onChange={(e) => set("ageMin", e.target.value)} /></div>
          <div className="field"><label htmlFor="amax">Age to</label><input id="amax" type="number" className="in" style={{ width: 110 }} value={g.ageMax} onChange={(e) => set("ageMax", e.target.value)} /></div>
          {touched && errs.age && <span className="err" style={{ alignSelf: "center" }}>{errs.age}</span>}
        </div>
        <div className="field"><label htmlFor="s">{p.type === "story" ? "Genres and style" : "Content style"}</label>
          <input id="s" className="in" value={g.styles} onChange={(e) => set("styles", e.target.value)} placeholder="practical, educational" /></div>
        <div className="field"><label htmlFor="o">Desired outcome</label>
          <input id="o" className="in" value={g.outcome} onChange={(e) => set("outcome", e.target.value)} placeholder="Encourage meaningful engagement" />
          {touched && errs.outcome && <span className="err">{errs.outcome}</span>}</div>
        <div className="field"><label htmlFor="m">Success metric</label>
          <input id="m" className="in" value={g.metric} onChange={(e) => set("metric", e.target.value)} placeholder="Thoughtful comments" /></div>
        <div className="field"><span className="lbl">Versions in this comparison</span>
          <div className="row">{p.branches.filter((b) => p.selected.includes(b.id)).map((b) => (<span key={b.id} className="chip"><span className="dot" style={{ background: colorOf(p, b), width: 8, height: 8 }} />{b.name}</span>))}</div></div>
      </div>
      <div className="row sp" style={{ marginTop: 22 }}>
        <button className="btn ghost" onClick={back}><ArrowLeft size={15} /> Versions</button>
        <button className="btn" onClick={go}>Generate sample report <ArrowRight size={15} /></button>
      </div>
    </div>
  );
}

function Results({ p, update, back }) {
  const [status, setStatus] = useState(p.result ? "done" : "loading");
  const [attempt, setAttempt] = useState(0);
  const upd = useRef(update); upd.current = update;
  const pr = useRef(p); pr.current = p;
  useEffect(() => {
    if (pr.current.result) { setStatus("done"); return; }
    setStatus("loading");
    const t = setTimeout(() => {
      try {
        const cur = pr.current;
        const ids = cur.selected.filter((id) => cur.branches.some((b) => b.id === id));
        if (ids.length < 2) throw new Error("Select at least two versions.");
        const r = sampleReport(cur, ids);
        upd.current((x) => ({ ...x, result: r }));
        setStatus("done");
      } catch (e) { setStatus("error"); }
    }, 1700);
    return () => clearTimeout(t);
  }, [attempt, p.result]);

  const Banner = (
    <div className="note" role="note"><Info size={16} /><span><b>Illustrative sample report.</b> This report is not generated from your content and runs no live analysis. It shows the format ManyWays is designed to produce. Real audience testing is still needed.</span></div>
  );
  if (status === "loading") return (
    <div role="status" aria-live="polite">
      <div className="page-h"><span className="mono">Step 4 / Results</span><h2>Preparing the sample report</h2></div>
      <div className="res-grid">{[0, 1, 2].slice(0, Math.max(2, p.selected.length)).map((k) => <div key={k} className="skel" style={{ height: 300 }} />)}</div>
    </div>
  );
  if (status === "error" || !p.result) return (
    <div className="empty"><AlertTriangle /><b>The sample report could not be prepared</b><span style={{ color: "var(--ink2)", fontSize: 14 }}>Select at least two versions, then try again.</span>
      <div className="row"><button className="btn ghost" onClick={back}>Back</button><button className="btn" onClick={() => { update((x) => ({ ...x, result: null })); setAttempt((a) => a + 1); }}><RefreshCw size={14} /> Retry</button></div></div>
  );
  const r = p.result;
  const bOf = (id) => p.branches.find((b) => b.id === id);
  const rec = bOf(r.recommendedBranchId);
  return (
    <div>
      <div className="page-h"><span className="mono">Step 4 / Results</span><h2>Comparison</h2><span className="watermark">Sample report &middot; not from your content</span></div>
      {Banner}
      <div className="panel" style={{ margin: "18px 0" }}>
        <span className="mono">Audience frame (your input)</span>
        <p>{p.goal.audience || "Not set"}, ages {p.goal.ageMin} to {p.goal.ageMax}. Outcome: {p.goal.outcome || "not set"}. Metric: {p.goal.metric || "not set"}.</p>
      </div>
      <div className="res-grid">
        {r.items.map((it, i) => { const b = bOf(it.branchId); if (!b) return null; const c = colorOf(p, b); return (
          <article key={it.branchId} className={`rcard ${it.branchId === r.recommendedBranchId ? "rec" : ""}`} style={{ "--c": c, animationDelay: `${i * 90}ms` }}>
            <div className="row sp"><b style={{ fontSize: 18 }}>{b.name}</b>{it.branchId === r.recommendedBranchId && <span className="chip acc">Sample pick</span>}</div>
            <div><div className="row sp" style={{ fontSize: 13 }}><span>Sample goal-fit: {it.fit}</span><span className="mono">sample #{i + 1}</span></div><div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${it.pct}%` }} /></div></div>
            <div><b style={{ fontSize: 13 }}>Strengths</b><ul>{it.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><b style={{ fontSize: 13 }}>Risks</b><ul>{it.risks.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><b style={{ fontSize: 13 }}>Sample audience reactions</b><ul>{it.reactions.map(([w, t]) => <li key={w}><i>{w}:</i> {t}</li>)}</ul></div>
          </article>); })}
      </div>
      <div className="panel" style={{ marginTop: 18 }}>
        <span className="mono">Sample recommendation</span>
        <p style={{ fontSize: 18 }}>In this illustration, <b>{rec?.name}</b> is shown as the best fit, with the trade-off that it may give up some of the strengths of the other versions.</p>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Version</th><th>Sample fit</th><th>Main sample risk</th></tr></thead>
          <tbody>{r.items.map((it) => (<tr key={it.branchId}><td>{bOf(it.branchId)?.name}</td><td>{it.fit}</td><td>{it.risks[0]}</td></tr>))}</tbody></table></div>
        <p style={{ fontSize: 13, color: "var(--ink3)" }}>Sample assignments are arbitrary by selection order and do not evaluate your text.</p>
      </div>
      <div className="row sp" style={{ marginTop: 22 }}>
        <button className="btn ghost" onClick={back}><ArrowLeft size={15} /> Audience</button>
        <button className="btn ghost" onClick={() => { update((x) => ({ ...x, result: null })); setAttempt((a) => a + 1); }}><RefreshCw size={14} /> Regenerate sample</button>
      </div>
    </div>
  );
}
