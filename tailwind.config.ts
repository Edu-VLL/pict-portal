import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        edge: "rgb(var(--color-edge) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        // Replaces literal `white/NN` opacity utilities everywhere except a
        // few spots that are deliberately theme-independent (text on a solid
        // accent button, the badge initials, the drawing canvas overlay).
        fg: "rgb(var(--color-fg) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
