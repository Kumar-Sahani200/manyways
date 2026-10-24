import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "../../../components/Logo";

export const dynamic = "force-dynamic";
export default async function SignInPage() {
  const { userId } = await auth();
  if (userId) redirect("/workspace");
  return <main className="auth-page"><Link href="/" className="logo"><Logo /> ManyWays</Link><div className="page-h"><span className="mono">Emergent Intelligence</span><h1 style={{ fontSize: 52 }}>Your next story starts here.</h1><p className="lead">Sign in to save your writing, explore alternate endings, and compare simulated reader perspectives.</p></div><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/workspace" /></main>;
}
