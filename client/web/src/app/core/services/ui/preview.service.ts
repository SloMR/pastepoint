import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  MAX_PREVIEW_DATA_URL_SIZE,
  PREVIEW_MIME_TYPE,
  PREVIEW_QUALITY,
} from '../../../utils/constants';

@Injectable({
  providedIn: 'root',
})
export class PreviewService {
  private platformId = inject(PLATFORM_ID);

  private pdfJsLoaded = false;
  private pdfjsLib: any | null = null;
  private imageThumbnails = new WeakMap<Blob, Promise<{ dataUrl: string; mime: string }>>();
  private pdfThumbnails = new WeakMap<Blob, Promise<string | undefined>>();

  private static readonly PDFJS_CDN_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149';
  private static readonly PDFJS_LIB_URL = `${PreviewService.PDFJS_CDN_BASE}/pdf.min.mjs`;
  private static readonly PDFJS_WORKER_URL = `${PreviewService.PDFJS_CDN_BASE}/pdf.worker.min.mjs`;

  private async ensurePdfJsLoaded(): Promise<void> {
    if (this.pdfJsLoaded) return;
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      const pdfjsLib = await import(
        /* @vite-ignore */ /* webpackIgnore: true */
        PreviewService.PDFJS_LIB_URL
      );

      if (pdfjsLib?.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PreviewService.PDFJS_WORKER_URL;
      }

      this.pdfjsLib = pdfjsLib;
      this.pdfJsLoaded = true;
    } catch (e) {
      throw new Error(`Failed to load pdf.js from CDN: ${(e as Error)?.message || e}`, {
        cause: e,
      });
    }
  }

  /**
   * Creates a thumbnail from an image file, once per file: every recipient of a send reuses it.
   */
  public createImageThumbnail(file: Blob): Promise<{ dataUrl: string; mime: string }> {
    let thumbnail = this.imageThumbnails.get(file);
    if (!thumbnail) {
      thumbnail = this.renderImageThumbnail(file);
      this.imageThumbnails.set(file, thumbnail);
    }
    return thumbnail;
  }

  /**
   * Decodes with createImageBitmap, which works off the main thread; an <img> covers the
   * formats it can't decode, such as SVG.
   */
  private async renderImageThumbnail(file: Blob): Promise<{ dataUrl: string; mime: string }> {
    let image: ImageBitmap | HTMLImageElement;
    try {
      image = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      image = await this.loadImage(file);
    }

    try {
      return this.drawThumbnail(image, image.width, image.height);
    } finally {
      if ('close' in image) {
        image.close();
      }
    }
  }

  private loadImage(file: Blob): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      // Use createObjectURL - more memory efficient than readAsDataURL
      const objectUrl = URL.createObjectURL(file);

      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load failed'));
      };
      img.src = objectUrl;
    });
  }

  private drawThumbnail(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number
  ): { dataUrl: string; mime: string } {
    const ratio = Math.min(
      PreviewService.THUMBNAIL_MAX_WIDTH / sourceWidth,
      PreviewService.THUMBNAIL_MAX_HEIGHT / sourceHeight,
      1
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(sourceWidth * ratio);
    canvas.height = Math.floor(sourceHeight * ratio);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const png = canvas.toDataURL('image/png');
    const result =
      png.length > MAX_PREVIEW_DATA_URL_SIZE
        ? {
            dataUrl: canvas.toDataURL(PREVIEW_MIME_TYPE, PREVIEW_QUALITY),
            mime: PREVIEW_MIME_TYPE,
          }
        : { dataUrl: png, mime: 'image/png' };

    // Clear canvas to help garbage collection
    canvas.width = 0;
    canvas.height = 0;

    return result;
  }

  private static readonly THUMBNAIL_MAX_WIDTH = 320;
  private static readonly THUMBNAIL_MAX_HEIGHT = 192;

  // Skip PDF preview for files larger than this (too memory intensive)
  private static readonly MAX_PDF_SIZE_FOR_PREVIEW = 100 * 1024 * 1024; // 100MB

  /**
   * Creates a thumbnail of a PDF's first page, once per file.
   * Skips large PDFs to avoid memory spikes.
   */
  public createPdfThumbnail(pdf: Blob): Promise<string | undefined> {
    let thumbnail = this.pdfThumbnails.get(pdf);
    if (!thumbnail) {
      thumbnail = this.renderPdfThumbnail(pdf);
      this.pdfThumbnails.set(pdf, thumbnail);
    }
    return thumbnail;
  }

  private async renderPdfThumbnail(pdf: Blob): Promise<string | undefined> {
    if (pdf.size > PreviewService.MAX_PDF_SIZE_FOR_PREVIEW) {
      return undefined;
    }

    try {
      await this.ensurePdfJsLoaded();
      const buffer = await pdf.arrayBuffer();
      return await this.renderPdfPage(new Uint8Array(buffer));
    } catch {
      return undefined;
    }
  }

  /**
   * Renders page 1 to a JPEG data URL.
   * Properly cleans up PDF.js resources after rendering.
   * Uses JPEG format with quality setting to keep file size small for WebRTC transfer.
   */
  private async renderPdfPage(data: Uint8Array): Promise<string | undefined> {
    let pdf: any = null;
    let page: any = null;

    try {
      await this.ensurePdfJsLoaded();
      if (!this.pdfjsLib) return undefined;

      const loadingTask = this.pdfjsLib.getDocument({ data });
      pdf = await loadingTask.promise;
      page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1 });
      const ratio = Math.min(PreviewService.THUMBNAIL_MAX_WIDTH / viewport.width, 1);
      const scaled = page.getViewport({ scale: ratio });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(scaled.width);
      canvas.height = Math.ceil(scaled.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: scaled }).promise;

      // Use JPEG with 0.7 quality for much smaller file sizes
      const dataUrl = canvas.toDataURL(PREVIEW_MIME_TYPE, PREVIEW_QUALITY);

      // Clear canvas to help garbage collection
      canvas.width = 0;
      canvas.height = 0;

      return dataUrl;
    } catch {
      return undefined;
    } finally {
      // Clean up PDF.js resources to free memory
      if (page) {
        page.cleanup();
      }
      if (pdf) {
        await pdf.destroy();
      }
    }
  }
}
