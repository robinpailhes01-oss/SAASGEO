import type { Config } from "tailwindcss";

// Palette Ankora — definie en Phase 0 (cadrage design)
// Indigo profond + degrade indigo->violet->rose poudre
// Fond off-white legerement lavande
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // Tokens shadcn (HSL via CSS vars dans globals.css)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Couleurs brand explicites (utilisables en classes directes)
        ankora: {
          ink: "#1E1B4B",
          "ink-hover": "#2D2A5C",
          lavender: "#F0EFFB",
          mist: "#FAFAFE",
          border: "#E8E7F4",
          text: "#0F0E2E",
          "text-soft": "#4A4773",
          "text-muted": "#8B89A7",
        },
      },
      backgroundImage: {
        // Degrade signature Ankora : indigo -> violet -> rose poudre
        "ankora-gradient":
          "linear-gradient(135deg, #6366F1 0%, #A78BFA 50%, #F0ABFC 100%)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // Geist (package "geist" Vercel) pour les titres, Inter pour le corps
        display: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      boxShadow: {
        // Ombres douces pour cards flottantes (cf. references SEOGenie/Earnwave)
        "ankora-soft": "0 4px 24px rgba(30, 27, 75, 0.06)",
        "ankora-card": "0 8px 32px rgba(30, 27, 75, 0.08)",
        "ankora-elevated": "0 12px 48px rgba(30, 27, 75, 0.12)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
