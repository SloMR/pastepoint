import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'themePreference';

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  initializeTheme(): void {
    if (isPlatformBrowser(this.platformId)) {
      const themePreference = localStorage.getItem(this.THEME_KEY);
      if (themePreference === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.add('light-mode');
      }
    }
  }

  setThemePreference(isDarkMode: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      const themePreference = isDarkMode ? 'dark' : 'light';
      localStorage.setItem(this.THEME_KEY, themePreference);
      document.body.classList.toggle('dark-mode', isDarkMode);
      document.body.classList.toggle('light-mode', !isDarkMode);
    }
  }
}
