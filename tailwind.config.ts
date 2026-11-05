import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#050507',
          900: '#0a0a0e',
          850: '#0e0f14',
          800: '#13141b',
          750: '#181a22',
          700: '#1f212b',
          600: '#2a2d3a',
          500: '#3a3d4d',
          400: '#5c6075',
          300: '#8a8ea3',
          200: '#b4b7c7',
          100: '#e4e5ee',
        },
        volt: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
        surge: { 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb' },
        cyanx: { 400: '#22d3ee' },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.35), 0 8px 30px -8px rgba(139,92,246,.45)',
        panel: '0 1px 0 0 rgba(255,255,255,.03) inset, 0 10px 30px -15px rgba(0,0,0,.8)',
      },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        slideIn: { from: { opacity: '0', transform: 'translateY(-6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { pulseDot: 'pulseDot 1.6s ease-in-out infinite', slideIn: 'slideIn .35s ease-out' },
    },
  },
  plugins: [],
} satisfies Config;
