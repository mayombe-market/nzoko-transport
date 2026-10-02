// Logo officiel Nzoko Transport (fichiers fournis par Nzoko, non redessinés)
// - /brand/nzoko-logo.png     : logo complet (éléphant + NZOKO + TRANSPORT), fond transparent
// - /brand/nzoko-elephant.png : symbole éléphant seul, fond transparent
// Les deux sont dorés : à utiliser sur fond Nuit Nzoko (#0E2930) ou anthracite.

export const LOGO_FULL_SRC = "/brand/nzoko-logo.png";
export const LOGO_ELEPHANT_SRC = "/brand/nzoko-elephant.png";

/** Logo complet — en-tête, pied de page, billet, connexion. */
export function LogoFull({ className = "h-12 w-auto" }: { className?: string }) {
  return <img src={LOGO_FULL_SRC} alt="Nzoko Transport" className={className} />;
}

/** Symbole éléphant seul — admin, mobile, petits éléments. */
export function LogoIcon({ className = "w-10 h-10" }: { className?: string }) {
  return <img src={LOGO_ELEPHANT_SRC} alt="Nzoko Transport" className={`${className} object-contain`} />;
}

/**
 * Éléphant en filigrane : grand, très peu opaque, derrière le contenu.
 * Le parent doit être `relative overflow-hidden` et le contenu passer au-dessus (`relative`).
 */
export function Watermark({ className = "" }: { className?: string }) {
  return <img src={LOGO_ELEPHANT_SRC} alt="" aria-hidden="true" className={`brand-watermark ${className}`} />;
}
