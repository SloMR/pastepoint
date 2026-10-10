import { Pipe, PipeTransform, SecurityContext, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import Autolinker from 'autolinker';

/** Turns URLs in chat text into links; pure, so each bubble builds its HTML once. */
@Pipe({
  name: 'linkify',
  standalone: true,
})
export class LinkifyPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(text: string, isDarkMode: boolean, isMyMessage: boolean = false): string {
    if (!text) return this.sanitizer.sanitize(SecurityContext.HTML, '') || '';

    const escapeHtml = (unsafe: string): string => {
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const processedText = escapeHtml(text);

    const linkClasses = isMyMessage
      ? isDarkMode
        ? 'text-blue-400 hover:text-blue-800 underline break-all'
        : 'text-blue-600 hover:text-blue-400 underline break-all'
      : 'text-blue-200 hover:text-blue-500 underline break-all';

    const textWithLinks = Autolinker.link(processedText, {
      urls: true,
      email: false,
      phone: false,
      mention: false,
      hashtag: false,
      newWindow: true,
      className: linkClasses,
      stripPrefix: false,
      sanitizeHtml: true,
    });

    const sanitizedHtml = this.sanitizer.sanitize(SecurityContext.HTML, textWithLinks);
    return sanitizedHtml || '';
  }
}
