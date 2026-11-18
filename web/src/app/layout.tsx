import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LupivaProvider } from "@/context/LupivaContext";
import { Navbar } from "@/components/Navbar";
import { NewSubmissionWatcher } from "@/components/NewSubmissionWatcher";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Lupiva — Intelligent SLE Clinical Registry & Lab Document OCR",
  description:
    "Standardized Systemic Lupus Erythematosus (SLE) e-CRF registry and Physician-in-the-Loop lab report OCR platform built for the Vinmec Innovation Challenge 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${jakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <LupivaProvider>
          <Navbar />
          <NewSubmissionWatcher />
          <div className="flex-1 flex flex-col">{children}</div>
        </LupivaProvider>
      </body>
    </html>
  );
}
