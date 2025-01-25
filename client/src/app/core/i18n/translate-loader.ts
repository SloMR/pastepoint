import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { translations, LanguageCode } from './translations';

export class InMemoryTranslateLoader implements TranslateLoader {
  getTranslation(lang: LanguageCode): Observable<any> {
    const translation = translations[lang] || translations['en'];
    if (translation) {
      return of(translation);
    } else {
      return of({});
    }
  }
}
