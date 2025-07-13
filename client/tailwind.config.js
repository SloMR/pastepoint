module.exports = {
  content: ['./src/**/*.{html,ts}', './node_modules/flowbite/**/*.js'],
  theme: {
    extend: {
      colors: {
        // Used in:
        // - Header background (bg-primary-100)
        // - Menu backgrounds (bg-primary-100)
        // - Active buttons (bg-primary-600)
        // - User avatar (bg-primary-500)
        // - Message bubbles (bg-primary-600)
        // - Progress bars (bg-primary-600)
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          150: '#cdeafe',
          200: '#bae6fd',
          250: '#9bdcfc',
          300: '#7dd3fc',
          350: '#5ac8fa',
          400: '#38bdf8',
          450: '#23b1f0',
          500: '#0ea5e9',
          550: '#0894d8',
          600: '#0284c7',
          650: '#0276b4',
          700: '#0369a1',
          750: '#056193',
          800: '#075985',
          850: '#095179',
          900: '#0c4a6e',
        },
        // Used in:
        // - Text colors (text-secondary-900)
        // - Dark mode backgrounds (dark:bg-secondary-900)
        // - Borders (border-secondary-700)
        // - Input backgrounds (dark:bg-secondary-700)
        // - Disabled states (text-secondary-500)
        secondary: {
          50: '#f9fafb',
          100: '#f3f4f6',
          150: '#eceef0',
          200: '#e5e7eb',
          250: '#dbdee3',
          300: '#d1d5db',
          350: '#b6bcc5',
          400: '#9ca3af',
          450: '#838a97',
          500: '#6b7280',
          550: '#5b6371',
          600: '#4b5563',
          650: '#414b5a',
          700: '#374151',
          750: '#2b3544',
          800: '#1f2937',
          850: '#18202f',
          900: '#111827',
        },
        // Used in:
        // - Download progress bars (bg-success-600)
        // - Accept buttons (bg-success-600)
        success: {
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        // Used in:
        // - Cancel buttons (bg-danger-600)
        // - Decline buttons (bg-danger-600)
        danger: {
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        },

        first: '#3c54f0',
        second: '#f0f4ff',
        brownBlack: '#333333',
        brownBlackDark: '#9ca3af',
        danger: '#d93333',
        firstDark: '#6366f1',
        secondDark: '#1f2937',
        baseDark: '#111827',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        expoArabicBold: ['expo-arabic-bold', 'sans-serif'],
        expoArabicMedium: ['expo-arabic-medium', 'sans-serif'],
        expoArabicLight: ['expo-arabic-light', 'sans-serif'],
      },
      spacing: {
        18: '4.5rem',
      },
      borderRadius: {
        xl: '1rem',
      },
      boxShadow: {
        soft: '0 4px 24px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [require('flowbite/plugin')],
  darkMode: 'class',
};
