import { NextRequest, NextResponse } from "next/server";

// API Route pour envoyer le billet par email
// Utilise Resend pour l'envoi d'email
export async function POST(req: NextRequest) {
  try {
    const { booking } = await req.json();

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({
        success: false,
        message: "Service email non configuré.",
      });
    }

    if (!booking || !booking.email || !booking.reference) {
      return NextResponse.json({
        success: false,
        message: "Données de réservation incomplètes.",
      });
    }

    // Construire l'URL du billet (le client peut le télécharger depuis cette page)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const ticketUrl = `${baseUrl}/billet/${booking.reference}`;

    // Envoyer l'email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Nzoko Transport <billets@nzoko-transport.com>",
        to: [booking.email],
        subject: `🎫 Votre billet Nzoko Transport — ${booking.reference}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
            <div style="background: #0f2340; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffd700;">🐘 Nzoko Transport</h1>
              <p style="margin: 8px 0 0; opacity: 0.8;">Votre billet de voyage</p>
            </div>
            
            <div style="background: white; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
              <h2 style="color: #0f2340; margin-top: 0;">Réservation confirmée ✅</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Référence</td>
                  <td style="padding: 8px 0; font-weight: bold; font-family: monospace; font-size: 16px;">${booking.reference}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Passager</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.passengerName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Trajet</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.from} → ${booking.to}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.date}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Départ</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.departureTime}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Place(s)</td>
                  <td style="padding: 8px 0; font-weight: bold;">${booking.seats}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Montant</td>
                  <td style="padding: 8px 0; font-weight: bold; color: #b39700;">${booking.totalPrice} FCFA</td>
                </tr>
              </table>
              
              <div style="text-align: center; margin: 24px 0; padding: 16px; background: #f3f4f6; border-radius: 8px;">
                <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280;">Votre QR code de validation :</p>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(booking.reference)}" 
                     alt="QR Code" 
                     style="width: 200px; height: 200px;" />
                <p style="margin: 12px 0 0; font-size: 12px; color: #9ca3af;">
                  Présentez ce QR code à l'agent avant de monter dans le bus.
                </p>
              </div>
              
              <div style="text-align: center; margin-top: 20px;">
                <a href="${ticketUrl}" 
                   style="display: inline-block; background: #ffd700; color: #0f2340; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  📄 Voir / Télécharger mon billet
                </a>
              </div>
              
              <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
              
              <p style="font-size: 12px; color: #9ca3af; text-align: center;">
                Nzoko Transport — Voyagez en toute sécurité partout au Congo 🇨🇬<br/>
                Pour toute question, appelez le 06 XXX XX XX
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("Resend error:", errorData);
      return NextResponse.json({
        success: false,
        message: "Erreur lors de l'envoi de l'email.",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Email envoyé avec succès.",
      ticketUrl,
    });
  } catch (err) {
    console.error("Send ticket error:", err);
    return NextResponse.json({
      success: false,
      message: "Erreur serveur.",
    });
  }
}
