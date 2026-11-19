/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // NativeWind's web runtime syncs Appearance with the `dark` class; that throws
  // when darkMode stays at the default `media` strategy.
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};
