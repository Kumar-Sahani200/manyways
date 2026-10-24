import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "../../../components/Logo";

export const dynamic = "force-dynamic";
export default async function SignUpPage() {
  const { userId } = await auth();
  if (userId) redirect("/workspace");
  return <main className="auth-page"><Link href="/" className="logo"><Logo /> ManyWays</Link><div className="page-h"><span className="mono">A space for every version</span><h1 style={{ fontSize: 52 }}>Make room for another ending.</h1><p className="lead">Create an account to keep your projects and explore your story’s possibilities.</p></div><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/workspace" /></main>;
}
