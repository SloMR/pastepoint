import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MetaService } from './meta.service';
import { MetaConfig, StructuredData } from '../../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class MetaInitService {
  /**
   * Constructor - sets up route change listener to update metadata
   */
  constructor(
    private metaService: MetaService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      // Listen for navigation events to update metadata
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe((event: NavigationEnd) => {
          this.handleRouteChange(event.url);
        });
    }
  }

  //=============================================================================
  // PUBLIC API
  //=============================================================================

  /**
   * Initialize default application metadata
   * Should be called once when the application starts
   */
  public initializeAppMetadata(): void {
    // Set basic meta information
    const defaultMetaConfig: MetaConfig = this.getDefaultMetaConfig();
    this.metaService.update(defaultMetaConfig);

    // Set Google site verification
    this.metaService.setVerification('google', 'zwaPPawWJXUKTH2XgrrfKkCOIbIwilUTBI');

    // Set app icons
    this.metaService.setIcons({
      favicon: '/assets/favicon-96x96.png',
      faviconSvg: '/assets/favicon.svg',
      shortcut: '/assets/favicon.ico',
      apple: '/assets/apple-touch-icon.png',
      manifest: '/site.webmanifest',
    });

    // Set preconnect for performance
    this.metaService.setPreconnect(['https://fonts.googleapis.com'], false);
    this.metaService.setPreconnect(['https://fonts.gstatic.com'], true);

    // Set structured data for the application
    this.metaService.setStructuredData(this.getApplicationStructuredData(), 'app-structured-data');
  }

  //=============================================================================
  // PRIVATE METHODS
  //=============================================================================

  /**
   * Handle route changes to update metadata
   * This ensures metadata updates even when navigating via links or logo clicks
   *
   * @param url Current URL after navigation
   */
  private handleRouteChange(url: string): void {
    // Handle different routes
    if (url.includes('/private/')) {
      // Private session - no indexing
      this.metaService.updateChatMetadata(true);
    } else if (url === '/' || url === '') {
      // Regular chat page (now at root)
      this.metaService.updateChatMetadata(false);
    } else if (url.includes('/404') || url.includes('not-found')) {
      // 404 page
      this.metaService.updateNotFoundMetadata();
    } else {
      // Other pages - use default metadata
      this.initializeAppMetadata();
    }
  }

  /**
   * Get default meta configuration for the application
   *
   * @returns MetaConfig object with default values
   */
  private getDefaultMetaConfig(): MetaConfig {
    return {
      title: 'PastePoint | Secure Peer-to-Peer File Sharing & Encrypted Messaging',
      description:
        'PastePoint lets you share files and chat instantly with end-to-end encryption. No cloud, no accounts, no tracking—secure peer-to-peer transfers made simple.',
      keywords:
        'secure file sharing, encrypted messaging, peer-to-peer transfer, private file sharing, WebRTC chat, direct file transfer, real-time messaging, zero tracking, no cloud, local network sharing',
      author: 'PastePoint',
      themeColor: '#4285f4',
      robots: 'index, follow',
      canonical: 'https://pastepoint.com',

      // Viewport configuration for responsive design
      viewport: 'width=device-width, initial-scale=1.0',

      // Cache control settings
      cacheControl: {
        pragma: 'no-cache',
        cacheControl: 'no-cache, must-revalidate',
        expires: '0',
      },

      // Open Graph metadata
      og: {
        type: 'website',
        title: 'PastePoint | Secure Peer-to-Peer File Sharing & Encrypted Messaging',
        description:
          'PastePoint is a secure, feature-rich file sharing and messaging platform. Transfer files directly using peer-to-peer WebRTC connections with no tracking or cloud storage.',
        siteName: 'PastePoint',
        url: 'https://pastepoint.com',
      },

      // Twitter Card metadata
      twitter: {
        card: 'summary_large_image',
        title: 'PastePoint | Secure Peer-to-Peer File Sharing & Encrypted Messaging',
        description:
          'Send messages and files securely with PastePoint. Peer-to-peer file transfers, end-to-end encryption, and no cloud.',
      },
    };
  }

  /**
   * Get structured data object for the application
   *
   * @returns StructuredData object for JSON-LD
   */
  private getApplicationStructuredData(): StructuredData {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'PastePoint',
      url: 'https://pastepoint.com',
      applicationCategory: 'CommunicationApplication',
      operatingSystem: 'Web',
      description:
        'Secure peer-to-peer file sharing and encrypted messaging solution for local networks.',
      featureList:
        'Encrypted messaging, P2P file transfer, WebSocket connections, Local network optimization',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        reviewCount: '150',
      },
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://pastepoint.com/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Private Sessions',
          item: 'https://pastepoint.com/private',
        },
      ],
    };
  }
}
