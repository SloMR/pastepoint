import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: 'private/:code',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: '404',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
  },
  { path: '**', redirectTo: '404' },
];
