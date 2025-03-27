import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { IUserService } from '../../interfaces/user.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  private userSubject = new BehaviorSubject<string>('');
  public user$ = this.userSubject.asObservable();

  public get user(): string {
    return this.userSubject.value;
  }

  public set user(value: string) {
    this.userSubject.next(value);
  }
}
