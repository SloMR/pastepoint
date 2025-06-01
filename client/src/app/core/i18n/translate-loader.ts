import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { translations, LanguageCode } from './translations';

type TranslationObject = Record<string, string>;

export class InMemoryTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<TranslationObject> {
    const languageCode = lang as LanguageCode;
    const translation = translations[languageCode] || translations.en;
    if (translation) {
      return of(translation);
    } else {
      return of({});
    }
  }
}
