/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./inv_armijhon_4.html', './admin.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#F7F3EA', 100: '#EFE8DA', 200: '#DED4C1', 300: '#C4B8A0',
          400: '#9C9280', 500: '#6A6459', 600: '#4A453C', 700: '#332F28',
          800: '#23241F', 900: '#171512', 950: '#100F0C'
        },
        indigo: {
          50: '#EAF1EC', 100: '#CFE0D5', 200: '#A3C4AF', 300: '#6E9E80',
          400: '#3D7A5A', 500: '#1D4A38', 600: '#15382B', 700: '#102A20',
          800: '#0C2018', 900: '#08150F'
        },
        violet: {
          50: '#FBF6EC', 100: '#F1E4C8', 200: '#E3CC9A', 300: '#D3B06A',
          400: '#C9A66B', 500: '#A8834A', 600: '#8B6B39', 700: '#6E542C',
          800: '#523E20', 900: '#382A15'
        },
        purple: {
          50: '#F9EDEA', 100: '#EFD2CA', 200: '#DFAB9C', 300: '#CC8069',
          400: '#BC5F45', 500: '#B4553F', 600: '#984635', 700: '#78372A',
          800: '#59291F', 900: '#3C1B15'
        },
        brand: {
          dark: '#171512', navy: '#23241F', indigo: '#15382B', violet: '#A8834A',
          purple: '#B4553F', accent: '#C9A66B', emerald: '#10b981', amber: '#C9A66B'
        }
      },
      fontFamily: {
        sans: ['Jost', 'sans-serif'],
        serif: ['Spectral', 'serif']
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(21, 56, 43, 0.15)',
        glow: '0 0 25px -5px rgba(168, 131, 74, 0.4)'
      }
    }
  },
  plugins: []
};
