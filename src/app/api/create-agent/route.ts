import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, requireAgent, isDenied } from "@/lib/api-auth";

// Création d'un compte agent/admin.
// - Cas normal : réservé à un administrateur connecté.
// - Cas initial (/admin/setup) : autorisé uniquement si AUCUN admin n'existe
//   ET si le code ADMIN_SETUP_TOKEN (variable Vercel) est fourni.
export async function POST(req: NextRequest) {
  try {
    const { email, password, fullName, phone, role, terminalId, setupToken } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({
        success: false,
        message: "Email, mot de passe et nom sont requis.",
      }, { status: 400 });
    }

    if (String(password).length < 8) {
      return NextResponse.json({
        success: false,
        message: "Le mot de passe doit contenir au moins 8 caractères.",
      }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({
        success: false,
        message: "Service non configuré.",
      }, { status: 503 });
    }

    const finalRole: "admin" | "agent" = role === "admin" ? "admin" : "agent";

    if (setupToken !== undefined) {
      // ---- Création du tout premier administrateur ----
      const expected = process.env.ADMIN_SETUP_TOKEN || "";
      if (!expected || setupToken !== expected) {
        return NextResponse.json({ success: false, message: "Code de configuration invalide." }, { status: 403 });
      }
      const { count, error: countError } = await supabase
        .from("agent_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError || (count ?? 0) > 0) {
        return NextResponse.json({
          success: false,
          message: "Un administrateur existe déjà. Demandez-lui de créer votre compte.",
        }, { status: 403 });
      }
      if (finalRole !== "admin") {
        return NextResponse.json({ success: false, message: "Rôle invalide." }, { status: 400 });
      }
    } else {
      // ---- Cas normal : un admin connecté crée le compte ----
      const ctx = await requireAgent(req, { adminOnly: true });
      if (isDenied(ctx)) return ctx;
    }

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
        }, { status: 409 });
      }
      return NextResponse.json({
        success: false,
        message: authError.message,
      }, { status: 400 });
    }

    if (!userData.user) {
      return NextResponse.json({
        success: false,
        message: "Erreur lors de la création du compte.",
      }, { status: 500 });
    }

    // 2. Créer le profil agent
    const { error: profileError } = await supabase
      .from("agent_profiles")
      .insert({
        id: userData.user.id,
        full_name: fullName,
        phone: phone || null,
        role: finalRole,
        terminal_id: terminalId || null,
        is_active: true,
      });

    if (profileError) {
      // Supprimer l'utilisateur si le profil échoue
      await supabase.auth.admin.deleteUser(userData.user.id);
      return NextResponse.json({
        success: false,
        message: "Erreur lors de la création du profil : " + profileError.message,
      }, { status: 500 });
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
    }, { status: 500 });
  }
}
