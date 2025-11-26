import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Tomorrow } from "next/font/google";
import "./globals.css";
import { ensureUserProfile } from "@/lib/auth/profile";
import { Toaster } from "@/components/ui/sonner";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const tomorrow = Tomorrow({
  variable: "--font-tomorrow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Anthem Client Portal",
  description: "Anthem's client portal to run workflows, track executions, and manage access.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
  },
  openGraph: {
    title: "Anthem Client Portal",
    description:
      "Anthem's client portal to run workflows, track executions, and manage access.",
    type: "website",
    images: [
      {
        url: "/anthem_agency_logo.jpeg",
        alt: "Anthem Client Portal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/anthem_agency_logo.jpeg"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Ensure the authenticated user's profile exists (idempotent)
  await ensureUserProfile();
  return (
    <html lang="en">
      <body
        className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} ${tomorrow.variable} antialiased`}
      >
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
