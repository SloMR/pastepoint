import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { IUserService } from '../../interfaces/user.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  /**
   * ==========================================================
   * PROPERTIES & OBSERVABLES
   * BehaviorSubject for user state
   * ==========================================================
   */
  private userSubject = new BehaviorSubject<string>('');
  public user$ = this.userSubject.asObservable();

  /**
   * ==========================================================
   * USER PROPERTIES
   * Getters and setters for user information
   * ==========================================================
   */
  public get user(): string {
    return this.userSubject.value;
  }

  public set user(value: string) {
    this.userSubject.next(value);
  }
}
