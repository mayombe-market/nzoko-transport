"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { authFetch } from "./auth-fetch";

export const PARCEL_STATUS: Record<string, { label: string; cls: string }> = {
  depose: { label: "Déposé", cls: "bg-gray-100 text-gray-700" },
  affecte: { label: "Affecté à un départ", cls: "bg-blue-100 text-blue-800" },
  charge: { label: "Chargé", cls: "bg-indigo-100 text-indigo-800" },
  en_transit: { label: "En transit", cls: "bg-accent-100 text-accent-900" },
  arrive: { label: "Arrivé", cls: "bg-teal-100 text-teal-800" },
  pret_au_retrait: { label: "Prêt au retrait", cls: "bg-green-100 text-green-800" },
  retire: { label: "Retiré", cls: "bg-green-600 text-white" },
  annule: { label: "Annulé", cls: "bg-red-100 text-red-700" },
  incident: { label: "Incident", cls: "bg-red-600 text-white" },
};

export const ACTION_LABEL: Record<string, string> = {
  depot: "Dépôt au guichet",
  assign: "Affecté à un départ",
  unassign: "Retiré du départ",
  load: "Chargé dans le bus",
  unload: "Déchargé du bus",
  depart: "Départ du bus",
  arrive: "Arrivé à l'agence",
  ready: "Prêt au retrait",
  retrait: "Remis au destinataire",
  code_incorrect: "Code de retrait incorrect",
  nouveau_code: "Nouveau code de retrait",
  cancel: "Annulé",
  incident: "Incident signalé",
  resolve: "Incident résolu",
};

export const METHOD_LABEL: Record<string, string> = { especes: "Espèces", mtn: "MTN MoMo", airtel: "Airtel Money" };

export async function colisApi<T = any>(op: string, params: Record<string, unknown> = {}): Promise<{ success: boolean; data?: T; message?: string; code?: string; [k: string]: any }> {
  try {
    const res = await authFetch("/api/admin/colis", { op, ...params });
    return await res.json();
  } catch {
    return { success: false, message: "Connexion impossible. Vérifiez votre réseau." };
  }
}

export interface AgentInfo {
  full_name: string;
  role: "admin" | "finance" | "manager" | "agent";
  terminal_id: string | null;
  terminals: { name: string; city_id: string } | null;
  // liste des agences actives
  [key: string]: any;
}

/** Session agent : redirige vers /admin si personne n'est connecté */
export function useAgent() {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [allTerminals, setAllTerminals] = useState<{ id: string; name: string; city_id: string }[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/admin";
        return;
      }
      const res = await colisApi("me");
      if (!res.success) {
        window.location.href = "/admin";
        return;
      }
      const { terminals, ...me } = res.data;
      setAgent(me);
      setAllTerminals(terminals ?? []);
      setReady(true);
    })();
  }, []);

  return { agent, allTerminals, ready };
}

/** Ouvre une étiquette ou un reçu PDF (nécessite la session agent) */
export async function openParcelPdf(kind: "label" | "receipt", id: string, pickupCode?: string): Promise<string | null> {
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const res = await fetch("/api/admin/colis/pdf", { method: "POST", headers, body: JSON.stringify({ kind, id, pickupCode }) });
    if (!res.ok) {
      win?.close();
      return null;
    }
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    return url;
  } catch {
    win?.close();
    return null;
  }
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Brazzaville", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const todayBrazzaville = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
