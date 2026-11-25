import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://level9-nu.vercel.app"),
  title: {
    default: "Santiago Level 9 · Gamer Party",
    template: "%s · Santiago Level 9",
  },
  description: "Game Center privado para Santiago Level 9.",
  icons: { icon: "/assets/branding/santiago-gamer.png", apple: "/assets/branding/santiago-gamer.png" },
  openGraph: {
    title: "Santiago Level 9 · Gamer Party",
    description: "El Game Center del cumpleaños gamer de Santiago.",
    images: [{ url: "/assets/branding/santiago-gamer.png", width: 1254, height: 1254, alt: "Santiago gamer" }],
  },
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
