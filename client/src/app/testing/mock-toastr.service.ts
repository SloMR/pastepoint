import { Injectable } from '@angular/core';
import { IndividualConfig } from 'ngx-toastr';
import { Observable, of } from 'rxjs';

@Injectable()
export class MockToastrService {
  toasts: Array<{ type: string; message: string; title: string }> = [];
  private _config: Partial<IndividualConfig> | undefined;

  success(message: string, title?: string, config?: Partial<IndividualConfig>): Observable<any> {
    this._config = config;
    this.toasts.push({ type: 'success', message, title: title || '' });
    return of({});
  }

  error(message: string, title?: string, config?: Partial<IndividualConfig>): Observable<any> {
    this._config = config;
    this.toasts.push({ type: 'error', message, title: title || '' });
    return of({});
  }

  info(message: string, title?: string, config?: Partial<IndividualConfig>): Observable<any> {
    this._config = config;
    this.toasts.push({ type: 'info', message, title: title || '' });
    return of({});
  }

  warning(message: string, title?: string, config?: Partial<IndividualConfig>): Observable<any> {
    this._config = config;
    this.toasts.push({ type: 'warning', message, title: title || '' });
    return of({});
  }

  clear() {
    this.toasts = [];
    return of({});
  }
}
