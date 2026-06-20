import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "./components/Nav";

export const metadata: Metadata = {
  title: "Subnet0 - Intelligence Market",
  description: "On-chain Yuma Consensus incentive market for AI agents on Monad",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
