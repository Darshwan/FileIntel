/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,md,mjs,cjs}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        fi: {
          ink: '#0f0f0d',
          'ink-2': '#3a3a35',
          'ink-3': '#7a7a72',
          paper: '#f5f3ee',
          'paper-2': '#eceae3',
          'paper-3': '#e2dfd6',
          accent: '#c8432a',
          'accent-2': '#e8563d',
          green: '#2a6b4a',
          'green-light': '#e8f2ec',
          border: '#d4d1c8',
          white: '#fafaf8',
        },
      },
      boxShadow: {
        'fi-sm': '0 1px 3px rgba(15,15,13,0.08), 0 1px 2px rgba(15,15,13,0.06)',
        'fi-md': '0 4px 16px rgba(15,15,13,0.10), 0 2px 6px rgba(15,15,13,0.06)',
        'fi-lg': '0 20px 60px rgba(15,15,13,0.12), 0 8px 24px rgba(15,15,13,0.08)',
      },
    },
  },
  plugins: [],
};