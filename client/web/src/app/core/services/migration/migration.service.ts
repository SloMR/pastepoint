import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NGXLogger } from 'ngx-logger';
import { IMigrationService } from '../../interfaces/migration.interface';
import { APP_VERSION_KEY, THEME_PREFERENCE_KEY, SESSION_CODE_KEY } from '../../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class MigrationService implements IMigrationService {
  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection
   * ==========================================================
   */
  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private logger: NGXLogger
  ) {}

  /**
   * ==========================================================
   * PUBLIC METHODS
   * External API for version checking and migration
   * ==========================================================
   */
  /**
   * Checks if the application version has changed and runs migration if needed
   * @param currentVersion The current application version from package.json
   * @param forceCleanForNewUsers If true, will perform migration for users who don't have a version key yet
   * @returns boolean indicating if migration was performed
   */
  public checkAndMigrateIfNeeded(currentVersion: string, forceCleanForNewUsers = false): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;

    const storedVersion = localStorage.getItem(APP_VERSION_KEY);

    if (storedVersion === null) {
      this.logger.debug(
        'MigrationService',
        `First-time version check: setting to ${currentVersion}`
      );

      if (forceCleanForNewUsers) {
        this.logger.debug('MigrationService', 'Performing initial migration for new/existing user');
        this.performMigration();
      } else {
        this.logger.debug('MigrationService', 'No migration needed for new user');
      }

      localStorage.setItem(APP_VERSION_KEY, currentVersion);
      return forceCleanForNewUsers;
    }

    if (storedVersion !== currentVersion) {
      this.logger.debug(
        'MigrationService',
        `Version change detected: ${storedVersion} → ${currentVersion}`
      );
      this.performMigration();
      localStorage.setItem(APP_VERSION_KEY, currentVersion);
      return true;
    }

    return false;
  }

  /**
   * ==========================================================
   * PRIVATE METHODS
   * Storage cleanup implementation
   * ==========================================================
   */
  /**
   * Clears all client-side storage
   * - localStorage
   * - sessionStorage
   * - cookies
   */
  private performMigration(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.logger.debug('MigrationService', 'Performing migration - clearing all storage');

    this.clearLocalStorage();
    this.clearSessionStorage();
    this.clearCookies();
  }

  /**
   * Clears all localStorage items except the version key, theme preference, and session code
   */
  private clearLocalStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const versionValue = localStorage.getItem(APP_VERSION_KEY);
    const themeValue = localStorage.getItem(THEME_PREFERENCE_KEY);
    const sessionValue = localStorage.getItem(SESSION_CODE_KEY);
    localStorage.clear();

    if (versionValue) {
      localStorage.setItem(APP_VERSION_KEY, versionValue);
    }
    if (themeValue) {
      localStorage.setItem(THEME_PREFERENCE_KEY, themeValue);
    }
    if (sessionValue) {
      localStorage.setItem(SESSION_CODE_KEY, sessionValue);
    }
    this.logger.debug('MigrationService', 'localStorage cleared');
  }

  /**
   * Clears all sessionStorage items
   */
  private clearSessionStorage(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    sessionStorage.clear();
    this.logger.debug('MigrationService', 'sessionStorage cleared');
  }

  /**
   * Clears all cookies
   */
  private clearCookies(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const cookies = document.cookie.split(';');

    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }

    this.logger.debug('MigrationService', 'All cookies cleared');
  }
}
