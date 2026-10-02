import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Vérification d'identité pour les routes API (côté serveur)
// Le client envoie son jeton de session Supabase dans l'en-tête
// Authorization: Bearer <access_token>
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export interface AgentContext {
  userId: string;
  role: "admin" | "agent";
  terminalId: string | null;
  supabase: SupabaseClient;
}

export function getServiceClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function deny(status: number, message: string) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * Exige un agent (ou admin) connecté et actif.
 * Retourne soit le contexte de l'agent, soit une réponse d'erreur à renvoyer telle quelle.
 */
export async function requireAgent(
  req: NextRequest,
  options: { adminOnly?: boolean } = {}
): Promise<AgentContext | NextResponse> {
  const supabase = getServiceClient();
  if (!supabase) return deny(503, "Service non configuré.");

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return deny(401, "Connexion requise.");

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return deny(401, "Session invalide ou expirée.");

  const { data: profile } = await supabase
    .from("agent_profiles")
    .select("role, terminal_id, is_active")
    .eq("id", userData.user.id)
    .single();

  if (!profile || !profile.is_active) return deny(403, "Accès réservé aux agents actifs.");
  if (profile.role !== "admin" && profile.role !== "agent") return deny(403, "Rôle non autorisé.");
  if (options.adminOnly && profile.role !== "admin") return deny(403, "Accès réservé aux administrateurs.");

  return {
    userId: userData.user.id,
    role: profile.role,
    terminalId: profile.terminal_id ?? null,
    supabase,
  };
}

export function isDenied(ctx: AgentContext | NextResponse): ctx is NextResponse {
  return ctx instanceof NextResponse;
}

/**
 * Échappe le HTML avant de l'insérer dans un email.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
