export interface IMigrationService {
  checkAndMigrateIfNeeded(currentVersion: string, forceCleanForNewUsers?: boolean): boolean;
}
