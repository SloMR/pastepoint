import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  /**
   * ==========================================================
   * PROPERTIES
   * Configuration for API endpoint
   * ==========================================================
   */
  private baseUrl = `https://${environment.apiUrl}`;

  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection
   * ==========================================================
   */
  constructor(private http: HttpClient) {}

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
