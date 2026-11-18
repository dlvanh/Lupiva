import type { Metadata } from "next";
import { Open_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LupivaProvider } from "@/context/LupivaContext";
import { Navbar } from "@/components/Navbar";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title:
    "Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City — SLE Clinical Registry",
  description:
    "Hệ thống Đăng ký Lâm sàng Lupus Ban Đỏ Hệ Thống (SLE Clinical Registry) thuộc Trung tâm Miễn dịch - Dị ứng Bệnh viện Đa khoa Quốc tế Vinmec Times City.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${openSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <LupivaProvider>
          <Navbar />
          <div className="flex-1 flex flex-col">{children}</div>
        </LupivaProvider>
      </body>
    </html>
  );
}
