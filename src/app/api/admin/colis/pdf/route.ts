import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { generateParcelLabel, generateParcelReceipt, type ParcelDoc } from "@/lib/parcel-pdf";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/i;

// Étiquette ou reçu d'un colis (agents de l'agence de départ ou d'arrivée).
// Le code de retrait n'est imprimé sur le reçu que s'il est fourni ET vérifié en base
// (juste après le dépôt ou après génération d'un nouveau code).
export async function POST(req: NextRequest) {
  const ctx = await requireAgent(req);
  if (isDenied(ctx)) return ctx;
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const kind = body?.kind === "receipt" ? "receipt" : "label";
  if (!UUID.test(id)) return NextResponse.json({ success: false, message: "Colis invalide." }, { status: 400 });

  const { data: parcel } = await ctx.supabase.rpc("nzk_parcel_detail", { p_agent: ctx.userId, p_parcel: id });
  if (!parcel) return NextResponse.json({ success: false, message: "Colis introuvable." }, { status: 404 });

  let code: string | null = null;
  if (kind === "receipt" && /^\d{6}$/.test(String(body?.pickupCode ?? ""))) {
    const { data: ok } = await ctx.supabase.rpc("nzk_parcel_code_matches", { p_parcel: id, p_code: String(body.pickupCode) });
    if (ok) code = String(body.pickupCode);
  }

  const pdf = kind === "receipt" ? await generateParcelReceipt(parcel as ParcelDoc, code) : await generateParcelLabel(parcel as ParcelDoc);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${kind === "receipt" ? "recu" : "etiquette"}-${parcel.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
