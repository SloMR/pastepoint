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
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
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
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
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
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Applied to all text through inheritance
      },
      spacing: {
        18: '4.5rem', // Not directly used in current HTML (available for custom spacing)
      },
      borderRadius: {
        xl: '1rem', // Used for message bubbles (rounded-s-xl, rounded-e-xl)
      },
      boxShadow: {
        soft: '0 4px 24px -2px rgb(0 0 0 / 0.1)', // Not directly used (available for custom shadows)
      },
    },
  },
  plugins: [require('flowbite/plugin')], // Used for interactive components (though not explicitly visible in current HTML)
  darkMode: 'class', // Used throughout HTML with dark: prefixes
};
