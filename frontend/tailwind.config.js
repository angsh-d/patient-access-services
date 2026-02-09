/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        grey: {
          50:  '#f9f9fb',
          100: '#f2f2f7',
          200: '#e5e5ea',
          300: '#d1d1d6',
          400: '#aeaeb2',
          500: '#8e8e93',
          600: '#636366',
          700: '#48484a',
          800: '#2c2c2e',
          900: '#1c1c1e',
          950: '#0a0a0c',
        },
        semantic: {
          success: '#30D158',
          warning: '#FF9F0A',
          error:   '#FF453A',
          info:    '#0A84FF',
        },
        accent: {
          DEFAULT: '#007AFF',
          hover: '#0066D6',
          light: 'rgba(0, 122, 255, 0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs':   ['0.6875rem', { lineHeight: '1rem', letterSpacing: '-0.003em' }],
        'sm':   ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '-0.006em' }],
        'base': ['0.9375rem', { lineHeight: '1.5rem', letterSpacing: '-0.009em' }],
        'lg':   ['1.0625rem', { lineHeight: '1.625rem', letterSpacing: '-0.014em' }],
        'xl':   ['1.1875rem', { lineHeight: '1.75rem', letterSpacing: '-0.017em' }],
        '2xl':  ['1.5rem', { lineHeight: '1.875rem', letterSpacing: '-0.022em' }],
        '3xl':  ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        '4xl':  ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.028em' }],
        '5xl':  ['3rem', { lineHeight: '1', letterSpacing: '-0.032em' }],
        '6xl':  ['3.75rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
        '7xl':  ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.04em' }],
        '8xl':  ['6rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        'lg': '10px',
        'xl': '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '250ms',
        'slow': '400ms',
      },
      boxShadow: {
        'subtle': '0 0.5px 1px rgba(0, 0, 0, 0.03)',
        'card': '0 0.5px 1px rgba(0, 0, 0, 0.02), 0 1px 3px rgba(0, 0, 0, 0.04)',
        'elevated': '0 1px 2px rgba(0, 0, 0, 0.03), 0 4px 12px rgba(0, 0, 0, 0.06)',
        'floating': '0 2px 4px rgba(0, 0, 0, 0.02), 0 8px 24px rgba(0, 0, 0, 0.08)',
        'modal': '0 4px 8px rgba(0, 0, 0, 0.04), 0 16px 48px rgba(0, 0, 0, 0.12)',
      },
      backdropBlur: {
        'glass': '20px',
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2.5s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.75' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
