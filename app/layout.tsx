import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const image = new URL("/og.png", base).toString();
  const title = "ReSync";
  const description =
    "A curated video and reading feed that moves intentional choices through Inbox, cooldown, and Queue.";

  return {
    metadataBase: base,
    title,
    description,
    icons: {
      icon: [
        { url: "/resync-icon.svg", type: "image/svg+xml" },
        { url: "/downloads/extension/icons/icon32.png", type: "image/png", sizes: "32x32" },
        { url: "/downloads/extension/icons/icon128.png", type: "image/png", sizes: "128x128" },
      ],
      shortcut: "/resync-icon.svg",
      apple: [{ url: "/downloads/extension/icons/icon128.png", sizes: "128x128" }],
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, width: 1658, height: 949, alt: "ReSync library" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
