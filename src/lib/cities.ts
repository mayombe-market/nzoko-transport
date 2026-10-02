// Noms d'affichage (les identifiants viennent de la table cities / terminals)
export const CITY_NAMES: Record<string, string> = {
  brazzaville: "Brazzaville",
  kinkala: "Kinkala",
  mindouli: "Mindouli",
  madingou: "Madingou",
  nkayi: "Nkayi",
  loudima: "Loudima",
  dolisie: "Dolisie",
  pointenoire: "Pointe-Noire",
  gamboma: "Gamboma",
  oyo: "Oyo",
  owando: "Owando",
  makoua: "Makoua",
  ouesso: "Ouesso",
  djambala: "Djambala",
  sibiti: "Sibiti",
};

export const TERMINAL_NAMES: Record<string, string> = {
  "chateau-deau": "Château d'eau",
  mpila: "Mpila",
  mafouta: "Mafouta",
  "centre-ville": "Centre-ville",
  nkouikou: "Nkouikou",
  ngoyo: "Ngoyo",
};

export const cityName = (id: string) => CITY_NAMES[id] ?? id;
