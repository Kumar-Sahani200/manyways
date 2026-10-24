import Link from "next/link";
import Logo from "./Logo";

export default function SetupNotice() {
  return <main className="wrap" style={{ paddingBlock: 100, maxWidth: 720 }}>
    <Link className="logo" href="/"><Logo /> ManyWays</Link>
    <p className="mono" style={{ marginTop: 50 }}>Workspace configuration</p>
    <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)" }}>A secure space for <span className="it">every possibility.</span></h1>
    <p className="lead">Sign-in is not configured in this environment yet. The workspace stays protected until Clerk is connected.</p>
    <p>Add the Clerk publishable and secret keys through environment settings, then restart the app. Never paste secret keys into source code.</p>
    <Link href="/" className="btn" style={{ marginTop: 24 }}>Back to ManyWays</Link>
  </main>;
}
