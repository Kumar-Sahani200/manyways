import { redirect } from "next/navigation";

export const metadata = { title: "Studio | ManyWays" };

export default function StudioPage() {
  redirect("/workspace");
}
