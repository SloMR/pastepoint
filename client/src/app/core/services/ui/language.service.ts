import {
  Injectable,
  Inject,
  PLATFORM_ID,
  TransferState,
  makeStateKey,
  StateKey,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { ILanguageService } from '../../interfaces/language.interface';
import { LanguageCode } from '../../i18n/translate-loader';
import { LANGUAGE_PREFERENCE_KEY } from '../../../utils/constants';
import { NGXLogger } from 'ngx-logger';

@Injectable({
  providedIn: 'root',
})
export class LanguageService implements ILanguageService {
  /**
   * ==========================================================
   * CONSTANTS
   * Storage key for language preference
   * ==========================================================
   */
  private readonly LANGUAGE_STATE_KEY: StateKey<string> =
    makeStateKey<string>(LANGUAGE_PREFERENCE_KEY);

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection
   * ==========================================================
   */
  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private transferState: TransferState,
    private translateService: TranslateService,
    private logger: NGXLogger
  ) {}

  /**
   * ==========================================================
   * PUBLIC METHODS
   * APIs for language initialization and management
   * ==========================================================
   */
  initializeLanguage(): void {
    if (!isPlatformBrowser(this.platformId)) {
      // Server-side: set default language and store in transfer state
      const defaultLanguage: LanguageCode = 'en';
      this.transferState.set(this.LANGUAGE_STATE_KEY, defaultLanguage);
      this.translateService.setDefaultLang(defaultLanguage);
      this.translateService.use(defaultLanguage);
      this.logger.debug('initializeLanguage', 'Language Service (Server):', defaultLanguage);
    } else {
      // Client-side: prioritize localStorage over transfer state
      const storedLanguage = this.getLanguagePreference();
      this.logger.debug('initializeLanguage', 'Stored language from localStorage:', storedLanguage);

      let languagePreference: LanguageCode;

      if (storedLanguage) {
        // If user has a saved preference, use it
        languagePreference = storedLanguage;
        this.logger.debug(
          'initializeLanguage',
          'Using stored language preference:',
          languagePreference
        );
      } else if (this.transferState.hasKey(this.LANGUAGE_STATE_KEY)) {
        // Only use transfer state if no localStorage preference exists
        const transferredLang = this.transferState.get(this.LANGUAGE_STATE_KEY, 'en');
        languagePreference = transferredLang as LanguageCode;
        this.logger.debug(
          'initializeLanguage',
          'Using transferred language (no stored preference):',
          languagePreference
        );
      } else {
        // Default fallback
        languagePreference = 'en';
        this.logger.debug(
          'initializeLanguage',
          'Using default language (no preference found):',
          languagePreference
        );
      }

      // Clean up transfer state
      if (this.transferState.hasKey(this.LANGUAGE_STATE_KEY)) {
        this.transferState.remove(this.LANGUAGE_STATE_KEY);
      }

      this.applyLanguage(languagePreference);
      this.logger.debug(
        'initializeLanguage',
        'Language Service initialized with:',
        languagePreference
      );
    }
  }

  setLanguagePreference(language: LanguageCode): void {
    if (!isPlatformBrowser(this.platformId)) {
      // Server-side: just apply the language
      this.applyLanguage(language);
    } else {
      // Client-side: store in localStorage and apply
      localStorage.setItem(LANGUAGE_PREFERENCE_KEY, language);
      this.applyLanguage(language);
    }
  }

  getCurrentLanguage(): LanguageCode {
    return this.translateService.currentLang as LanguageCode;
  }

  /**
   * ==========================================================
   * PRIVATE METHODS
   * Utility methods for language operations
   * ==========================================================
   */
  private getLanguagePreference(): LanguageCode | null {
    if (!isPlatformBrowser(this.platformId)) {
      return 'en';
    }
    return localStorage.getItem(LANGUAGE_PREFERENCE_KEY) as LanguageCode;
  }

  private applyLanguage(language: LanguageCode): void {
    this.logger.debug('applyLanguage', 'Applying language:', language);
    this.translateService.setDefaultLang(language);
    this.translateService.use(language);
    this.logger.debug(
      'applyLanguage',
      'TranslateService currentLang after setting:',
      this.translateService.currentLang
    );

    // Update document language attribute for accessibility
    if (isPlatformBrowser(this.platformId)) {
      document.documentElement.lang = language;
      // Update direction for RTL languages
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      this.logger.debug('applyLanguage', 'Document lang set to:', document.documentElement.lang);
      this.logger.debug('applyLanguage', 'Document dir set to:', document.documentElement.dir);
    }
  }
}
