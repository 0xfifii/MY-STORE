import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans"; // text: close to Garnett, has the ₦ sign
import "@fontsource-variable/fraunces/full.css"; // headings and the wordmark: heavy soft serif (SOFT axis)
import "@fontsource-variable/inter/opsz.css"; // fallback for anything Plus Jakarta Sans lacks
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "Palm Store", template: "%s · Palm Store" },
  description: "Palm Store. Every Valuable, Accounted For.",
  icons: {
    icon: [{ url: "/icon.svg?v=palm3", type: "image/svg+xml" }, { url: "/favicon-32.png?v=palm3", sizes: "32x32", type: "image/png" }],
    apple: "/apple-touch-icon.png?v=palm3",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#C4553A",
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
