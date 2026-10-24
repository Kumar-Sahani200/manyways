import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Story workspace | ManyWays" };

export default async function WorkspaceLayout({ children }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return children;
}
