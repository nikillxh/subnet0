"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/market", label: "Market" },
  { href: "/participate", label: "Participate" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          SUBNET<span>0</span>
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href ? "active" : ""}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <WalletButton />
      </div>
    </nav>
  );
}
