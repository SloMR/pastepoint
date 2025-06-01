import { Component, Inject, ChangeDetectorRef, PLATFORM_ID, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ThemeService } from '../../core/services/ui/theme.service';
import packageJson from '../../../../package.json';
import { NGXLogger } from 'ngx-logger';
import { MigrationService } from '../../core/services/migration/migration.service';
import { MetaService } from '../../core/services/ui/meta.service';
import { LanguageService } from '../../core/services/ui/language.service';
import { LanguageCode } from '../../core/i18n/translate-loader';
import { THEME_PREFERENCE_KEY } from '../../utils/constants';

@Component({
  imports: [CommonModule, RouterLink, NgOptimizedImage, TranslateModule],
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
})
export class NotFoundComponent implements OnInit {
  isDarkMode = false;
  currentLanguage: LanguageCode = 'en';
  appVersion: string = packageJson.version;

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    protected translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService,
    private languageService: LanguageService,
    private logger: NGXLogger,
    private migrationService: MigrationService,
    private metaService: MetaService
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.metaService.updateNotFoundMetadata();
      return;
    }
    // Check if migration is needed due to version change
    const migrationPerformed = this.migrationService.checkAndMigrateIfNeeded(this.appVersion, true);
    if (migrationPerformed) {
      this.logger.debug('ngOnInit', 'Migration performed due to version change');
    } else {
      this.logger.debug('ngOnInit', 'No migration needed');
    }

    const themePreference = localStorage.getItem(THEME_PREFERENCE_KEY);
    this.isDarkMode = themePreference === 'dark';
    this.applyTheme(this.isDarkMode);

    // Set specific meta tags for 404 page
    this.metaService.updateNotFoundMetadata();

    // Get current language from language service
    this.currentLanguage = this.languageService.getCurrentLanguage();
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.themeService.setThemePreference(this.isDarkMode);
    this.applyTheme(this.isDarkMode);
    this.cdr.detectChanges();
  }

  private applyTheme(isDark: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      const htmlElement = document.documentElement;
      if (isDark) {
        htmlElement.classList.add('dark');
        htmlElement.setAttribute('data-theme', 'dark');
      } else {
        htmlElement.classList.remove('dark');
        htmlElement.setAttribute('data-theme', 'light');
      }
    }
  }

  switchLanguage(language: string) {
    const languageCode = language as LanguageCode;
    this.languageService.setLanguagePreference(languageCode);
    this.currentLanguage = languageCode;
    this.cdr.detectChanges();
  }

  get isRTL(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return document.dir === 'rtl' || this.currentLanguage === 'ar';
  }
}
