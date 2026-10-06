"use client";

import Link from "next/link";
import { useAgent } from "@/lib/parcel-ui";

// Protège une page interne : sans session du personnel, redirection vers la connexion (/admin).
// La vraie protection reste côté serveur et base ; ceci évite d'afficher un écran interne vide.
export function StaffGate({ roles, children }: { roles?: string[]; children: React.ReactNode }) {
  const { agent, ready } = useAgent();
  if (!ready || !agent) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;
  if (roles && !roles.includes(agent.role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-night mb-2">Accès réservé</h1>
        <p className="text-sm text-gray-600 mb-4">Cette page est réservée à l&apos;administration Nzoko.</p>
        <Link href="/admin" className="btn-primary">Tableau de bord</Link>
      </div>
    );
  }
  return <>{children}</>;
}
