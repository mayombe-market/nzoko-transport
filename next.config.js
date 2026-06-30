/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimisation images (si besoin d'un CDN plus tard)
  images: {
    unoptimized: true,
  },
  // Ignorer les erreurs TypeScript et ESLint pendant le build
  // (on les corrigera au fur et à mesure)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
