import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'themePreference';

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  initializeTheme(): void {
    if (isPlatformBrowser(this.platformId)) {
      const themePreference = this.getThemePreference();
      this.applyTheme(themePreference);
    }
  }

  setThemePreference(isDarkMode: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      const themePreference = isDarkMode ? 'dark' : 'light';
      localStorage.setItem(this.THEME_KEY, themePreference);
      this.applyTheme(themePreference);
    }
  }

  private getThemePreference(): string | null {
    return localStorage.getItem(this.THEME_KEY);
  }

  private applyTheme(themePreference: string | null): void {
    document.body.classList.toggle('dark-mode', themePreference === 'dark');
    document.body.classList.toggle('light-mode', themePreference !== 'dark');
  }
}
