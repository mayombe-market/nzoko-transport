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
        // Nzoko Transport — charte officielle (logo + intérieur des bus)
        // Nuit Nzoko #0E2930 · Or Nzoko #E2AB35 · Anthracite sièges #3E3E39 · Crème #F7F4EC
        primary: {
          50: "#eef6f7",
          100: "#d5e9ec",
          200: "#aed3d9",
          300: "#7cb4bd",
          400: "#2c6b76",
          500: "#1d4a54",
          600: "#15393f",
          700: "#0e2930",
          800: "#0a1f24",
          900: "#071518",
          950: "#040c0e",
        },
        accent: {
          50: "#fdf8ec",
          100: "#faefd2",
          200: "#f4dca0",
          300: "#edc76c",
          400: "#e7b84b",
          500: "#e2ab35",
          600: "#c98f22",
          700: "#a7711d",
          800: "#87591e",
          900: "#6f4a1c",
          950: "#40270c",
        },
        night: {
          DEFAULT: "#0e2930",
          light: "#15404a",
          dark: "#08191d",
        },
        anthracite: {
          DEFAULT: "#3e3e39",
          light: "#55554f",
          dark: "#2b2b28",
        },
        creme: "#f7f4ec",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-montserrat)", "Montserrat", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
