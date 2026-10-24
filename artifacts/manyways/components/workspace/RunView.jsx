"use client";
import { useState } from "react";
import { AlertTriangle, Ban, Check, Loader2, RefreshCw } from "lucide-react";
import { fmt, isActive, when } from "./lib";

const SCORES = [["comprehension", "Comprehension"], ["credibility", "Credibility"], ["memorability", "Memorability"], ["goalFit", "Goal fit"]];
const List = ({ title, items }) => items?.length ? (<div><span className="wk-lbl">{title}</span><ul className="wk-ul">{items.map((x, i) => <li key={i}>{fmt(x)}</li>)}</ul></div>) : null;

export default function RunView({ run, outdated, dirty, onCancel, onApply, onRetry, busy }) {
  const [persona, setPersona] = useState("all");
  const titleOf = (id) => run.snapshot?.nodes?.find((n) => n.id === id)?.title || run.snapshot?.paths?.find?.((p) => p.id === id)?.title || id;
  const pct = run.total ? Math.min(100, Math.round((run.progress / run.total) * 100)) : 0;
  const active = isActive(run);
  const pname = (id) => run.personas?.find((p) => p.id === id)?.name || id;
  const evals = (run.evaluations || []).filter((e) => persona === "all" || e.personaId === persona);
  const rk = run.ranking;

  return (
    <div className="wk-stack">
      <div className="wk-panel">
        <div className="wk-row sp">
          <div>
            <span className="wk-lbl">{run.kind === "generate" ? "Generated draft" : "Simulated reading"} - {when(run.createdAt)}</span>
            <h3 className="wk-h3"><span className={"wk-status " + run.status}>{run.status}</span>{run.stage ? <em> {run.stage}</em> : null}</h3>
          </div>
          <div className="wk-row">
            {active && <button className="wk-btn ghost sm" disabled={busy} onClick={onCancel}><Ban size={14} /> Cancel run</button>}
            {!active && run.status !== "completed" && <button className="wk-btn ghost sm" onClick={onRetry}><RefreshCw size={14} /> Start a new run</button>}
          </div>
        </div>
        {(active || run.total > 0) && (
          <div>
            <div className="wk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={run.total || 100} aria-valuenow={run.progress || 0} aria-label="Run progress"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
            <small className="wk-dim">{run.progress}/{run.total} steps {active && <Loader2 size={12} className="wk-spin" />}</small>
          </div>
        )}
        {run.error && <div className="wk-banner" role="alert"><AlertTriangle size={16} /> {run.error}</div>}
        {run.status === "partial" && <div className="wk-note"><AlertTriangle size={16} /> Partial results: some persona readings did not finish. No final ranking was generated. New runs are never started automatically.</div>}
        {outdated && <div className="wk-note"><AlertTriangle size={16} /> Outdated: the story or goal has been edited since this run. Results describe the earlier snapshot.</div>}
      </div>

      {run.kind === "generate" && run.status === "completed" && (
        <div className="wk-panel">
          <h3 className="wk-h3">{run.generatedNodes?.length || 0} generated nodes</h3>
          <ul className="wk-gen">{(run.generatedNodes || []).map((n) => <li key={n.id} className={n.kind}><b>{n.title}</b><span>{n.kind}</span><p>{(n.text || "").slice(0, 220)}{(n.text || "").length > 220 ? "..." : ""}</p></li>)}</ul>
          <p className="wk-dim">Your current story stays untouched until you apply this draft. Applying replaces the current tree.</p>
          <div className="wk-row"><button className="wk-btn" disabled={busy} onClick={onApply}><Check size={15} /> Apply to project{dirty ? " (discards unsaved edits)" : ""}</button></div>
        </div>
      )}

      {run.kind === "evaluate" && (rk || run.evaluations?.length > 0) && (
        <>
          <div className="wk-note sim">Simulated personas, not real readers. These results show how invented readers might disagree, and are not predictions of actual audience behavior.</div>
          {rk && (
            <div className="wk-panel">
              <h3 className="wk-h3">Ranking</h3>
              <ol className="wk-rank">
                {[...(rk.rankings || [])].sort((a, b) => a.rank - b.rank).map((r) => (
                  <li key={r.branchId}>
                    <div className="wk-row sp"><b><span className="wk-rn">{r.rank}</span> {titleOf(r.branchId)}</b><span className="wk-mono">{fmt(r.score)}</span></div>
                    <div className="wk-bar"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, Number(r.score) / 10 || 0))})` }} /></div>
                    <p>{r.rationale}</p>
                    <div className="wk-cols"><List title="Strengths" items={r.strengths} /><List title="Risks" items={r.risks} /><List title="Suggested edits" items={r.suggestedEdits} /></div>
                  </li>
                ))}
              </ol>
              <div className="wk-cols two">
                <div className="wk-tile"><span className="wk-lbl">Where personas disagree</span><p>{fmt(rk.disagreement)}</p></div>
                <div className="wk-tile"><span className="wk-lbl">Uncertainty</span><p>{fmt(rk.uncertainty)}</p></div>
              </div>
            </div>
          )}
          <div className="wk-panel">
            <div className="wk-row sp">
              <h3 className="wk-h3">Reactions</h3>
              <label className="wk-sel"><span className="wk-sr">Filter by persona</span>
                <select value={persona} onChange={(e) => setPersona(e.target.value)}>
                  <option value="all">All {run.personas?.length || 0} personas</option>
                  {(run.personas || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            {persona !== "all" && (() => { const p = run.personas.find((x) => x.id === persona); return p ? <div className="wk-tile"><b>{p.name}</b><p>{p.readingStyle}</p><p className="wk-dim">Motivation: {p.motivation}. Skepticism: {fmt(p.skepticism)}. Attention: {fmt(p.attention)}. {fmt(p.preferences)}</p></div> : null; })()}
            {evals.map((e, i) => (
              <details className="wk-eval" key={e.personaId + e.branchId + i}>
                <summary><b>{pname(e.personaId)}</b><span>on {titleOf(e.branchId)}</span>
                  <span className="wk-chips">{SCORES.map(([k, l]) => <i key={k} title={l}>{l.slice(0, 4)} {fmt(e[k])}</i>)}</span></summary>
                <p>{e.reaction}</p>
                <div className="wk-scores">{SCORES.map(([k, l]) => <div key={k}><span className="wk-lbl">{l}</span><div className="wk-bar"><i style={{ transform: `scaleX(${(Number(e[k]) || 0) / 10})` }} /></div></div>)}</div>
                <List title="Emotional trajectory" items={e.emotionalTrajectory} />
                <List title="Drop-off points" items={e.dropOffPoints} />
                {e.evidence?.length > 0 && <div><span className="wk-lbl">Evidence</span>{e.evidence.map((v, j) => <blockquote key={j}>{v.quote}<cite>{v.interpretation}</cite></blockquote>)}</div>}
                <List title="Objections" items={e.objections} />
                <List title="Revisions" items={e.revisions} />
              </details>
            ))}
            {evals.length === 0 && <p className="wk-dim">No reactions recorded for this filter.</p>}
          </div>
        </>
      )}
    </div>
  );
}
