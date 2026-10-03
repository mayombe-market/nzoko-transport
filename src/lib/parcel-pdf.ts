import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { LOGO_FULL_PNG_BASE64, LOGO_ELEPHANT_PNG_BASE64 } from "./brand-assets";
import { maskPhone, displayPhone } from "./phone";

// ============================================================
// Documents colis : étiquette à coller (100 × 70 mm) et reçu expéditeur (A5)
// QR « NZK-C:<code> » : identifie le colis, ne permet PAS de le retirer.
// ============================================================

export interface ParcelDoc {
  reference: string;
  qr_code: string;
  created_at: string;
  sender_name: string;
  sender_phone: string;
  recipient_name: string;
  recipient_phone: string;
  from_city_name: string;
  to_city_name: string;
  from_terminal_name: string;
  to_terminal_name: string;
  category_label: string;
  description: string;
  quantity: number;
  weight_kg: number | null;
  declared_value: number | null;
  notes: string | null;
  price: number;
  payer: "expediteur" | "destinataire";
  payment_status: "paye" | "a_payer";
  payments?: { amount: number; method: string; moment: string; transaction_code: string | null }[];
  trip?: { date: string; departure_time: string; bus_name: string | null } | null;
}

const NUIT: [number, number, number] = [14, 41, 48];
const OR: [number, number, number] = [226, 171, 53];
const GRIS: [number, number, number] = [120, 120, 112];

export const PARCEL_QR_PREFIX = "NZK-C:";
const METHOD: Record<string, string> = { especes: "Espèces", mtn: "MTN MoMo", airtel: "Airtel Money" };

export { maskPhone } from "./phone";
const xaf = (n: number) => `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
const dt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { timeZone: "Africa/Brazzaville" })} ${d.toLocaleTimeString("fr-FR", { timeZone: "Africa/Brazzaville", hour: "2-digit", minute: "2-digit" })}`;
};

