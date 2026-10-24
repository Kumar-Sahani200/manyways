import { SignUp } from "@clerk/nextjs";
import SetupNotice from "../../../components/SetupNotice";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return <SetupNotice />;
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
    <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/workspace" />
  </main>;
}
