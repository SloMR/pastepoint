import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  public log(msg: string): void {
    if (environment.production === false) {
      console.log(new Date().toLocaleTimeString() + " [WebSocket]: " + JSON.stringify(msg));
    }
  }
}
