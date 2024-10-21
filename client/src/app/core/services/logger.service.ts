import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  public info(msg: string): void {
    if (environment.production === false) {
      console.info(new Date().toLocaleTimeString() + ' [WebSocket]: ' + JSON.stringify(msg));
    }
  }

  public error(msg: string): void {
    if (environment.production === false) {
      console.error(new Date().toLocaleTimeString() + ' [WebSocket]: ' + JSON.stringify(msg));
    }
  }

  public warn(msg: string): void {
    if (environment.production === false) {
      console.warn(new Date().toLocaleTimeString() + ' [WebSocket]: ' + JSON.stringify(msg));
    }
  }

  public debug(msg: string): void {
    if (environment.production === false) {
      console.debug(new Date().toLocaleTimeString() + ' [WebSocket]: ' + JSON.stringify(msg));
    }
  }

  public trace(msg: string): void {
    if (environment.production === false) {
      console.trace(new Date().toLocaleTimeString() + ' [WebSocket]: ' + JSON.stringify(msg));
    }
  }
}
