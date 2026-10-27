import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

/**
 * metadataBase is what turns the relative image path Next generates into the
 * absolute https:// URL every social platform requires — a relative og:image is
 * silently ignored, which looks identical to having no card at all. Set
 * NEXT_PUBLIC_SITE_URL in the deploy environment; localhost is only the
 * fallback so previews still resolve while developing.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const TITLE = "RunGuard: See the injury coming before it happens";
const DESCRIPTION =
  "Athlete monitoring for high school running teams. RunGuard syncs your athletes' watches, tracks every runner's training load, and flags who's at risk: before practice even starts.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    // Every other page gets "<page> · RunGuard" without repeating the promise.
    template: "%s · RunGuard",
  },
  description: DESCRIPTION,
  applicationName: "RunGuard",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "RunGuard",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    // summary_large_image is the difference between a postage stamp beside the
    // text and a full-width card. It is one line and it changes the click rate
    // more than anything else on this page.
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
