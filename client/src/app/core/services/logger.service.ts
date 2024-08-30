import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  public log(msg: string): void {
    if (environment.production === false) {
      console.log(`[WebSocket] ${msg}`);
      console.log(new Date() + " [WebSocket]: " + JSON.stringify(msg));
    }
  }
}
