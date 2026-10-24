"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Logo from "./Logo";

const links = [
  ["#problem", "Why"],
  ["#method", "Method"],
  ["#branches", "Branching"],
  ["#intelligence", "Intelligence"],
  ["#honesty", "Honesty"],
  ["#faq", "FAQ"],
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [sc, setSc] = useState(false);
  useEffect(() => {
    const f = () => setSc(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <header className={`nav ${sc ? "scrolled" : ""}`}>
      <div className="wrap nav-in">
        <Link href="/" className="logo" aria-label="ManyWays home"><Logo /> ManyWays</Link>
        <nav className={`nav-links ${open ? "open" : ""}`} aria-label="Primary">
          {links.map(([h, l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)}>{l}</a>
          ))}
          <Link href="/studio" onClick={() => setOpen(false)}>Studio</Link>
        </nav>
        <div className="nav-right">
          <Link href="/studio?sample=1" className="btn ghost sm">Try the sample</Link>
          <Link href="/studio" className="btn sm">Open Studio <ArrowUpRight size={14} /></Link>
          <button className="burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
