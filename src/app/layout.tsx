import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { PwaRegister } from "@/components/pwa-register";

// Memuat font Inter
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Kavia", template: "%s · Kavia" },
  description: "Dashboard keuangan pribadi minimalis.",
  manifest: "/manifest.webmanifest",
  applicationName: "Kavia",
   icons: {
    icon: "/icons/icon-32.png", // <-- Menghilangkan error favicon.ico 404
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1218" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      {/* Pastikan className di body sudah seperti ini */}
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>{children}<PwaRegister /></ThemeProvider>
      </body>
    </html>
  );
}