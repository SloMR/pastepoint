import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable()
export class MockTranslateService {
  public currentLang = 'en';
  public defaultLang = 'en';

  private translations: Record<string, Record<string, string>> = {
    en: {
      APP_TITLE: 'PastePoint',
      TOGGLE_THEME: 'Toggle Theme',
      USER_INFO: 'User Info',
      ROOMS: 'Rooms',
      NEW_ROOM: 'New Room',
      JOIN_CREATE: 'Join/Create',
      MEMBERS: 'Members',
      PRIVATE_SESSION: 'Private Session',
      SESSION_CODE: 'Session Code',
      GO_BACK_HOME: 'Go Back Home',
      PAGE_NOT_FOUND: 'Page Not Found',
      COPYRIGHT_NOTICE: '© 2025 PastePoint. All rights reserved.',
      VERSION: 'Version',
    },
    ar: {
      APP_TITLE: 'PastePoint',
      TOGGLE_THEME: 'تبديل السمة',
      USER_INFO: 'معلومات المستخدم',
      ROOMS: 'الغرف',
    },
  };
  private _interpolateParams: object | undefined;
  private _langs: string[] | undefined;

  get(key: string | Array<string>, interpolateParams?: object): Observable<string | object> {
    this._interpolateParams = interpolateParams;
    if (typeof key === 'string') {
      return of(this.translations[this.currentLang]?.[key] || key);
    }
    const result: Record<string, string> = {};
    key.forEach((k) => {
      result[k] = this.translations[this.currentLang]?.[k] || k;
    });
    return of(result);
  }

  instant(key: string | string[], interpolateParams?: object): string | any {
    this._interpolateParams = interpolateParams;
    if (typeof key === 'string') {
      return this.translations[this.currentLang]?.[key] || key;
    }
    const result: Record<string, string> = {};
    key.forEach((k) => {
      result[k] = this.translations[this.currentLang]?.[k] || k;
    });
    return result;
  }

  getBrowserLang(): string {
    return 'en';
  }

  setDefaultLang(lang: string): void {
    this.defaultLang = lang;
  }

  use(lang: string): Observable<any> {
    this.currentLang = lang;
    return of({});
  }

  addLangs(langs: string[]): void {
    this._langs = langs;
  }

  getLangs(): string[] {
    return Object.keys(this.translations);
  }

  getTranslation(lang: string): Observable<any> {
    return of(this.translations[lang] || {});
  }

  onLangChange = new Observable();
  onTranslationChange = new Observable();
  onDefaultLangChange = new Observable();
}
