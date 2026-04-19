import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import "./globals.css";

const stickerNameFont = Oswald({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-sticker-name",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Panini World Cup Sticker Generator",
  description:
    "Generate photorealistic Panini-style FIFA World Cup stickers from your photo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${stickerNameFont.variable} app-body`}>{children}</body>
    </html>
  );
}
