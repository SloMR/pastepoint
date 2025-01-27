import { enableProdMode } from '@angular/core';
import { environment } from './app/environments/environment';

if (environment.production) {
  enableProdMode();
}

export { AppServerModule } from './app/app.module.server';
