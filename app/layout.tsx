import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Journal",
  description: "Track and annotate your chess games",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
