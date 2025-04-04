import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgIf, isPlatformBrowser } from '@angular/common';
import { MetaInitService } from './core/services/ui/meta-init.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  imports: [RouterOutlet, NgIf],
})
export class AppComponent implements OnInit {
  isBrowser!: boolean;
  title = 'PastePoint';

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private metaInitService: MetaInitService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.isBrowser) {
      // Initialize application metadata
      this.metaInitService.initializeAppMetadata();
    }
  }
}
