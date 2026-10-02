import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { LOGO_FULL_PNG_BASE64, LOGO_ELEPHANT_PNG_BASE64 } from "./brand-assets";

// ============================================================
// Billet PDF Nzoko — une page A5 par passager, QR sécurisé
// Charte : Nuit #0E2930, Or #E2AB35, Anthracite #3E3E39, Crème #F7F4EC
// ============================================================

export interface TicketView {
  reference: string;
  status: string;
  date: string;
  departure_time: string;
  from_city_name: string;
  to_city_name: string;
  from_terminal_name: string | null;
  to_terminal_name: string | null;
  total_price: number;
  bus_name: string | null;
  passengers: { full_name: string; seat_number: string | null; is_primary: boolean; ticket_code: string | null; ticket_status: string | null }[];
}

const NUIT: [number, number, number] = [14, 41, 48];
const OR: [number, number, number] = [226, 171, 53];
const ANTHRACITE: [number, number, number] = [62, 62, 57];
const CREME: [number, number, number] = [247, 244, 236];

export const QR_PREFIX = "NZK-T:";

/** « 9F3A…» → « 9F3A-1B2C-… » (lisible pour une saisie manuelle) */
export function formatTicketCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function formatXAF(n: number): string {
  return `${n.toLocaleString("fr-FR").replace(/ | /g, " ")} FCFA`;
}

export async function generateTicketPdf(view: TicketView): Promise<ArrayBuffer> {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait", compress: true });
  const W = doc.internal.pageSize.getWidth(); // 148
  const H = doc.internal.pageSize.getHeight(); // 210
  const passengers = view.passengers.filter((p) => p.ticket_code);

  for (let i = 0; i < passengers.length; i++) {
    const p = passengers[i];
    if (i > 0) doc.addPage();

    // Fond crème
    doc.setFillColor(...CREME);
    doc.rect(0, 0, W, H, "F");

    // En-tête nuit + logo officiel
    doc.setFillColor(...NUIT);
    doc.rect(0, 0, W, 42, "F");
    doc.addImage(`data:image/png;base64,${LOGO_FULL_PNG_BASE64}`, "PNG", 10, 6, 35, 29.6);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("BILLET DE VOYAGE", W - 10, 14, { align: "right" });
    doc.setTextColor(...OR);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(view.reference, W - 10, 22, { align: "right" });
    doc.setTextColor(200, 210, 212);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Passager ${i + 1}/${passengers.length}`, W - 10, 29, { align: "right" });
    doc.setFillColor(...OR);
    doc.rect(0, 42, W, 1.2, "F");

    // Filigrane éléphant
    const anyDoc = doc as any;
    if (anyDoc.GState) {
      doc.setGState(new anyDoc.GState({ opacity: 0.06 }));
      doc.addImage(`data:image/png;base64,${LOGO_ELEPHANT_PNG_BASE64}`, "PNG", W - 78, 52, 70, 62);
      doc.setGState(new anyDoc.GState({ opacity: 1 }));
    }

    // Trajet
    doc.setTextColor(...NUIT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(`${view.from_city_name}  —  ${view.to_city_name}`, 10, 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ANTHRACITE);
    const terminals = [view.from_terminal_name && `Départ : ${view.from_terminal_name}`, view.to_terminal_name && `Arrivée : ${view.to_terminal_name}`]
      .filter(Boolean)
      .join("   ·   ");
    if (terminals) doc.text(terminals, 10, 62);

    // Informations
    const field = (label: string, value: string, x: number, y: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 112);
      doc.text(label.toUpperCase(), x, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...NUIT);
      doc.text(value, x, y + 6);
    };
    field("Passager", p.full_name, 10, 74);
    field("Date", formatDate(view.date), 10, 92);
    field("Heure de départ", view.departure_time, 55, 92);
    field("Siège", p.seat_number ?? "—", 105, 92);
    field("Bus", view.bus_name ?? "—", 10, 110);
    field("Montant total", formatXAF(view.total_price), 55, 110);

    // Séparation détachable
    doc.setDrawColor(...OR);
    doc.setLineWidth(0.6);
    (doc as any).setLineDashPattern?.([2, 1.5], 0);
    doc.line(8, 124, W - 8, 124);
    (doc as any).setLineDashPattern?.([], 0);

    // QR sécurisé
    const qr = await QRCode.toDataURL(`${QR_PREFIX}${p.ticket_code}`, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 360,
      color: { dark: "#0E2930", light: "#FFFFFF" },
    });
    const qrSize = 52;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect((W - qrSize) / 2 - 3, 130, qrSize + 6, qrSize + 6, 2, 2, "F");
    doc.addImage(qr, "PNG", (W - qrSize) / 2, 133, qrSize, qrSize);

    doc.setFont("courier", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NUIT);
    doc.text(formatTicketCode(p.ticket_code!), W / 2, 194, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 112);
    doc.text("Présentez ce QR code à l'agent avant de monter dans le bus. Valable une seule fois.", W / 2, 200, { align: "center" });
    doc.text("Nzoko Transport — Voyagez en toute sécurité", W / 2, 205, { align: "center" });
  }

  return doc.output("arraybuffer");
}
