import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private userSubject = new BehaviorSubject<string>('');
  public user$ = this.userSubject.asObservable();

  public get user(): string {
    return this.userSubject.value;
  }

  public set user(value: string) {
    this.userSubject.next(value);
  }
}
