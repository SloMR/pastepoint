import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { LogLevel } from '../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private readonly production = environment.production;

  create(context: string) {
    return {
      debug: (fnName: string, msg: string) => this.log('DEBUG', context, fnName, msg),
      info: (fnName: string, msg: string) => this.log('INFO', context, fnName, msg),
      warn: (fnName: string, msg: string) => this.log('WARN', context, fnName, msg),
      error: (fnName: string, msg: string) => this.log('ERROR', context, fnName, msg),
      trace: (fnName: string, msg: string) => this.log('TRACE', context, fnName, msg),
    };
  }

  private log(level: LogLevel, context: string, fnName: string, msg: string): void {
    if (this.production) return;

    const timestamp = new Date().toLocaleTimeString();
    const message = `${timestamp} [Client] ${context}.${fnName}: ${JSON.stringify(msg)}`;

    switch (level) {
      case 'DEBUG':
        console.debug(message);
        break;
      case 'INFO':
        console.info(message);
        break;
      case 'WARN':
        console.warn(message);
        break;
      case 'ERROR':
        console.error(message);
        break;
      case 'TRACE':
        console.trace(message);
        break;
    }
  }
}
