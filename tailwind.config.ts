import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Short, quiet motion for live updates; every use is under motion-safe: so "reduce motion" turns it off.
      keyframes: {
        flash: { '0%': { backgroundColor: '#d3ebee', boxShadow: '0 0 0 2px #a6d5db' }, '100%': { backgroundColor: '#ffffff', boxShadow: '0 0 0 0 transparent' } },
        'slide-in': { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(0.6)' }, '60%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        flash: 'flash 1.8s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.25s ease-out',
        pop: 'pop 0.35s ease-out',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        canvas: '#f4f6f7',
        ink: { DEFAULT: '#0f1d24', soft: '#3d4c55', muted: '#5f6e77' },
        line: { DEFAULT: '#e1e6e9', strong: '#c9d1d6' },
        brand: {
          50: '#ecf6f7',
          100: '#d3ebee',
          200: '#a6d5db',
          500: '#1f8a96',
          600: '#0f6f7b',
          700: '#0b5a64',
          800: '#0a4850',
        },
        forest: {
          50: '#e9fbf1',
          200: '#b8f5d3',
          300: '#2ee88a',
          600: '#00a35c',
          700: '#00684a',
          800: '#00543c',
          900: '#0b3d36',
          950: '#022f38',
        },
        ok: { 50: '#ebf7f0', 100: '#d2eedd', 200: '#a8dcbd', 600: '#17804a', 700: '#11663b' },
        warn: { 50: '#fff6e5', 100: '#feeac2', 200: '#f5d08a', 600: '#a86400', 700: '#8a5200' },
        danger: { 50: '#fdeeee', 100: '#fad6d6', 200: '#f2b2b2', 600: '#c42b2b', 700: '#a11f1f' },
        lock: { 100: '#eef1f3', 300: '#cfd6db', 500: '#76848d', 600: '#5c6a73' },
      },
    },
  },
};

export default config;
