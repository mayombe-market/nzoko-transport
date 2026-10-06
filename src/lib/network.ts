"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { CITY_NAMES } from "./cities";

// ============================================================
// Réseau Nzoko lu en base : villes et agences (table terminals).
// Une agence créée dans l'administration apparaît partout sans redéploiement.
// ============================================================

export interface NetworkCity {
  id: string;
  name: string;
  region: string | null;
}

export interface NetworkTerminal {
  id: string;
  name: string;
  city_id: string;
}

export interface Network {
  cities: NetworkCity[];
  terminals: NetworkTerminal[];
  ready: boolean;
}

let cache: Promise<Omit<Network, "ready">> | null = null;

function loadNetwork(): Promise<Omit<Network, "ready">> {
  if (!cache) {
    cache = (async () => {
      if (!supabase) return { cities: [], terminals: [] };
      const [c, t] = await Promise.all([
        supabase.from("cities").select("id, name, region").eq("is_active", true).order("name"),
        supabase.from("terminals").select("id, name, city_id").eq("is_active", true).order("name"),
      ]);
      return { cities: (c.data ?? []) as NetworkCity[], terminals: (t.data ?? []) as NetworkTerminal[] };
    })();
    cache.catch(() => (cache = null));
  }
  return cache;
}

/** À appeler après la création / modification d'une agence pour relire le réseau */
export function refreshNetwork() {
  cache = null;
}

export function useNetwork() {
  const [net, setNet] = useState<Network>({ cities: [], terminals: [], ready: false });
  useEffect(() => {
    let alive = true;
    loadNetwork().then((n) => alive && setNet({ ...n, ready: true }));
    return () => {
      alive = false;
    };
  }, []);

  const cityLabel = (id: string | null | undefined) =>
    id ? net.cities.find((c) => c.id === id)?.name ?? CITY_NAMES[id] ?? id : "";
  const terminalLabel = (id: string | null | undefined) => (id ? net.terminals.find((t) => t.id === id)?.name ?? id : "");
  const terminalsOf = (cityId: string) => net.terminals.filter((t) => t.city_id === cityId);

  return { ...net, cityLabel, terminalLabel, terminalsOf };
}
