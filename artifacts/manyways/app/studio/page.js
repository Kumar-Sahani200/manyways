import { redirect } from "next/navigation";
import { appEntry } from "../../lib/app-url";
export default function LegacyStudio() { redirect(appEntry); }
