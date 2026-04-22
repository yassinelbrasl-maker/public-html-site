/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cortoba dark theme tokens — mirror existing style.css variables
        bg: {
          DEFAULT: "#0e0e0e",
          alt: "#141414",
          card: "#181818",
          elev: "#1a1a1a",
        },
        fg: {
          DEFAULT: "#ece7dd",
          muted: "#8c8a84",
        },
        gold: {
          DEFAULT: "#c8a96e",
          hover: "#dbbe82",
          dim: "#8a7649",
        },
        accent: "#c8a96e",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
