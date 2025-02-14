import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { InMemoryTranslateLoader } from './core/i18n/translate-loader';
import { ThemeService } from './core/services/theme.service';
import { provideHttpClient } from '@angular/common/http';

// Theme initialization function
export function initializeTheme(themeService: ThemeService): () => void {
  return () => themeService.initializeTheme();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    // Initialize translation module with in-memory loader
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useClass: InMemoryTranslateLoader,
        },
      })
    ),
    // Initialize theme on app startup using app initializer
    provideAppInitializer(() => {
      const themeService = inject(ThemeService);
      return initializeTheme(themeService)();
    }),
  ],
};
