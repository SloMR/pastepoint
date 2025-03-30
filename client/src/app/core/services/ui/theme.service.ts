import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IThemeService } from '../../interfaces/theme.interface';

@Injectable({
  providedIn: 'root',
})
export class ThemeService implements IThemeService {
  /**
   * ==========================================================
   * CONSTANTS
   * Storage key for theme preference
   * ==========================================================
   */
  private readonly THEME_KEY = 'themePreference';

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection
   * ==========================================================
   */
  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  /**
   * ==========================================================
   * PUBLIC METHODS
   * APIs for theme initialization and management
   * ==========================================================
   */
  initializeTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const themePreference = this.getThemePreference();
    this.applyTheme(themePreference);
  }

  setThemePreference(isDarkMode: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const themePreference = isDarkMode ? 'dark' : 'light';
    localStorage.setItem(this.THEME_KEY, themePreference);
    this.applyTheme(themePreference);
  }

  /**
   * ==========================================================
   * PRIVATE METHODS
   * Utility methods for theme operations
   * ==========================================================
   */
  private getThemePreference(): string | null {
    return localStorage.getItem(this.THEME_KEY);
  }

  private applyTheme(themePreference: string | null): void {
    if (!themePreference) {
      return;
    }
    document.body.classList.toggle('dark-mode', themePreference === 'dark');
    document.body.classList.toggle('light-mode', themePreference !== 'dark');
  }
}
