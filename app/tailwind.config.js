/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Học xanh trường — dựa trên xanh navy của bộ nhận diện ĐHQGHN */
        brand: {
          50: '#EFF4FC',
          100: '#DBE6F8',
          200: '#B7CBF0',
          300: '#87A8E2',
          400: '#527FCF',
          500: '#315CB4',
          600: '#224695',
          700: '#1A3778',
          800: '#142B5C',
          900: '#0C1B3B',
        },
        /* Giấy — nền ấm, phù hợp chữ dài tiếng Việt có dấu */
        paper: {
          50: '#FBFAF7',
          100: '#F6F4EF',
          200: '#ECE8DF',
          300: '#DED8CB',
          400: '#C6BDA9',
        },
        /* Nâu đất — dùng cho nhấn, số đếm, nút phụ */
        clay: {
          50: '#FBF5EF',
          100: '#F4E8DA',
          200: '#E7CFB4',
          300: '#D5AE85',
          400: '#C08C5C',
          500: '#A96F3F',
          600: '#8E562F',
          700: '#714225',
          800: '#57331F',
          900: '#40261A',
        },
        /* Xanh xác minh — dấu tick cho người có thẩm quyền */
        verify: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        ink: {
          DEFAULT: '#1A1A17',
          muted: '#5C5B54',
          faint: '#8A887E',
        },
      },
      fontFamily: {
        sans: [
          'Be Vietnam Pro',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'Noto Sans',
          'sans-serif',
        ],
        display: ['Be Vietnam Pro', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 43, 92, 0.05), 0 8px 24px -12px rgba(20, 43, 92, 0.18)',
        lift: '0 2px 4px rgba(20, 43, 92, 0.06), 0 18px 40px -16px rgba(20, 43, 92, 0.28)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      borderRadius: {
        card: '14px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.96)', opacity: '0.7' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 200ms ease-out both',
        'slide-in': 'slide-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-ring': 'pulseRing 900ms ease-out both',
      },
    },
  },
  plugins: [],
}
