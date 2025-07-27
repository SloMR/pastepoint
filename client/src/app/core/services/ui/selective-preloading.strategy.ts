import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Custom preloading strategy that only preloads routes marked as critical
 * This replaces PreloadAllModules to reduce initial JavaScript loading
 */
@Injectable({
  providedIn: 'root',
})
export class SelectivePreloadingStrategy implements PreloadingStrategy {
  /**
   * Determines whether a route should be preloaded
   * @param route - The route to check
   * @param fn - The function to load the route module
   * @returns Observable that loads the route if it should be preloaded
   */
  preload(route: Route, fn: () => Observable<unknown>): Observable<unknown> {
    // Only preload routes that are explicitly marked as critical
    if (route.data && route.data['preload'] === 'critical') {
      return fn();
    }

    // Don't preload other routes - they'll load on demand
    return of(null);
  }
}
