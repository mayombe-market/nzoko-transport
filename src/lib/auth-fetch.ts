"use client";

import { supabase } from "./supabase";

/**
 * fetch() vers nos routes API en joignant le jeton de session de l'agent connecté.
 */
export async function authFetch(url: string, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
}
