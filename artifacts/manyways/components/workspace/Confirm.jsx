"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useConfirm() {
  const [req, setReq] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setReq({ ...opts, resolve })), []);
  const close = (v) => { req.resolve(v); setReq(null); };
  const dialog = req ? <ConfirmDialog req={req} close={close} /> : null;
  return { confirm, dialog };
}

function ConfirmDialog({ req, close }) {
  const cancel = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    cancel.current?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKey = (e) => {
    if (e.key === "Escape") close(false);
    if (e.key === "Tab") {
      const f = e.currentTarget.querySelectorAll("button");
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  return (
    <div className="wk-scrim" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="wk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-d" onKeyDown={onKey}>
        <h3 id="cf-t">{req.title}</h3>
        <p id="cf-d">{req.body}</p>
        <div className="wk-row end">
          <button ref={cancel} className="wk-btn ghost" onClick={() => close(false)}>{req.cancel || "Keep editing"}</button>
          <button className={"wk-btn" + (req.danger ? " danger" : "")} onClick={() => close(true)}>{req.ok || "Continue"}</button>
        </div>
      </div>
    </div>
  );
}
