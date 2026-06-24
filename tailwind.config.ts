import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Nzoko Transport — Bleu de nuit + Jaune
        primary: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd4ff",
          300: "#8ebaff",
          400: "#5994ff",
          500: "#1a3a6b",
          600: "#142e55",
          700: "#0f2340",
          800: "#0b1a30",
          900: "#071020",
          950: "#040a14",
        },
        accent: {
          50: "#fffef0",
          100: "#fffacc",
          200: "#fff599",
          300: "#ffed5c",
          400: "#ffe333",
          500: "#ffd700",
          600: "#e6c200",
          700: "#b39700",
          800: "#806c00",
          900: "#4d4100",
          950: "#332b00",
        },
        night: {
          DEFAULT: "#0f2340",
          light: "#1a3a6b",
          dark: "#071020",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
