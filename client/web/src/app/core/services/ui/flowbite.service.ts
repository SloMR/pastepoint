import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class FlowbiteService {
  private platformId = inject(PLATFORM_ID);

  /**
   * ==========================================================
   * PUBLIC METHODS
   * Flowbite library loading and initialization
   * ==========================================================
   */
  loadFlowbite(callback: (flowbite: unknown) => void) {
    if (!isPlatformBrowser(this.platformId)) return;
    import('flowbite').then((flowbite) => {
      callback(flowbite);
    });
  }
}
