import {APP_INITIALIZER, NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {FormsModule} from '@angular/forms';
import {RouterModule, Routes} from '@angular/router';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';

import {AppComponent} from './app.component';
import {ThemeService} from "./core/services/theme.service";
import {provideAnimationsAsync} from '@angular/platform-browser/animations/async';
import {ChatModule} from './features/chat/chat.module';

const routes: Routes = [
  {path: 'chat', loadChildren: () => import('./features/chat/chat.module').then(m => m.ChatModule)},
  {path: '', redirectTo: '/chat', pathMatch: 'full'}
];

export function initializeTheme(themeService: ThemeService): () => void {
  return () => themeService.initializeTheme();
}

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    RouterModule.forRoot(routes),
    ChatModule
  ],
  bootstrap: [AppComponent],
  providers: [
    provideAnimationsAsync(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTheme,
      deps: [ThemeService],
      multi: true
    }
  ]
})
export class AppModule {
}
