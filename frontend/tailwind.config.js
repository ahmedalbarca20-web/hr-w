import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  // Absolute paths: Vite may run with cwd = monorepo root (e.g. Vercel); relative globs would miss ./frontend.
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{js,jsx,ts,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Material Dashboard brand palette
        brand: {
          DEFAULT: '#9c27b0',
          50:  '#f3e5f5',
          100: '#e1bee7',
          200: '#ce93d8',
          300: '#ba68c8',
          400: '#ab47bc',
          500: '#9c27b0',
          600: '#8e24aa',
          700: '#7b1fa2',
          800: '#6a1b9a',
          900: '#4a148c',
        },
        // Sidebar gradient colours
        sidebar: {
          from: '#1a2035',
          to:   '#1c1c2e',
          text: '#ffffff',
          muted:'rgba(255,255,255,0.6)',
          active:'rgba(255,255,255,0.15)',
        },
        // Semantic stat card accents
        info:    { DEFAULT: '#00bcd4', light: '#e0f7fa' },
        success: { DEFAULT: '#4caf50', light: '#e8f5e9' },
        warning: { DEFAULT: '#ff9800', light: '#fff3e0' },
        danger:  { DEFAULT: '#f44336', light: '#ffebee' },
      },
      fontFamily: {
        sans:  ['Inter', 'Cairo', 'sans-serif'],
        cairo: ['Cairo', 'sans-serif'],
      },
      boxShadow: {
        card:    '0 1px 4px 0 rgba(0,0,0,.14)',
        'card-lg': '0 4px 20px 0 rgba(0,0,0,.14)',
        icon:    '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(156,39,176,.4)',
        'icon-info':    '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(0,188,212,.4)',
        'icon-success': '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(76,175,80,.4)',
        'icon-warning': '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(255,152,0,.4)',
        'icon-danger':  '0 4px 20px 0 rgba(0,0,0,.14), 0 7px 10px -5px rgba(244,67,54,.4)',
      },
      borderRadius: {
        card: '0.375rem', // 6px – MD default
      },
      backgroundImage: {
        'sidebar-gradient': 'linear-gradient(195deg, #42424a, #191919)',
        'sidebar-gradient-purple': 'linear-gradient(195deg, #7b1fa2, #4a148c)',
        'brand-gradient': 'linear-gradient(195deg, #ec407a, #d81b60)',
        'info-gradient':  'linear-gradient(195deg, #26c6da, #0097a7)',
        'success-gradient':'linear-gradient(195deg, #66bb6a, #388e3c)',
        'warning-gradient':'linear-gradient(195deg, #ffa726, #f57c00)',
        'danger-gradient': 'linear-gradient(195deg, #ef5350, #c62828)',
      },
    },
  },
  plugins: [
    // @tailwindcss/forms loaded conditionally
  ],
};
