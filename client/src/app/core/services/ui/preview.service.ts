import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class PreviewService {
  private pdfJsLoaded = false;
  private pdfjsLib: any | null = null;

  private static readonly PDFJS_CDN_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149';
  private static readonly PDFJS_LIB_URL = `${PreviewService.PDFJS_CDN_BASE}/pdf.min.mjs`;
  private static readonly PDFJS_WORKER_URL = `${PreviewService.PDFJS_CDN_BASE}/pdf.worker.min.mjs`;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

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
      throw new Error(`Failed to load pdf.js from CDN: ${(e as Error)?.message || e}`);
    }
  }

  public async createImageThumbnail(
    file: File,
    maxWidth: number = 320,
    maxHeight: number = 192
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  public async createPdfThumbnailFromFile(
    file: File,
    maxWidth: number = 320
  ): Promise<string | undefined> {
    try {
      await this.ensurePdfJsLoaded();
      const buffer = await file.arrayBuffer();
      return await this.createPdfThumbnailFromBytes(new Uint8Array(buffer), maxWidth);
    } catch {
      return undefined;
    }
  }

  public async createPdfThumbnailFromBytes(
    data: Uint8Array,
    maxWidth: number = 320
  ): Promise<string | undefined> {
    try {
      await this.ensurePdfJsLoaded();
      if (!this.pdfjsLib) return undefined;

      const loadingTask = this.pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      const viewport = page.getViewport({ scale: 1 });
      const ratio = Math.min(maxWidth / viewport.width, 1);
      const scaled = page.getViewport({ scale: ratio });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(scaled.width);
      canvas.height = Math.ceil(scaled.height);

      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      await page.render({ canvasContext: ctx, viewport: scaled }).promise;
      return canvas.toDataURL('image/png');
    } catch {
      return undefined;
    }
  }
}
