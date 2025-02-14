import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private baseUrl = `https://${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  createNewSessionCode() {
    return this.http.get<{ code: string }>(`${this.baseUrl}/create-session`);
  }
}
