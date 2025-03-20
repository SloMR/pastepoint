import { NgxLoggerLevel } from 'ngx-logger';

export const environment = {
  production: true,
  apiUrl: 'pastepoint.com',
  logLevel: NgxLoggerLevel.ERROR,
  enableSourceMaps: false,
  disableFileDetails: true,
  disableConsoleLogging: true,
};
