import { Inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root',
})
export class SeoService {
  constructor(
    @Inject(DOCUMENT) private document: Document,
    private meta: Meta
  ) {}

  /**
   * Sets the canonical URL for the current page
   * @param url The canonical URL to set
   */
  setCanonicalUrl(url: string): void {
    // First, remove any existing canonical link elements
    const existingCanonical = this.document.querySelector('link[rel="canonical"]');
    if (existingCanonical) {
      existingCanonical.remove();
    }

    // Create and append the new canonical link element
    const link: HTMLLinkElement = this.document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', url);
    this.document.head.appendChild(link);
  }

  /**
   * Sets the Open Graph URL for the current page
   * @param url The Open Graph URL to set
   */
  setOpenGraphUrl(url: string): void {
    const ogUrlTag = this.meta.getTag('property="og:url"');
    if (ogUrlTag) {
      this.meta.updateTag({ property: 'og:url', content: url });
    } else {
      this.meta.addTag({ property: 'og:url', content: url });
    }
  }

  /**
   * Sets the robots tag for the current page
   * @param content The robots tag to set
   */
  setRobotsTag(content: string): void {
    this.meta.updateTag({ name: 'robots', content });
  }
}
