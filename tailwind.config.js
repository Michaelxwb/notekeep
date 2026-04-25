/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#1a1a2e',
        foreground: '#eaeaea',
        accent: '#7c3aed',
      },
    },
  },
  plugins: [],
}
