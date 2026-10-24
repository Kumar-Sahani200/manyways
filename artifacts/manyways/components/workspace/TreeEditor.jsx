"use client";
import { Plus, CornerDownRight, Flag, Trash2, GitBranch } from "lucide-react";
import { LIMITS, childrenMap, depthOf } from "./lib";

export default function TreeEditor({ nodes, selectedId, onSelect, onAddChild, onAddSibling, onAddEnd, onDelete }) {
  const cm = childrenMap(nodes);
  const root = nodes.find((n) => n.parentId == null);
  const full = nodes.length >= LIMITS.nodes;
  const ends = nodes.filter((n) => n.kind === "end").length;
  if (!root) return <p className="wk-err">This project has no root section.</p>;

  const Branch = ({ node }) => {
    const kids = cm.get(node.id) || [];
    const d = depthOf(nodes, node.id);
    const isEnd = node.kind === "end";
    const sel = node.id === selectedId;
    const noChild = full || d >= LIMITS.depth;
    const why = full ? "Node limit reached" : d >= LIMITS.depth ? "Depth limit reached" : "";
    return (
      <li className="wk-tn">
        <div className={"wk-node" + (sel ? " sel" : "") + (isEnd ? " end" : "")}>
          <button className="wk-node-main" aria-label={`${isEnd ? "End" : node.parentId == null ? "Root" : "Section"} ${node.title || "Untitled"}`} onClick={() => onSelect(node.id)} aria-current={sel ? "true" : undefined}>
            <span className="wk-kind">{isEnd ? "End" : node.parentId == null ? "Root" : "Section"}</span>
            <b>{node.title || "Untitled"}</b>
            <small>{(node.text || "").length.toLocaleString()} chars</small>
          </button>
          <div className="wk-node-act">
            {!isEnd && (
              <>
                <button className="wk-ic" disabled={noChild} title={why || "Add child section"} aria-label={`Add child section under ${node.title}`} onClick={() => onAddChild(node.id)}><CornerDownRight size={15} /></button>
                <button className="wk-ic" disabled={noChild || ends >= LIMITS.paths} title={ends >= LIMITS.paths ? "Complete path limit reached" : why || "End story here"} aria-label={`End story after ${node.title}`} onClick={() => onAddEnd(node.id)}><Flag size={15} /></button>
              </>
            )}
            {node.parentId != null && (
              <>
                <button className="wk-ic" disabled={full} title={full ? "Node limit reached" : "Add sibling section"} aria-label={`Add sibling of ${node.title}`} onClick={() => onAddSibling(node.id)}><Plus size={15} /></button>
                <button className="wk-ic del" aria-label={`Delete ${node.title} and everything below`} title="Delete subtree" onClick={() => onDelete(node.id)}><Trash2 size={15} /></button>
              </>
            )}
          </div>
        </div>
        {kids.length > 0 && <ul className="wk-branch">{kids.map((k) => <Branch key={k.id} node={k} />)}</ul>}
      </li>
    );
  };

  return (
    <div>
      <div className="wk-meta"><GitBranch size={14} /> {nodes.length}/{LIMITS.nodes} nodes - {ends}/{LIMITS.paths} endings</div>
      <ul className="wk-tree" aria-label="Story tree"><Branch node={root} /></ul>
    </div>
  );
}
