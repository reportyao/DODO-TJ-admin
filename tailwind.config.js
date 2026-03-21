/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2B5D3A',
        },
        secondary: {
          DEFAULT: '#4A90E2',
        },
        accent: {
          DEFAULT: '#F5A623',
        },
      },
    },
  },
  plugins: [],
}
