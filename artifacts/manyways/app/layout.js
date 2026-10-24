import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "ManyWays | Explore every version before it goes live",
  description:
    "ManyWays is a creative experimentation workspace. Branch your writing into alternate versions, define an audience, and compare trade-offs before you publish.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInForceRedirectUrl="/workspace" signUpForceRedirectUrl="/workspace" afterSignOutUrl="/">{children}</ClerkProvider></body>
    </html>
  );
}
