import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeverGraph — The Negative Specification Compiler",
  description:
    "Recover what your software has learned must never happen, compile it into a machine-evaluable forbidden condition, and prove whether a change makes it reachable.",
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
