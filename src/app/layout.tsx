import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accounting",
  description: "Internal accounting with LHDN MyInvois e-Invoice",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
