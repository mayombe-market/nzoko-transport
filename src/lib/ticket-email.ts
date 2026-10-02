import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "./api-auth";
import { generateTicketPdf, type TicketView } from "./ticket-pdf";

// ============================================================
// Envoi du billet par email (Resend) avec le PDF en pièce jointe.
// Sans RESEND_API_KEY : ne fait rien et le signale (ne bloque jamais la confirmation).
// ============================================================

export async function sendTicketEmail(
  supabase: SupabaseClient,
  reference: string
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY manquante" };

  const { data: bk } = await supabase
    .from("bookings")
    .select("reference, status, customer_email, access_key")
    .eq("reference", reference)
    .maybeSingle();
  if (!bk?.customer_email) return { sent: false, reason: "pas d'email client" };
  if (bk.status !== "confirmed") return { sent: false, reason: "réservation non confirmée" };

  const { data: view } = await supabase.rpc("nzk_ticket_view", { p_reference: reference, p_access_key: bk.access_key });
  if (!view) return { sent: false, reason: "billet introuvable" };

  const pdf = await generateTicketPdf(view as TicketView);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://nzoko-transport-tan.vercel.app";
  const ticketUrl = `${baseUrl}/billet/${encodeURIComponent(bk.reference)}?k=${encodeURIComponent(bk.access_key)}`;
  const v = view as TicketView;
  const from = process.env.RESEND_FROM_EMAIL || "Nzoko Transport <billets@nzoko-transport.com>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [bk.customer_email],
      subject: `Votre billet Nzoko Transport — ${bk.reference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f7f4ec; padding: 20px;">
          <div style="background: #0e2930; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <img src="${baseUrl}/brand/nzoko-logo.png" alt="Nzoko Transport" width="132" style="display:block;margin:0 auto;width:132px;height:auto;" />
          </div>
          <div style="background: #fff; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
            <h2 style="color: #0e2930; margin-top: 0;">Réservation confirmée</h2>
            <p style="color:#3e3e39">Référence <strong style="font-family:monospace">${escapeHtml(v.reference)}</strong></p>
            <p style="color:#3e3e39"><strong>${escapeHtml(v.from_city_name)} → ${escapeHtml(v.to_city_name)}</strong><br/>
               ${escapeHtml(v.date)} à ${escapeHtml(v.departure_time)}</p>
            <p style="color:#3e3e39">Votre billet (un QR code par passager) est en pièce jointe.</p>
            <p style="text-align:center;margin:24px 0">
              <a href="${ticketUrl}" style="display:inline-block;background:#e2ab35;color:#0e2930;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Voir mon billet en ligne</a>
            </p>
            <p style="font-size:12px;color:#9ca3af;text-align:center">Nzoko Transport — Voyagez en toute sécurité</p>
          </div>
        </div>`,
      attachments: [{ filename: `billet-${bk.reference}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    }),
  });

  if (!res.ok) {
    console.error("Resend error:", await res.text().catch(() => ""));
    return { sent: false, reason: "erreur Resend" };
  }
  return { sent: true };
}
