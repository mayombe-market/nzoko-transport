import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, phone, role } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({
        success: false,
        message: "Email, mot de passe et nom sont requis.",
      });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        message: "Service non configuré (SUPABASE_SERVICE_ROLE_KEY manquant).",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Créer l'utilisateur dans Supabase Auth
    const { data: userData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmer directement l'email
      user_metadata: {
        full_name: fullName,
        phone: phone || null,
      },
    });

    if (authError) {
      // Gestion des erreurs courantes
      if (authError.message.includes("already been registered")) {
        return NextResponse.json({
          success: false,
          message: "Un compte avec cet email existe déjà.",
        });
      }
      return NextResponse.json({
        success: false,
        message: authError.message,
      });
    }

    if (!userData.user) {
      return NextResponse.json({
        success: false,
        message: "Erreur lors de la création du compte.",
      });
    }

    // 2. Créer le profil agent
    const { error: profileError } = await supabase
      .from("agent_profiles")
      .insert({
        id: userData.user.id,
        full_name: fullName,
        phone: phone || null,
        role: role || "agent",
        is_active: true,
      });

    if (profileError) {
      // Supprimer l'utilisateur si le profil échoue
      await supabase.auth.admin.deleteUser(userData.user.id);
      return NextResponse.json({
        success: false,
        message: "Erreur lors de la création du profil : " + profileError.message,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Agent "${fullName}" créé avec succès.`,
      agentId: userData.user.id,
    });
  } catch (err) {
    console.error("Create agent error:", err);
    return NextResponse.json({
      success: false,
      message: "Erreur serveur.",
    });
  }
}
