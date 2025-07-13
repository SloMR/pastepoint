import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, PreloadAllModules, withPreloading } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { InMemoryTranslateLoader } from './core/i18n/translate-loader';
import { ThemeService } from './core/services/ui/theme.service';
import { LanguageService } from './core/services/ui/language.service';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LoggerModule } from 'ngx-logger';
import { environment } from '../environments/environment';
import { DatePipe } from '@angular/common';
import { provideHotToastConfig } from '@ngneat/hot-toast';

// Theme initialization function
export function initializeTheme(themeService: ThemeService): () => Promise<void> {
  return () => {
    return new Promise((resolve) => {
      themeService.initializeTheme();
      setTimeout(resolve, 10);
    });
  };
}

// Language initialization function
export function initializeLanguage(languageService: LanguageService): () => Promise<void> {
  return () => {
    return new Promise((resolve) => {
      languageService.initializeLanguage();
      setTimeout(resolve, 10);
    });
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    provideAnimationsAsync(),
    provideZoneChangeDetection({ eventCoalescing: true, runCoalescing: true }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideClientHydration(withEventReplay()),
    provideAnimations(),
    provideHotToastConfig({
      position: 'top-center',
      duration: 2000,
      dismissible: true,
      autoClose: true,
      stacking: 'depth',
      visibleToasts: 3,
      reverseOrder: true,
      style: {
        borderRadius: '20px',
      },
    }),
    // Initialize translation module with in-memory loader
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        loader: {
          provide: TranslateLoader,
          useClass: InMemoryTranslateLoader,
        },
      }),
      LoggerModule.forRoot({
        level: environment.logLevel,
        timestampFormat: 'yyyy-MM-dd HH:mm:ss',
        enableSourceMaps: environment.enableSourceMaps,
        disableFileDetails: environment.disableFileDetails,
        disableConsoleLogging: environment.disableConsoleLogging,
      })
    ),
    DatePipe,
    // Initialize theme on app startup using app initializer
    provideAppInitializer(() => {
      const themeService = inject(ThemeService);
      void initializeTheme(themeService)();
    }),
    // Initialize language on app startup using app initializer
    provideAppInitializer(() => {
      const languageService = inject(LanguageService);
      void initializeLanguage(languageService)();
    }),
  ],
};
