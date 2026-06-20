import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subnet0 - Intelligence Market",
  description: "On-chain Yuma Consensus incentive market for AI agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
