import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans"; // text: close to Garnett, has the ₦ sign
import "@fontsource-variable/playfair-display"; // headings, as on palmspringsocialeatery.com
import "@fontsource-variable/inter/opsz.css"; // fallback for anything Plus Jakarta Sans lacks
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { THEME_BOOT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "Palm Store", template: "%s · Palm Store" },
  description: "Palm Store. Every Valuable, Accounted For.",
  icons: {
    icon: [{ url: "/icon.svg?v=palm6", type: "image/svg+xml" }, { url: "/favicon-32.png?v=palm6", sizes: "32x32", type: "image/png" }],
    apple: "/apple-touch-icon.png?v=palm6",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#C65A29",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Applies the saved Light / Dark / Auto choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <div className="app-backdrop" aria-hidden />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
