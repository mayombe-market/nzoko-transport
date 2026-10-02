import { SearchForm } from "@/components/SearchForm";
import { Watermark } from "@/components/Logo";

const AVANTAGES = [
  {
    title: "Sécurité garantie",
    text: "Bus en excellent état, chauffeurs expérimentés, respect des horaires.",
  },
  {
    title: "Choix du siège",
    text: "Sélectionnez votre place préférée sur le plan du bus avant le voyage.",
  },
  {
    title: "Paiement Mobile Money",
    text: "Payez via MTN Mobile Money ou Airtel Money, sans vous déplacer.",
  },
  {
    title: "Billet sur téléphone",
    text: "Votre billet et son QR code, à présenter à l'agent avant d'embarquer.",
  },
];

const DESTINATIONS = [
  { name: "Brazzaville ↔ Pointe-Noire", route: "RN1", km: "540 km", duration: "8h" },
  { name: "Brazzaville ↔ Ouesso", route: "RN2", km: "840 km", duration: "12h" },
  { name: "Brazzaville ↔ Djambala", route: "Plateaux", km: "410 km", duration: "5h30" },
  { name: "Pointe-Noire ↔ Sibiti", route: "Niari", km: "270 km", duration: "4h30" },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero : éléphant Nzoko en filigrane derrière le titre */}
      <section className="relative overflow-hidden bg-night text-white py-16 sm:py-24">
        <Watermark className="left-1/2 top-6 sm:top-2 -translate-x-1/2 w-[340px] sm:w-[560px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-[0.12em] mb-4">
            VOYAGEZ <span className="text-accent-500">AUTREMENT</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10">
            Réservez votre trajet facilement avec Nzoko Transport.
            Choisissez votre siège, payez par Mobile Money.
          </p>

          {/* Formulaire de recherche */}
          <SearchForm />
        </div>
      </section>

      {/* Le confort Nzoko : anthracite des sièges + éléphant décalé */}
      <section className="relative overflow-hidden bg-anthracite text-white py-16 px-4 sm:px-6">
        <Watermark className="-right-16 -bottom-20 w-[300px] sm:w-[420px]" />

        <div className="relative max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-[0.06em] mb-4">
              LE CONFORT <span className="text-accent-500">NZOKO</span>
            </h2>
            <p className="text-gray-300 leading-relaxed max-w-lg">
              Des bus confortables pour relier les grandes villes du Congo-Brazzaville,
              et une réservation pensée pour votre téléphone.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {AVANTAGES.map((a) => (
              <div key={a.title} className="rounded-xl bg-anthracite-dark border border-anthracite-light p-5">
                <span className="block w-8 h-[3px] bg-accent-500 mb-3" aria-hidden="true" />
                <h3 className="font-semibold mb-1">{a.title}</h3>
                <p className="text-sm text-gray-300">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Destinations */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="section-title text-center mb-10">
            Nos destinations
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {DESTINATIONS.map((dest) => (
              <div key={dest.route} className="bg-white border border-gray-200 border-l-4 border-l-accent-500 p-4 hover:shadow-md transition-shadow">
                <h3 className="font-bold text-night text-sm mb-1">{dest.name}</h3>
                <p className="text-xs text-gray-500">{dest.route} • {dest.km}</p>
                <p className="text-xs text-accent-700 font-semibold mt-1">~{dest.duration}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
