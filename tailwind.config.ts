import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        openclaw: { DEFAULT: '#5b9cf5', light: '#8bbdff', dark: '#3a7ad4' },
        hermes: { DEFAULT: '#f55b5b', light: '#ff8888', dark: '#d43a3a' },
        accent: { DEFAULT: '#7c5cfc', light: '#a08aff', dark: '#5a3ad4' },
        canvas: { DEFAULT: '#0d0d1a', grid: '#1a1a3a' },
      },
    },
  },
  plugins: [],
}
export default config
