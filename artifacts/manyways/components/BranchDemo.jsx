"use client";
import { useState } from "react";

const V = [
  { id: "o", name: "Original", note: "Preserved, never overwritten", color: "#17160f",
    text: "I have been a software engineer for six years. Here are five lessons I wish I had known when I started.\n\nLesson one: read other people's code before writing your own." },
  { id: "a", name: "Version A", note: "Branch: curiosity-led opening", color: "#ee4a1c",
    text: "The best code review I ever got was one sentence long.\n\nIt took me six years to understand why it worked. Here are the five lessons hiding inside it." },
  { id: "b", name: "Version B", note: "Branch: practical, list-first", color: "#0e7a6b",
    text: "Five habits that would have saved me my first two years as an engineer:\n\n1. Read other people's code first.\n2. Ask the dull question early." },
];

export default function BranchDemo() {
  const [i, setI] = useState(1);
  const v = V[i];
  return (
    <div className="demo-grid">
      <div className="tabs" role="tablist" aria-label="Versions">
        {V.map((x, k) => (
          <button key={x.id} role="tab" className="tab" aria-selected={i === k} onClick={() => setI(k)}>
            <span className="dot" style={{ background: x.color === "#17160f" ? "#a9a597" : x.color }} />
            <span>{x.name}<small>{x.note}</small></span>
          </button>
        ))}
      </div>
      <div className="doc" role="tabpanel" key={v.id} style={{ animation: "rise .4s both" }}>
        <div className="row sp">
          <span className="chip" style={{ borderColor: v.color }}><span className="dot" style={{ background: v.color, width: 8, height: 8 }} />{v.name}</span>
          <span className="mono">Illustrative copy</span>
        </div>
        <p className="body">{v.text}</p>
        <p className="mono">{i === 0 ? "Parent: none" : "Parent: Original"}</p>
      </div>
    </div>
  );
}
