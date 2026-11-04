import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const body = Figtree({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Bertha Services", template: "%s · Bertha Services" },
  description: "Procurement, orders and stock for hotels and restaurants in Abuja.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
