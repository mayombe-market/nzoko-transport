// Messages affichés au client pour les codes d'erreur renvoyés par la base (fonctions nzk_*)
const MESSAGES: Record<string, string> = {
  TOKEN_INVALIDE: "Session de réservation invalide. Rechargez la page.",
  DEPART_INDISPONIBLE: "Ce départ n'est plus disponible.",
  DEPART_PASSE: "Ce départ est déjà passé.",
  SIEGE_INVALIDE: "Ce siège n'existe pas dans ce bus.",
  SIEGE_PRIS: "Ce siège vient d'être pris par un autre voyageur. Choisissez-en un autre.",
  TROP_DE_SIEGES: "Vous ne pouvez pas bloquer plus de 10 sièges.",
  PASSAGERS_INVALIDES: "Informations passagers invalides.",
  NOM_PASSAGER_MANQUANT: "Le nom de chaque passager est obligatoire.",
  SIEGES_INVALIDES: "Sélection de sièges invalide.",
  SIEGES_NON_BLOQUES: "Vos sièges ne sont plus réservés (délai de 15 minutes dépassé ou siège pris). Revenez au plan du bus.",
  METHODE_INVALIDE: "Moyen de paiement invalide.",
  CODE_TRANSACTION_INVALIDE: "Code de transaction invalide.",
  TELEPHONE_INVALIDE: "Numéro de téléphone invalide.",
  NON_AUTORISE: "Vous n'êtes pas autorisé à traiter cette réservation.",
  INTROUVABLE: "Réservation introuvable.",
  DEJA_CONFIRMEE: "Cette réservation est déjà confirmée.",
  DEJA_ANNULEE: "Cette réservation est déjà annulée.",
  STATUT_INCOMPATIBLE: "Le statut de cette réservation ne permet pas cette action.",
  AUCUN_PAIEMENT_EN_ATTENTE: "Aucun paiement en attente pour cette réservation.",
  BILLET_DEJA_UTILISE: "Un billet de cette réservation a déjà été utilisé : annulation impossible.",
};

export function bookingErrorMessage(code: string | undefined | null): string {
  return (code && MESSAGES[code]) || "Une erreur est survenue. Réessayez.";
}
