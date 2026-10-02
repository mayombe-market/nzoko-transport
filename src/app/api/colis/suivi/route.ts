import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";

// Suivi public d'un colis : référence + 4 derniers chiffres du téléphone de l'expéditeur
// ou du destinataire. Ne renvoie ni nom ni téléphone ; tentatives limitées en base.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reference = String(body?.reference ?? "").trim().toUpperCase();
  const phone4 = String(body?.phone4 ?? "").replace(/\D/g, "");
  if (!/^NZK-C-[A-Z0-9]{6}$/.test(reference) || phone4.length !== 4) {
    return NextResponse.json({ success: false, message: "Vérifiez la référence (NZK-C-XXXXXX) et les 4 chiffres." }, { status: 400 });
  }
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  const { data, error } = await supabase.rpc("nzk_parcel_track", { p_reference: reference, p_phone4: phone4 });
  if (error) {
    console.error("nzk_parcel_track:", error);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
  if (!data?.ok) {
    const message =
      data?.error === "TROP_DE_TENTATIVES"
        ? "Trop de tentatives pour ce colis. Réessayez dans une heure."
        : "Aucun colis ne correspond à cette référence et à ces chiffres.";
    return NextResponse.json({ success: false, message }, { status: 404 });
  }
  return NextResponse.json({ success: true, parcel: data });
}
