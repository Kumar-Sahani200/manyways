"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Logo from "./Logo";
import { appEntry } from "../lib/app-url";

const links = [
  ["#problem", "Why"],
  ["#method", "Method"],
  ["#branches", "Branching"],
  ["#intelligence", "Intelligence"],
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
        </nav>
        <div className="nav-right">
          <Link href={appEntry} className="btn sm">Open workspace <ArrowUpRight size={14} /></Link>
          <button className="burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
