# 🌐 PastePoint Client (Angular Frontend)

The PastePoint client is a modern Angular application with Server-Side Rendering (SSR) support, providing an intuitive interface for file sharing and communication on local networks.

[![Angular](https://img.shields.io/badge/Angular-19-red)](https://angular.io/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-blue)](https://tailwindcss.com/)
[![Flowbite](https://img.shields.io/badge/Flowbite-3.0-cyan)](https://flowbite.com/)

## 🛠️ Tech Stack

### Development Tools

- **Build Tool**: Angular CLI with custom webpack configuration
- **Testing**: Jasmine and Karma for unit tests
- **Linting**: ESLint with Angular-specific rules
- **Formatting**: Prettier with custom configuration
- **Styling**: Stylelint for CSS/SCSS validation

## 📁 Project Structure

```
client/
├── 📁 src/
│   ├── 📁 app/
│   │   ├── 📁 core/
│   │   │   ├── 📁 i18n/           # Internationalization
│   │   │   ├── 📁 services/       # Core services
│   │   │   └── 📁 interfaces/     # TypeScript interfaces
│   │   ├── 📁 features/           # Features such as chat, file sharing, etc.
│   │   ├── 📁 utils/              # Utility functions
│   │   ├── 📁 testing/            # Test utilities
│   │   ├── app.component.*        # Root component
│   │   ├── app.routes.ts          # Application routes
│   │   └── app.config.*           # App configuration
│   ├── 📁 environments/           # Environment configs
│   ├── index.html                 # Main HTML file
│   ├── main.ts                    # Application entry point
│   ├── server.ts                  # SSR server
│   └── styles.css                 # Global styles
├── 📁 public/                     # Static assets
│   ├── favicon.*                  # Favicon files
│   ├── pastepoint-*.svg          # Logo files
│   └── *.png                     # App icons
├── 📁 dist/                       # Build output
├── 📁 node_modules/               # Dependencies
├── package.json                   # Project dependencies
├── angular.json                   # Angular CLI config
├── tailwind.config.js            # Tailwind CSS config
├── tsconfig.json                  # TypeScript config
├── Dockerfile                     # Docker configuration
└── README.md                      # Project documentation
```

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v22.4.0 (specified in `../.nvmrc`)
- **npm**: Latest version
- **Angular CLI**: `npm install -g @angular/cli`

### Development Setup

1. **Navigate to client directory**:

   ```bash
   cd client
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start development server**:

   ```bash
   ng serve
   ```

4. **Open browser**:
   Navigate to `http://localhost:4200`

## ⚙️ Configuration

### Environment Files

- `src/environments/environment.ts`: Development configuration
- `src/environments/environment.prod.ts`: Production configuration

Example environment configuration:

```typescript
export const environment = {
  production: false,
  apiUrl: 'https://localhost:9000',
  logLevel: NgxLoggerLevel.DEBUG,
  enableSourceMaps: true,
  disableFileDetails: false,
  disableConsoleLogging: false,
};
```

### Angular Configuration

Key configurations in `angular.json`:

- **Build optimization**: Bundle optimization and tree-shaking
- **SSR configuration**: Server-side rendering setup
- **Asset optimization**: Image and font optimization
- **Service worker**: PWA configuration

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in CI mode
npm run test:ci
```

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix ESLint issues
npm run lint:fix

# Run Prettier
npm run format
```

## 🎨 Styling and Theming

### Tailwind CSS Configuration

The project uses a custom Tailwind configuration with:

- **Custom color palette**: Brand-specific colors
- **Dark mode**: Class-based dark mode switching
- **Custom components**: Reusable component classes
- **Responsive breakpoints**: Mobile-first design

### Flowbite Integration

Flowbite components are integrated for:

- Navigation components
- Form elements
- Modal dialogs
- Toast notifications
- Loading indicators

## 🌐 Internationalization (i18n)

### Supported Languages

- English (default)
- Arabic
- ... (Add more as needed)

### Translation Files

```
src/app/core/i18n/translations.ts
```

### Usage

```typescript
type TranslationData = Record<string, string>;

export type LanguageCode = 'en' | 'ar';

export const translations: Record<LanguageCode, TranslationData> = {
  en: {
    INFO: 'Note',
  },
  ar: {
    INFO: 'تنبيه',
  },
};
```

## 🔧 Development Guide

### Adding New Features

1. **Generate component**:

   ```bash
   ng generate component features/feature-name
   ```

2. **Generate service**:

   ```bash
   ng generate service core/services/service-name
   ```

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Angular-specific rules
- **Prettier**: Consistent code formatting
- **Conventional Commits**: Standardized commit messages

## 🐛 Troubleshooting

### Common Issues

1. **Node Version Mismatch**:

   ```bash
   # Use correct Node version
   nvm use
   # Or install the specified version
   nvm install 22.4.0
   ```

2. **WebSocket Connection Issues**:
   - Check backend server is running
   - Verify SSL certificates are valid
   - Check CORS configuration

## 🤝 Contributing

- [Contributing](../CONTRIBUTING.md)

## 📜 License

This project is licensed under the GPL-3.0 License. See the [LICENSE](../LICENSE) file for details.

## 🔗 Related Documentation

- [Main Project README](../README.md)
- [Server README](../server/README.md)
- [Docker Compose Setup](../docker-compose.yml)