async function qr(code: string) {
  return QRCode.toDataURL(`${PARCEL_QR_PREFIX}${code}`, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#0E2930", light: "#FFFFFF" } });
}

/** Étiquette à coller sur le colis : référence, destination, destinataire (téléphone masqué), QR */
export async function generateParcelLabel(p: ParcelDoc): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "mm", format: [100, 70], orientation: "landscape", compress: true });
  doc.setFillColor(...NUIT);
  doc.rect(0, 0, 100, 14, "F");
  doc.addImage(`data:image/png;base64,${LOGO_FULL_PNG_BASE64}`, "PNG", 3, 1.5, 13, 11);
  doc.setTextColor(...OR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(p.reference, 97, 9, { align: "right" });

  doc.addImage(await qr(p.qr_code), "PNG", 3, 17, 34, 34);

  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("DESTINATION", 41, 20);
  doc.setTextColor(...NUIT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(p.to_city_name.toUpperCase(), 41, 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Agence ${p.to_terminal_name}`, 41, 32);

  doc.setTextColor(...GRIS);
  doc.setFontSize(7);
  doc.text("DESTINATAIRE", 41, 39);
  doc.setTextColor(...NUIT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(p.recipient_name, 56)[0], 41, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(maskPhone(p.recipient_phone) ?? "", 41, 49);

  doc.setDrawColor(...OR);
  doc.setLineWidth(0.5);
  doc.line(3, 55, 97, 55);
  doc.setFontSize(8);
  doc.setTextColor(...NUIT);
  doc.text(`De : ${p.from_city_name} (${p.from_terminal_name})`, 3, 60);
  doc.text(`${p.quantity} colis${p.weight_kg ? ` · ${p.weight_kg} kg` : ""}`, 97, 60, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(p.payment_status === "a_payer" ? 180 : 14, p.payment_status === "a_payer" ? 40 : 41, p.payment_status === "a_payer" ? 40 : 48);
  doc.text(p.payment_status === "a_payer" ? `PORT DÛ : ${xaf(p.price)}` : "PORT PAYÉ", 3, 66);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIS);
  doc.setFontSize(6);
  doc.text("Retrait uniquement avec le code secret du destinataire", 97, 66, { align: "right" });
  return doc.output("arraybuffer");
}

/** Reçu / bordereau remis à l'expéditeur. Le code de retrait n'apparaît que s'il est fourni (dépôt ou nouveau code). */
export async function generateParcelReceipt(p: ParcelDoc, pickupCode: string | null): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait", compress: true });
  const W = 148;

  doc.setFillColor(247, 244, 236);
  doc.rect(0, 0, W, 210, "F");
  doc.setFillColor(...NUIT);
  doc.rect(0, 0, W, 36, "F");
  doc.addImage(`data:image/png;base64,${LOGO_FULL_PNG_BASE64}`, "PNG", 10, 4, 33, 28);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("REÇU D'EXPÉDITION DE COLIS", W - 10, 13, { align: "right" });
  doc.setTextColor(...OR);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(p.reference, W - 10, 22, { align: "right" });
  doc.setTextColor(200, 210, 212);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Déposé le ${dt(p.created_at)}`, W - 10, 29, { align: "right" });
  doc.setFillColor(...OR);
  doc.rect(0, 36, W, 1, "F");

  const anyDoc = doc as any;
  if (anyDoc.GState) {
    doc.setGState(new anyDoc.GState({ opacity: 0.05 }));
    doc.addImage(`data:image/png;base64,${LOGO_ELEPHANT_PNG_BASE64}`, "PNG", W - 72, 45, 64, 57);
    doc.setGState(new anyDoc.GState({ opacity: 1 }));
  }

  doc.setTextColor(...NUIT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(`${p.from_city_name}  —  ${p.to_city_name}`, 10, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Agence de départ : ${p.from_terminal_name}   ·   Retrait : agence ${p.to_terminal_name}`, 10, 54);

  const field = (label: string, value: string, x: number, y: number, w = 60) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NUIT);
    doc.text(doc.splitTextToSize(value, w)[0] ?? "", x, y + 5);
  };
  field("Expéditeur", p.sender_name, 10, 63);
  field("Téléphone", displayPhone(p.sender_phone), 80, 63);
  field("Destinataire", p.recipient_name, 10, 76);
  field("Téléphone", displayPhone(p.recipient_phone), 80, 76);
  field("Contenu", `${p.category_label} — ${p.description}`, 10, 89, 128);
  field("Quantité", String(p.quantity), 10, 102);
  field("Poids", p.weight_kg ? `${p.weight_kg} kg` : "—", 45, 102);
  field("Valeur déclarée", p.declared_value ? xaf(p.declared_value) : "—", 80, 102);
  field("Transport", xaf(p.price), 10, 115);
  const paid = p.payments?.[0];
  field(
    "Paiement",
    p.payment_status === "paye" ? `Payé${paid ? ` — ${METHOD[paid.method] ?? paid.method}` : ""}` : "À payer par le destinataire au retrait",
    45,
    115,
    93
  );
  if (p.trip) field("Départ prévu", `${p.trip.date} ${p.trip.departure_time}${p.trip.bus_name ? ` · ${p.trip.bus_name}` : ""}`, 10, 128, 128);
  if (p.notes) field("Observations", p.notes, 80, 128, 58);

  // Code secret de retrait
  doc.setDrawColor(...OR);
  doc.setLineWidth(0.6);
  (doc as any).setLineDashPattern?.([2, 1.5], 0);
  doc.line(8, 140, W - 8, 140);
  (doc as any).setLineDashPattern?.([], 0);

  doc.addImage(await qr(p.qr_code), "PNG", 10, 146, 38, 38);
  doc.setFillColor(...NUIT);
  doc.roundedRect(55, 147, 83, 36, 2, 2, "F");
  doc.setTextColor(200, 210, 212);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CODE SECRET DE RETRAIT", 96.5, 155, { align: "center" });
  if (pickupCode) {
    doc.setTextColor(...OR);
    doc.setFont("courier", "bold");
    doc.setFontSize(24);
    doc.text(pickupCode.replace(/(\d{3})(\d{3})/, "$1 $2"), 96.5, 168, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(200, 210, 212);
    doc.text("À transmettre uniquement au destinataire", 96.5, 177, { align: "center" });
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text("Communiqué au dépôt (non réimprimable).", 96.5, 166, { align: "center" });
    doc.text("En cas de perte : demandez un nouveau code en agence.", 96.5, 172, { align: "center" });
  }

  doc.setTextColor(...GRIS);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Le destinataire retire le colis à l'agence d'arrivée en donnant ce code secret.", W / 2, 192, { align: "center" });
  doc.text("Suivi du colis : nzoko-transport-tan.vercel.app/suivi-colis (référence + 4 derniers chiffres du téléphone)", W / 2, 197, { align: "center" });
  doc.text("Nzoko Transport — Voyagez en toute sécurité", W / 2, 203, { align: "center" });
  return doc.output("arraybuffer");
}
