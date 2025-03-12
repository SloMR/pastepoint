import { NgxLoggerLevel } from 'ngx-logger';

export const environment = {
  production: true,
  apiUrl: 'api.mydomain.com',
  logLevel: NgxLoggerLevel.ERROR,
  enableSourceMaps: false,
  disableFileDetails: true,
  disableConsoleLogging: true,
};
