"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import { LogoFull } from "./Logo";

const ROLE_LABEL: Record<string, string> = { admin: "Administrateur", finance: "Finance", manager: "Responsable d'agence", agent: "Agent" };

interface Staff {
  role: string;
  agency: string | null;
}

// Navigation publique simple. L'accès du personnel n'apparaît qu'une fois connecté
// (« Tableau de bord ») ; pour les visiteurs, un lien discret figure en bas de page.
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    async function load(session: any) {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setStaff(null);
        return;
      }
      const { data } = await client
        .from("agent_profiles")
        .select("role, is_active, terminals(name)")
        .eq("id", session.user.id)
        .maybeSingle();
      setStaff(data && data.is_active ? { role: data.role, agency: (data as any).terminals?.name ?? null } : null);
    }
    client.auth.getSession().then(({ data: { session } }) => load(session));
    const { data: { subscription } } = client.auth.onAuthStateChange((_e, session) => {
      load(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const displayName = user?.user_metadata?.full_name || user?.email;
  const staffLabel = staff ? [ROLE_LABEL[staff.role] ?? staff.role, staff.agency].filter(Boolean).join(" · ") : null;
  const close = () => setMenuOpen(false);

  return (
    <header className="bg-night text-white shadow-lg sticky top-0 z-50 border-b border-accent-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-[68px]">
          <Link href="/" className="flex items-center" aria-label="Nzoko Transport — accueil">
            <LogoFull className="h-12 w-auto" />
          </Link>

          {/* Navigation desktop */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="hover:text-accent-400 transition-colors">Accueil</Link>
            <Link href="/mes-reservations" className="hover:text-accent-400 transition-colors">Mes réservations</Link>
            <Link href="/suivi-colis" className="hover:text-accent-400 transition-colors">Suivre un colis</Link>
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-300 text-right leading-tight">
                  {displayName}
                  {staffLabel && <span className="block text-[11px] text-accent-400">{staffLabel}</span>}
                </span>
                <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-red-400 transition-colors">
                  Déconnexion
                </button>
                {staff && (
                  <Link
                    href="/admin"
                    className="bg-accent-500 text-night px-4 py-2 rounded-lg font-semibold hover:bg-accent-400 transition-colors"
                  >
                    Tableau de bord
                  </Link>
                )}
              </div>
            ) : (
              <Link href="/auth/login" className="hover:text-accent-400 transition-colors text-sm">Connexion</Link>
            )}
          </nav>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-night-light transition-colors"
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Menu mobile */}
        {menuOpen && (
          <nav className="md:hidden pb-4 border-t border-night-light pt-3 space-y-2">
            <Link href="/" className="block py-2 hover:text-accent-400 transition-colors" onClick={close}>Accueil</Link>
            <Link href="/mes-reservations" className="block py-2 hover:text-accent-400 transition-colors" onClick={close}>Mes réservations</Link>
            <Link href="/suivi-colis" className="block py-2 hover:text-accent-400 transition-colors" onClick={close}>Suivre un colis</Link>
            {user ? (
              <>
                <p className="pt-2 text-xs text-gray-300">
                  {displayName}
                  {staffLabel && <span className="block text-accent-400">{staffLabel}</span>}
                </p>
                {staff && (
                  <Link
                    href="/admin"
                    className="block bg-accent-500 text-night px-4 py-2 rounded-lg font-semibold text-center hover:bg-accent-400 transition-colors"
                    onClick={close}
                  >
                    Tableau de bord
                  </Link>
                )}
                <button onClick={() => signOut()} className="block py-2 text-sm text-gray-400 hover:text-red-400">Déconnexion</button>
              </>
            ) : (
              <Link href="/auth/login" className="block py-2 hover:text-accent-400 transition-colors" onClick={close}>Connexion</Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
