import { NgxLoggerLevel } from 'ngx-logger';

export const environment = {
  production: false,
  apiUrl: '0.0.0.0:9000',
  logLevel: NgxLoggerLevel.DEBUG,
  enableSourceMaps: true,
  disableFileDetails: false,
  disableConsoleLogging: false,
};
