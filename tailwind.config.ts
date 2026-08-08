import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        panel: "#171a21",
        edge: "#262b36",
        accent: "#6366f1",
      },
    },
  },
  plugins: [],
};

export default config;
