import { useState, useEffect } from "./html.js";

// Routeur basé sur le hash (#/chemin?clef=valeur) -> fonctionne en fichiers statiques.
export function parseHash() {
  let h = window.location.hash || "#/";
  if (h.startsWith("#")) h = h.slice(1);
  const [path, query = ""] = h.split("?");
  const params = {};
  new URLSearchParams(query).forEach((v, k) => (params[k] = v));
  return { path: path || "/", params };
}

export function navigate(path, params) {
  let hash = "#" + path;
  if (params && Object.keys(params).length) {
    const q = new URLSearchParams(params).toString();
    hash += "?" + q;
  }
  window.location.hash = hash;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
