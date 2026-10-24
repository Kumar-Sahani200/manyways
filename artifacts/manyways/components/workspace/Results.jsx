"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { analyze, assemble } from "./tree";
import { Rubric, STATUS_LABEL } from "./ui";

const SCORES = [["comprehension", "Comprehension"], ["credibility", "Credibility"], ["memorability", "Memorability"], ["goal_fit", "Goal fit"]];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f1 = (n) => (n == null ? "n/a" : n.toFixed(1));
const List = ({ items }) => (items?.length ? <ul>{items.map((x, i) => <li key={i}>{typeof x === "string" ? x : JSON.stringify(x)}</li>)}</ul> : <p className="ws-muted">None reported.</p>);

export default function Results({ run, currentNodes, currentGoal }) {
  const snap = run.snapshot || {};
  const snapNodes = snap.nodes || [];
  const label = (id) => snapNodes.find((n) => n.id === id)?.title || `Branch ${String(id).slice(0, 6)}`;
  const branchIds = useMemo(() => (snap.branches || []).map((b) => (typeof b === "string" ? b : b.id || b.branch_id)).filter(Boolean), [snap.branches]);
  const evals = run.evaluations || [];
  const personas = run.personas || [];
  const ids = branchIds.length ? branchIds : [...new Set(evals.map((e) => e.branch_id))];
  const [cell, setCell] = useState(null);
  const [pathOpen, setPathOpen] = useState(null);
  const prog = run.progress || { total: 0, succeeded: 0, failed: 0 };
  const done = prog.succeeded + prog.failed;
  const pct = prog.total ? Math.round((done / prog.total) * 100) : 0;
  const fullMatrix = run.status === "completed" && prog.total > 0 && prog.succeeded === prog.total && prog.failed === 0;
  const finished = ["completed", "partial", "failed", "cancelled"].includes(run.status);
  const stale = useMemo(() => {
    if (!snapNodes.length || !currentNodes) return false;
    const key = (ns) => JSON.stringify(ns.map((n) => [n.id, n.parent_id, n.title, n.text, n.is_end]).sort());
    return key(snapNodes) !== key(currentNodes) ||
      (currentGoal && JSON.stringify(snap.goal) !== JSON.stringify(currentGoal));
  }, [snapNodes, currentNodes, snap.goal, currentGoal]);
  const ev = (p, b) => evals.find((e) => e.persona_id === p && e.branch_id === b);
  const cellAvg = (e) => avg(SCORES.map(([k]) => e[k]).filter((x) => typeof x === "number"));
  const detail = cell && ev(cell.p, cell.b);
  const persona = (id) => personas.find((p) => p.id === id);
  const ranked = fullMatrix && run.rankings?.items ? [...run.rankings.items].sort((a, b) => a.rank - b.rank) : null;
  const g = snap.goal || {};

  return (
    <section className="ws-results" aria-label="Run results">
      <div className="row sp">
        <h3 className="serif" style={{ fontSize: 30 }}>Run results</h3>
        <span className={`chip st-${run.status}`}>{STATUS_LABEL[run.status] || run.status}</span>
      </div>
      {stale && <div className="note" role="note"><Info size={16} /><span><b>Frozen snapshot.</b> This run evaluated the story as it was when the run started. Your current tree has changed since, so these results do not describe the current draft.</span></div>}
      <Rubric />
      <div className="panel">
        <span className="mono">Progress, {done} of {prog.total} evaluations</span>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Evaluation progress"><i style={{ width: `${pct}%`, "--c": prog.failed ? "var(--ochre)" : "var(--teal)" }} /></div>
        <p className="ws-muted">{prog.succeeded} succeeded, {prog.failed} failed. {!finished && "Updating automatically."}</p>
        {run.error && <p className="err" role="alert">{run.error}</p>}
      </div>
      {finished && !fullMatrix && run.kind === "evaluation" && (
        <div className="banner" role="alert"><span><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> <b>Not a final ranking.</b> {run.status === "partial" || prog.failed ? `${prog.failed} of ${prog.total} evaluations failed, so the persona-by-branch matrix is incomplete.` : `This run ${run.status === "cancelled" ? "was cancelled" : "did not finish"}.`} Rankings are only shown for fully completed matrices. Partial reactions below are provided as-is.</span></div>
      )}
      <div className="panel">
        <span className="mono">Frozen goal</span>
        <p><b>Outcome:</b> {g.outcome || "n/a"} <br /><b>Audience:</b> {g.audience || "n/a"}, ages {g.age_min ?? "?"} to {g.age_max ?? "?"}{g.gender ? `, ${g.gender}` : ""}{g.nationality ? `, ${g.nationality}` : ""}<br /><b>Tone:</b> {g.tone || "n/a"} <br /><b>Constraints:</b> {g.constraints || "n/a"}</p>
      </div>
      {run.advisory && (
        <div className="panel ws-advisory">
          <span className="mono">AgenticOrg advisory, status: {run.advisory.status}</span>
          <p>{run.advisory.message || "No message."}</p>
          <p className="ws-muted">A single bounded advisory attempt made per evaluation run. Its failure never blocks the main Groq, LangChain and LangGraph workflow. Only completed advice may inform the ranking rationale; it never replaces persona evaluations.{run.advisory.run_id ? ` Reference ${run.advisory.run_id}.` : ""}</p>
        </div>
      )}
      {ranked && (
        <div className="panel">
          <span className="mono">Ranking, full matrix</span>
          <ol className="ws-rank">
            {ranked.map((r) => (
              <li key={r.branch_id}>
                <div className="row sp"><b style={{ fontSize: 18 }}>{r.rank}. {label(r.branch_id)}</b></div>
                <p>{r.rationale}</p>
                <div className="ws-cols"><div><b>Strengths</b><List items={r.strengths} /></div><div><b>Risks</b><List items={r.risks} /></div><div><b>Suggested edits</b><List items={r.suggested_edits} /></div></div>
              </li>
            ))}
          </ol>
          <div className="ws-cols">
            <div><b>Audience disagreement</b><p>{typeof run.rankings.audience_disagreement === "string" ? run.rankings.audience_disagreement : JSON.stringify(run.rankings.audience_disagreement)}</p></div>
            <div><b>Uncertainty</b><p>{typeof run.rankings.uncertainty === "string" ? run.rankings.uncertainty : JSON.stringify(run.rankings.uncertainty)}</p></div>
            <div><b>Suggested next edits</b><List items={run.rankings.suggested_next_edits} /></div>
          </div>
          <p className="ws-muted">Rankings summarise simulated reactions. They are not measured engagement.</p>
        </div>
      )}
      {ids.length > 0 && (
        <div className="panel">
          <span className="mono">Branch averages</span>
          <div className="tbl-wrap"><table className="tbl"><caption className="sr">Average scores per branch</caption>
            <thead><tr><th>Branch</th>{SCORES.map(([, l]) => <th key={l}>{l}</th>)}<th>Evaluated</th></tr></thead>
            <tbody>{ids.map((b) => { const es = evals.filter((e) => e.branch_id === b && e.status === "completed"); return (
              <tr key={b}><td><button className="linkbtn" onClick={() => setPathOpen(pathOpen === b ? null : b)} aria-expanded={pathOpen === b}>{label(b)}</button></td>
                {SCORES.map(([k]) => <td key={k}>{f1(avg(es.map((e) => e[k]).filter((x) => typeof x === "number")))}</td>)}
                <td>{es.length} of {personas.length || "?"}</td></tr>); })}</tbody></table></div>
          {pathOpen && snapNodes.length > 0 && <pre className="ws-path">{assemble(snapNodes, pathOpen).text}</pre>}
        </div>
      )}
      {personas.length > 0 && ids.length > 0 && (
        <div className="panel">
          <span className="mono">Persona by branch matrix</span>
          <div className="tbl-wrap"><table className="tbl ws-matrix"><caption className="sr">Each cell is a persona's evaluation of a branch. Select a cell for detail.</caption>
            <thead><tr><th>Persona</th>{ids.map((b) => <th key={b}>{label(b)}</th>)}</tr></thead>
            <tbody>{personas.map((p) => (
              <tr key={p.id}><th scope="row" style={{ fontWeight: 500, color: "var(--ink)" }}>{p.name}</th>
                {ids.map((b) => { const e = ev(p.id, b); const on = cell?.p === p.id && cell?.b === b; return (
                  <td key={b}>{!e ? <span className="chip">Pending</span> : (
                    <button className={`cellbtn ${e.status === "failed" ? "bad" : ""} ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setCell(on ? null : { p: p.id, b })} title={e.status === "failed" ? e.error : undefined}>
                      {e.status === "failed" ? "Failed" : f1(cellAvg(e))}</button>)}</td>); })}</tr>))}</tbody></table></div>
          <p className="ws-muted">Cell values are the mean of four 1 to 5 scores.</p>
        </div>
      )}
      {detail && (
        <div className="panel" aria-live="polite">
          <div className="row sp"><b style={{ fontSize: 18 }}>{persona(cell.p)?.name} on {label(cell.b)}</b><button className="btn ghost sm" onClick={() => setCell(null)}>Close detail</button></div>
          {detail.status === "failed" ? <p className="err">This evaluation failed: {detail.error || "no reason given"}.</p> : (
            <>
              <p style={{ fontSize: 17 }}>{detail.reaction}</p>
              <div className="row">{SCORES.map(([k, l]) => <span key={k} className="chip acc">{l}: {detail[k]} of 5</span>)}</div>
              <div className="ws-cols">
                <div><b>Emotional trajectory</b><List items={detail.emotional_trajectory} /></div>
                <div><b>Attention and drop-off</b><List items={detail.attention_points} /></div>
                <div><b>Objections</b><List items={detail.objections} /></div>
                <div><b>Revisions</b><List items={detail.revisions} /></div>
              </div>
              <b>Evidence from the story</b>
              {detail.evidence?.length ? detail.evidence.map((x, i) => <blockquote key={i} className="ws-quote">&ldquo;{x.quote}&rdquo;<footer>{x.explanation}</footer></blockquote>) : <p className="ws-muted">None reported.</p>}
            </>
          )}
        </div>
      )}
      {personas.length > 0 && (
        <details className="panel ws-personas"><summary>Personas ({personas.length}), simulated and generated for this run</summary>
          <div className="ws-pgrid">{personas.map((p) => (
            <article key={p.id} className="ws-pcard"><b>{p.name}</b>
              {[["Reading style", p.reading_style], ["Motivations", p.motivations], ["Genre preferences", p.genre_preferences], ["Attention pattern", p.attention_pattern], ["Skepticism", p.skepticism], ["Accessibility needs", p.accessibility_needs], ["Goal connection", p.goal_connection]].map(([k, v]) => v ? <p key={k}><span className="ws-muted">{k}:</span> {Array.isArray(v) ? v.join(", ") : v}</p> : null)}
            </article>))}</div></details>
      )}
    </section>
  );
}
