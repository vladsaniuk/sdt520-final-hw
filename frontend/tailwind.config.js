/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        aws: {
          orange: '#FF9900',
          'orange-dark': '#E8891A',
          squid: '#232F3E',
          'squid-light': '#37475A',
          'squid-dark': '#1A232E',
        },
      },
    },
  },
  plugins: [],
}
