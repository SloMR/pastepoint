import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import enTranslations from './localizations/en.json';
import arTranslations from './localizations/ar.json';

export type LanguageCode = 'en' | 'ar';
type TranslationObject = Record<string, string>;

export class InMemoryTranslateLoader implements TranslateLoader {
  private translations: Record<string, TranslationObject> = {
    en: enTranslations,
    ar: arTranslations,
  };

  getTranslation(lang: LanguageCode): Observable<TranslationObject> {
    const translation = this.translations[lang];
    return of(translation);
  }
}
