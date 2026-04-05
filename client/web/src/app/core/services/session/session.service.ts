import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private http = inject(HttpClient);

  /**
   * ==========================================================
   * PROPERTIES
   * Configuration for API endpoint
   * ==========================================================
   */
  private baseUrl = `https://${environment.apiUrl}`;

  /**
   * ==========================================================
   * PUBLIC METHODS
   * API for session management
   * ==========================================================
   */
  createNewSessionCode() {
    return this.http.get<{ code: string }>(`${this.baseUrl}/create-session`);
  }
}
