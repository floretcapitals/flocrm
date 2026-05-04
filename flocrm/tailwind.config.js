/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#185FA5', dark: '#0C447C', light: '#E6F1FB' },
      },
    },
  },
  plugins: [],
}
