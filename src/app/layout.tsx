import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans/opsz.css"; // weight + optical size axes
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "The Velvet Store", template: "%s · The Velvet Store" },
  description: "Inventory for The Velvet Store",
  icons: {
    icon: [{ url: "/icon.svg?v=velvet2", type: "image/svg+xml" }, { url: "/favicon-32.png?v=velvet2", sizes: "32x32", type: "image/png" }],
    apple: "/apple-touch-icon.png?v=velvet2",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#9e1018",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <div className="app-backdrop" aria-hidden />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
