import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
    data: { preload: true },
  },
  {
    path: 'private/:code',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
    data: { preload: true },
  },
  {
    path: '404',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then((m) => m.NotFoundComponent),
    data: { preload: true },
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/privacy-and-terms/privacy-and-terms.component').then(
        (m) => m.PrivacyAndTermsComponent
      ),
    data: { preload: true },
  },
  { path: '**', redirectTo: '404' },
];
