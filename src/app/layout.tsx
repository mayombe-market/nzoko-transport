import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nzoko Transport — Réservation de bus au Congo",
  description:
    "Réservez vos billets de bus Nzoko Transport : Brazzaville, Pointe-Noire, Dolisie, Oyo, Ouesso. Paiement Mobile Money.",
  keywords: "bus, Congo, Brazzaville, Pointe-Noire, transport, réservation, Mobile Money",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <div className="flex flex-col min-h-screen">
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
