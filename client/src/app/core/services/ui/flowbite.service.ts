import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class FlowbiteService {
  /**
   * ==========================================================
   * CONSTRUCTOR
   * Dependency injection
   * ==========================================================
   */
  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

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
