import { Observable } from 'rxjs';

export interface IUserService {
  user$: Observable<string>;
  user: string;
}
