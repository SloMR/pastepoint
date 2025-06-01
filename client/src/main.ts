import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { TranslateService } from '@ngx-translate/core';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => {
    // Set the default language and the current language to the browser language
    const translate = appRef.injector.get(TranslateService);
    const browserLang = translate.getBrowserLang() || 'en';
    const languageToUse = browserLang.match(/en|ar/) ? browserLang : 'en';

    translate.setDefaultLang(languageToUse);
    translate.use(languageToUse);
  })
  .catch((err) => { console.error(err); });
