import Link from "next/link";
import { ArrowRight, GitBranch, Layers, Users, Scale, Check, X as XIcon, Sparkles, Compass } from "lucide-react";
import Nav from "../components/Nav";
import Logo from "../components/Logo";
import Reveal from "../components/Reveal";
import BranchDemo from "../components/BranchDemo";

const marquee = ["Branch the draft", "Hold the original", "Name the audience", "Weigh the trade-offs", "Choose with a reason", "Publish with intent"];

const faqs = [
  ["Does ManyWays run a live simulation today?", "Not yet. This frontend is an early prototype. The report in Studio is an illustrative sample that is not generated from your content. Your projects are saved only in this browser."],
  ["Will it predict my engagement?", "No. ManyWays is designed to help you explore likely reactions and trade-offs. It is not a substitute for testing with real people, and it will never promise performance."],
  ["Who is it for?", "Writers and creators making two kinds of decisions: social content such as posts and hooks, and storytelling such as scenes and character choices."],
  ["Where does my work go?", "In this prototype, nowhere. Everything lives in your browser's local storage. Clearing site data removes it."],
  ["Can I edit the original?", "The original is kept intact by design. To change it, duplicate it into a branch and edit the branch. Lineage is tracked with a parent for every version."],
];

function Tree() {
  return (
    <svg className="tree float" viewBox="0 0 520 460" role="img" aria-label="A single original draft branching into three alternate versions">
      <path d="M60 230 C 160 230, 180 90, 300 90 S 420 90, 460 90" stroke="#ee4a1c" />
      <path d="M60 230 C 200 230, 240 230, 460 230" stroke="#17160f" />
      <path d="M60 230 C 160 230, 200 370, 300 370 S 420 370, 460 370" stroke="#0e7a6b" />
      <path d="M300 90 C 340 90, 350 160, 400 165" stroke="#b8860b" />
      <g className="node n1"><circle cx="60" cy="230" r="14" fill="#17160f" /><text x="60" y="270" textAnchor="middle" fontSize="12" fill="#55524a" fontFamily="var(--mono)">ORIGINAL</text></g>
      <g className="node n2"><rect x="400" y="62" width="110" height="56" rx="12" fill="#fbf9f4" stroke="#ee4a1c" /><text x="414" y="86" fontSize="11" fill="#8b877b" fontFamily="var(--mono)">VERSION A</text><text x="414" y="106" fontSize="14" fill="#17160f">Sharper hook</text></g>
      <g className="node n3"><rect x="400" y="202" width="110" height="56" rx="12" fill="#fbf9f4" stroke="#17160f" /><text x="414" y="226" fontSize="11" fill="#8b877b" fontFamily="var(--mono)">KEPT</text><text x="414" y="246" fontSize="14" fill="#17160f">Original</text></g>
      <g className="node n4"><rect x="400" y="342" width="110" height="56" rx="12" fill="#fbf9f4" stroke="#0e7a6b" /><text x="414" y="366" fontSize="11" fill="#8b877b" fontFamily="var(--mono)">VERSION B</text><text x="414" y="386" fontSize="14" fill="#17160f">List first</text></g>
      <g className="node n4"><rect x="360" y="150" width="110" height="46" rx="12" fill="#fbf9f4" stroke="#b8860b" /><text x="372" y="170" fontSize="10" fill="#8b877b" fontFamily="var(--mono)">A, FORKED</text><text x="372" y="187" fontSize="13" fill="#17160f">Warmer tone</text></g>
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <div className="pill"><i /> Early prototype &middot; Emergent Intelligence for creative decisions</div>
              <h1>Explore <span className="it">every version</span> before it goes live.</h1>
              <p className="lead">ManyWays is a workspace where writers and creators branch a draft into alternates, describe the people it is for, and weigh the trade-offs, so the version you publish is a choice, not a guess.</p>
              <div className="cta-row">
                <Link href="/studio" className="btn">Start an experiment <ArrowRight size={16} /></Link>
                <Link href="/studio?sample=1" className="btn ghost">Load a sample project</Link>
              </div>
              <p className="fine">Prototype note: reports in Studio are illustrative samples. Nothing is analysed live and projects stay in your browser.</p>
            </div>
            <Tree />
          </div>
          <div className="strip" aria-hidden="true">
            <div className="strip-track">
              {[...marquee, ...marquee, ...marquee, ...marquee].map((m, k) => (<span key={k}>{m} <b>/</b></span>))}
            </div>
          </div>
        </section>

        <section className="s" id="problem">
          <div className="wrap problem">
            <Reveal className="sec-head">
              <span className="mono">01 / The problem</span>
              <h2>Creative decisions are made on <span className="it">instinct</span> and one friend&apos;s opinion.</h2>
              <p className="lead">You write one draft, polish it, and publish. The alternatives you never wrote stay invisible. ManyWays makes them tangible while changing course is still free.</p>
            </Reveal>
            <Reveal className="stack" delay={120}>
              <div className="stat"><strong>One draft, one shot</strong><p>Most posts and scenes ship as the first version that felt finished.</p></div>
              <div className="stat"><strong>Feedback arrives too late</strong><p>Real reactions come after publishing, when the choice is already made.</p></div>
              <div className="stat"><strong>Generating again is not deciding</strong><p>Another draft adds options. It does not tell you which one fits your audience, or what you give up.</p></div>
            </Reveal>
          </div>
        </section>

        <section className="s" id="method" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="sec-head">
              <span className="mono">02 / Method</span>
              <h2>Four steps from a draft to a <span className="it">decision</span>.</h2>
            </Reveal>
            <Reveal className="steps">
              {[
                ["1", "Create", "Paste a draft, pick Social Content or Storytelling, or start from a sample."],
                ["2", "Branch", "Duplicate any version, rename it, edit it. The original stays untouched."],
                ["3", "Set the audience", "Describe who it is for, their ages, the tone, the outcome, and how you measure success."],
                ["4", "Compare", "Select up to three versions and read strengths, risks, reactions, and a recommendation."],
              ].map(([n, t, d]) => (
                <div className="step" key={n}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></div>
              ))}
            </Reveal>
          </div>
        </section>

        <section className="s" id="branches" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="demo">
              <span className="mono">03 / Branching</span>
              <h2 style={{ marginTop: 14, maxWidth: 720 }}>One idea, many <span className="it">ways</span> to say it.</h2>
              <BranchDemo />
            </Reveal>
          </div>
        </section>

        <section className="s" id="intelligence" style={{ paddingTop: 0 }}>
          <div className="wrap intel">
            <Reveal>
              <div className="orbit" role="img" aria-label="A draft at the center surrounded by three audience perspectives">
                <div className="ring" /><div className="ring r2" /><div className="ring r3" />
                <div className="core">draft</div>
                <div className="persona" style={{ top: "2%", left: "36%" }}><b>The skeptic</b>What is the claim?</div>
                <div className="persona" style={{ top: "62%", left: "-2%" }}><b>The newcomer</b>Is this for me?</div>
                <div className="persona" style={{ top: "70%", right: "-2%" }}><b>The loyalist</b>Does it sound like you?</div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <span className="mono">04 / Emergent Intelligence</span>
              <h2 style={{ margin: "14px 0 20px" }}>Perspectives that <span className="it">emerge</span> when a draft meets an audience.</h2>
              <p className="lead">Instead of one score, ManyWays is built around a panel of audience viewpoints. Insight comes from where they agree, where they split, and what each version costs you.</p>
              <div className="list">
                <div><Users size={18} /><span><strong>Audience first</strong>Description, age range, style, outcome, and success metric frame every comparison.</span></div>
                <div><Scale size={18} /><span><strong>Trade-offs over rankings</strong>Qualitative fit and honest risks rather than false precision.</span></div>
                <div><Compass size={18} /><span><strong>Reasoned recommendation</strong>A suggested version with the rationale and what to watch for.</span></div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="s" id="modes" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="sec-head">
              <span className="mono">05 / Two disciplines, one workflow</span>
              <h2>For the post you publish and the <span className="it">scene</span> you write.</h2>
            </Reveal>
            <div className="modes">
              <Reveal className="mode">
                <Layers size={22} color="#ee4a1c" />
                <h3>Social Content</h3>
                <p className="lead" style={{ fontSize: 16 }}>LinkedIn posts, launch copy, hooks and messaging.</p>
                <ul><li>Compare openings and tone</li><li>Weigh clarity against curiosity</li><li>Check promotional risk</li></ul>
              </Reveal>
              <Reveal className="mode alt" delay={100}>
                <GitBranch size={22} color="#ee4a1c" />
                <h3>Storytelling</h3>
                <p className="lead" style={{ fontSize: 16 }}>Scenes, excerpts, and character decisions.</p>
                <ul><li>Fork a scene into directions</li><li>Compare resonance and pacing</li><li>Keep every lineage</li></ul>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="s" id="honesty" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="sec-head">
              <span className="mono">06 / Honesty</span>
              <h2>What this is, and what it is <span className="it">not</span>.</h2>
            </Reveal>
            <Reveal className="honest">
              <div className="hbox"><h3><Check size={16} color="#0e7a6b" /> ManyWays helps you</h3>
                <ul><li>Keep the original beside every alternative</li><li>Name the audience and the goal in writing</li><li>See trade-offs before you commit</li><li>Choose a version with a stated reason</li></ul></div>
              <div className="hbox"><h3><XIcon size={16} color="#b3261e" /> ManyWays does not</h3>
                <ul><li>Guarantee real-world engagement</li><li>Replace testing with real people</li><li>Present sample reports as live analysis</li><li>Send your drafts anywhere in this prototype</li></ul></div>
            </Reveal>
          </div>
        </section>

        <section className="s" id="faq" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="sec-head"><span className="mono">07 / Questions</span><h2>Plainly answered.</h2></Reveal>
            <Reveal className="faq">
              {faqs.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
            </Reveal>
          </div>
        </section>

        <section style={{ paddingTop: 0 }}>
          <div className="wrap">
            <Reveal className="final">
              <Sparkles size={26} color="#ee4a1c" />
              <h2 style={{ maxWidth: 720 }}>Write the version you <span className="it">did not</span> write yet.</h2>
              <p className="lead">Open Studio, load the sample, and walk through all four steps in about two minutes.</p>
              <div className="cta-row" style={{ justifyContent: "center" }}>
                <Link href="/studio?sample=1" className="btn">Open the sample experiment <ArrowRight size={16} /></Link>
                <Link href="/studio" className="btn ghost">Start from blank</Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <footer>
        <div className="wrap foot">
          <span className="logo" style={{ fontSize: 15 }}><Logo size={22} /> ManyWays</span>
          <nav aria-label="Footer"><a href="#problem">Why</a><a href="#method">Method</a><a href="#faq">FAQ</a><Link href="/studio">Studio</Link></nav>
          <span>Early prototype. Sample reports are illustrative.</span>
        </div>
      </footer>
    </>
  );
}
