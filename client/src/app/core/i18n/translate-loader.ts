import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import enTranslations from './localizations/en.json';
import arTranslations from './localizations/ar.json';

export type LanguageCode = 'en' | 'ar';
type TranslationObject = Record<string, string>;

export class InMemoryTranslateLoader implements TranslateLoader {
  private translations: { en: TranslationObject; ar: TranslationObject } = {
    en: enTranslations,
    ar: arTranslations,
  };

  getTranslation(lang: LanguageCode): Observable<TranslationObject> {
    switch (lang) {
      case 'en':
        return of(this.translations.en);
      case 'ar':
        return of(this.translations.ar);
    }
  }
}
