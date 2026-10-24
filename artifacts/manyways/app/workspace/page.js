import Workspace from "../../components/workspace/Workspace";
import "./workspace.css";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SetupNotice from "../../components/SetupNotice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workspace | ManyWays", robots: { index: false, follow: false } };

export default async function WorkspacePage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return <SetupNotice />;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <Workspace />;
}
