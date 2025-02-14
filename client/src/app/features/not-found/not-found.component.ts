import { Component, Inject, ChangeDetectorRef, PLATFORM_ID, OnInit } from '@angular/core';
import { CommonModule, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ThemeService } from '../../core/services/theme.service';

@Component({
  imports: [CommonModule, RouterLink, NgOptimizedImage, TranslateModule],
  selector: 'app-not-found',
  templateUrl: './not-found.component.html',
})
export class NotFoundComponent implements OnInit {
  isDarkMode = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    protected translate: TranslateService,
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService
  ) {
    this.translate.setDefaultLang('en');

    const browserLang = this.translate.getBrowserLang() || 'en';
    const languageToUse = browserLang.match(/en|ar/) ? browserLang : 'en';
    this.translate.use(languageToUse);
  }

  ngOnInit(): void {
    const themePreference = localStorage.getItem('themePreference');
    this.isDarkMode = themePreference === 'dark';
    this.applyTheme(this.isDarkMode);
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
    this.translate.use(language);
  }

  get isRTL(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return document.dir === 'rtl' || this.translate.currentLang === 'ar';
  }
}
