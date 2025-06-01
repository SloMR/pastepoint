import { LanguageCode } from '../i18n/translate-loader';

export interface ILanguageService {
  initializeLanguage(): void;
  setLanguagePreference(language: LanguageCode): void;
  getCurrentLanguage(): LanguageCode;
}
