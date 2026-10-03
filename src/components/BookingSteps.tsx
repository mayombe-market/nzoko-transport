// Fil d'étapes du parcours de réservation
const STEPS = ["Trajet", "Siège", "Passager", "Paiement", "Vérification", "Billet"] as const;

export function BookingSteps({ current }: { current: (typeof STEPS)[number] }) {
  const index = STEPS.indexOf(current);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1 mb-5 text-[11px] sm:text-xs" aria-label="Étapes de la réservation">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-1 shrink-0">
          <span
            className={`flex items-center gap-1 px-2 py-1 rounded-full font-semibold ${
              i < index ? "bg-night/10 text-night" : i === index ? "bg-accent-500 text-night" : "bg-gray-100 text-gray-400"
            }`}
            aria-current={i === index ? "step" : undefined}
          >
            {i < index ? "✓" : i + 1} {step}
          </span>
          {i < STEPS.length - 1 && <span className="text-gray-300">›</span>}
        </li>
      ))}
    </ol>
  );
}
