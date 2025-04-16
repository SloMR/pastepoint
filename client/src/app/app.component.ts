import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { MetaInitService } from './core/services/ui/meta-init.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit {
  title = 'PastePoint';

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private metaInitService: MetaInitService
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize application metadata
      this.metaInitService.initializeAppMetadata();
    }
  }
}
