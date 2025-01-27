import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  public info(msg: string): void {
    if (!environment.production) {
      console.info(new Date().toLocaleTimeString() + ' [Client]: ' + JSON.stringify(msg));
    }
  }

  public error(msg: string): void {
    if (!environment.production) {
      console.error(new Date().toLocaleTimeString() + ' [Client]: ' + JSON.stringify(msg));
    }
  }

  public warn(msg: string): void {
    if (!environment.production) {
      console.warn(new Date().toLocaleTimeString() + ' [Client]: ' + JSON.stringify(msg));
    }
  }

  public debug(msg: string): void {
    if (!environment.production) {
      console.debug(new Date().toLocaleTimeString() + ' [Client]: ' + JSON.stringify(msg));
    }
  }

  public trace(msg: string): void {
    if (!environment.production) {
      console.trace(new Date().toLocaleTimeString() + ' [Client]: ' + JSON.stringify(msg));
    }
  }
}
