import { SearchForm } from "@/components/SearchForm";

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-night-dark via-night to-night-light text-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          {/* Logo elephant placeholder */}
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-accent-500 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-4xl">🐘</span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black mb-4">
            <span className="text-accent-500">Nzoko</span> Transport
          </h1>
          <p className="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-10">
            Voyagez en toute sécurité partout au Congo-Brazzaville.
            Réservez votre billet en ligne, payez par Mobile Money.
          </p>

          {/* Formulaire de recherche */}
          <SearchForm />
        </div>
      </section>

      {/* Section avantages */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <h2 className="section-title text-center mb-10">
          Pourquoi choisir Nzoko Transport ?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="card text-center">
            <div className="text-4xl mb-4">🛡️</div>
            <h3 className="font-bold text-lg text-night mb-2">Sécurité garantie</h3>
            <p className="text-gray-600 text-sm">
              Bus en excellent état, chauffeurs expérimentés, respect des horaires.
            </p>
          </div>

          <div className="card text-center">
            <div className="text-4xl mb-4">📱</div>
            <h3 className="font-bold text-lg text-night mb-2">Paiement Mobile Money</h3>
            <p className="text-gray-600 text-sm">
              Payez facilement via MTN Mobile Money ou Airtel Money. Simple et rapide.
            </p>
          </div>

          <div className="card text-center">
            <div className="text-4xl mb-4">💺</div>
            <h3 className="font-bold text-lg text-night mb-2">Choix du siège</h3>
            <p className="text-gray-600 text-sm">
              Sélectionnez votre place préférée sur le plan du bus avant le voyage.
            </p>
          </div>
        </div>
      </section>

      {/* Destinations populaires */}
      <section className="bg-gray-100 py-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="section-title text-center mb-10">
            Nos destinations
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "Brazzaville ↔ Pointe-Noire", route: "RN1", km: "540 km", duration: "8h" },
              { name: "Brazzaville ↔ Ouesso", route: "RN2", km: "840 km", duration: "12h" },
              { name: "Brazzaville ↔ Djambala", route: "Plateaux", km: "410 km", duration: "5h30" },
              { name: "Pointe-Noire ↔ Sibiti", route: "Niari", km: "270 km", duration: "4h30" },
            ].map((dest) => (
              <div key={dest.route} className="card text-center hover:shadow-lg transition-shadow">
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
