import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppComponent } from './app.component';
import { ThemeService } from './core/services/theme.service';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ChatModule } from './features/chat/chat.module';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { InMemoryTranslateLoader } from './core/i18n/translate-loader';

const routes: Routes = [
  {
    path: 'chat',
    loadChildren: () => import('./features/chat/chat.module').then((m) => m.ChatModule),
  },
  { path: '', redirectTo: '/chat', pathMatch: 'full' },
];

export function initializeTheme(themeService: ThemeService): () => void {
  return () => themeService.initializeTheme();
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    RouterModule.forRoot(routes),
    ChatModule,
    TranslateModule.forRoot({
      defaultLanguage: 'en',
      loader: {
        provide: TranslateLoader,
        useClass: InMemoryTranslateLoader,
      },
    }),
  ],
  bootstrap: [AppComponent],
  providers: [
    provideAnimationsAsync(),
    provideHttpClient(withFetch()),
    provideAppInitializer(() => {
        const initializerFn = (initializeTheme)(inject(ThemeService));
        return initializerFn();
      }),
  ],
})
export class AppModule {}
