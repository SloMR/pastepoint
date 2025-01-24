import 'zone.js/node';

import { APP_BASE_HREF } from '@angular/common';
import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync } from 'fs';
import { renderModule } from '@angular/platform-server';
import AppServerModule from './src/main.server';

export function app(): express.Express {
  const server = express();

  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtmlPath = join(serverDistFolder, 'index.server.html');
  
  const indexHtmlContent = readFileSync(indexHtmlPath, 'utf-8');

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  server.get('*.*', express.static(browserDistFolder, { maxAge: '1y', index: false }));

  server.get('*', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const html = await renderModule(AppServerModule, {
        document: indexHtmlContent,
        url: req.originalUrl,
        extraProviders: [
          { provide: APP_BASE_HREF, useValue: req.baseUrl },
        ],
      });
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

run();
