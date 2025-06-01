import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { TranslateService } from '@ngx-translate/core';
import { LANGUAGE_PREFERENCE_KEY } from './app/utils/constants';

function getStoredLanguage(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    return localStorage.getItem(LANGUAGE_PREFERENCE_KEY) ?? 'en';
  }
  return 'en';
}

// Set document attributes immediately
const storedLang = getStoredLanguage();
if (typeof document !== 'undefined') {
  document.documentElement.lang = storedLang;
  document.documentElement.dir = storedLang === 'ar' ? 'rtl' : 'ltr';
}

// Then bootstrap with the correct language
bootstrapApplication(AppComponent, appConfig).then((appRef) => {
  const translate = appRef.injector.get(TranslateService);
  translate.setDefaultLang(storedLang);
  translate.use(storedLang);
});
