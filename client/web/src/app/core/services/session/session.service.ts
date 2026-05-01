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

  /**
   * Validates that the session code is exactly 10 alphanumeric characters.
   */
  isValidSessionCode(code: string): boolean {
    const sessionCodeRegex = /^[a-zA-Z0-9]+$/;
    return sessionCodeRegex.test(code) && code.length === 10;
  }

  /**
   * Strips any non-alphanumeric characters from a session code.
   */
  sanitizeSessionCode(code: string): string {
    return code.replace(/[^a-zA-Z0-9]/g, '');
  }
}
