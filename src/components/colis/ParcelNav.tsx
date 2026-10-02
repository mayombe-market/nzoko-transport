"use client";

import Link from "next/link";
import { LogoIcon } from "@/components/Logo";

// En-tête commun de l'espace colis
export function ParcelNav({ title, agentLabel, isAdmin }: { title: string; agentLabel?: string; isAdmin?: boolean }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-night rounded-xl flex items-center justify-center shrink-0">
            <LogoIcon className="w-7 h-7" />
          </div>
          <div>
            <h1 className="section-title">{title}</h1>
            {agentLabel && <p className="text-xs text-gray-500">{agentLabel}</p>}
          </div>
        </div>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-night">← Tableau de bord</Link>
      </div>
      <nav className="flex gap-2 mt-4 flex-wrap text-sm">
        <Link href="/admin/colis" className="px-3 py-1.5 rounded-lg bg-night text-white hover:bg-night-light">📦 Colis</Link>
        <Link href="/admin/colis/departs" className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-accent-500">🚌 Départs & chargement</Link>
        <Link href="/admin/scanner" className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-accent-500">📷 Scanner</Link>
        {isAdmin && <Link href="/admin/colis/tarifs" className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-accent-500">💰 Tarifs</Link>}
      </nav>
    </div>
  );
}
