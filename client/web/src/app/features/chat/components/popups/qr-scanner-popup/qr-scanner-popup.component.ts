import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { NGXLogger } from 'ngx-logger';
import { extractSessionCodeFromUrl } from '../../../../../utils/session-link.util';
import { reloadOnceForChunkError } from '../../../../../utils/chunk-reload';

type JsQrFn = typeof import('jsqr').default;

@Component({
  selector: 'app-qr-scanner-popup',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './qr-scanner-popup.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './qr-scanner-popup.component.css',
})
export class QrScannerPopupComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;

  @Output() closed = new EventEmitter<void>();
  @Output() scanned = new EventEmitter<string>();

  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;

  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private logger = inject(NGXLogger);

  isScannerOpen = false;
  scannerError = '';

  private stream: MediaStream | null = null;
  private static readonly SCAN_INTERVAL_MS = 200;
  private static readonly SCAN_WIDTH = 400;
  private rafId: number | null = null;
  private lastScanAt = 0;
  private scanContext: CanvasRenderingContext2D | null = null;
  private startCameraTimeout: ReturnType<typeof setTimeout> | null = null;
  private scannerErrorTimeout: ReturnType<typeof setTimeout> | null = null;
  private jsQR: JsQrFn | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    const open = changes['isOpen'];
    if (!open) return;

    if (open.currentValue) {
      void this.openScanner();
    } else if (this.isScannerOpen) {
      this.closeScanner();
    }
  }

  openScanner(): void {
    this.scannerError = '';
    this.isScannerOpen = true;

    if (!this.jsQR) {
      void import('jsqr')
        .then((m) => {
          this.jsQR = m.default;
        })
        .catch((err: unknown) => {
          if (reloadOnceForChunkError(err)) {
            return;
          }

          this.ngZone.run(() => {
            this.scannerError = 'CAMERA_NOT_AVAILABLE';
            this.closeScanner();
          });
        });
    }

    if (this.startCameraTimeout) clearTimeout(this.startCameraTimeout);
    this.startCameraTimeout = setTimeout(() => {
      this.startCameraTimeout = null;

      if (this.isScannerOpen) {
        void this.startCamera();
      }
    }, 50);
  }

  closeScanner(): void {
    this.isScannerOpen = false;

    if (this.startCameraTimeout) {
      clearTimeout(this.startCameraTimeout);
      this.startCameraTimeout = null;
    }

    if (this.scannerErrorTimeout) {
      clearTimeout(this.scannerErrorTimeout);
      this.scannerErrorTimeout = null;
    }

    this.scannerError = '';
    this.stopCamera();
  }

  private async startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.logger.error('Camera unavailable: getUserMedia missing (insecure origin?)');
      this.failCamera();
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });

      if (!this.isScannerOpen) {
        this.stopCamera();
        return;
      }

      const video = this.videoEl.nativeElement;
      video.srcObject = this.stream;
      await video.play();

      this.ngZone.runOutsideAngular(() => this.scanFrame());
    } catch (err) {
      this.logger.warn(
        `Camera unavailable: ${err instanceof Error ? err.name : 'UnknownError'}`,
        err
      );
      this.failCamera();
    }
  }

  private failCamera(): void {
    this.ngZone.run(() => {
      this.scannerError = 'CAMERA_NOT_AVAILABLE';
    });
  }

  private scanFrame(): void {
    if (!this.isScannerOpen) return;

    const video = this.videoEl?.nativeElement;
    const canvas = this.canvasEl?.nativeElement;
    const now = performance.now();

    // jsQR not loaded yet, or the last scan was too recent: try again next frame.
    if (
      !video ||
      !canvas ||
      video.readyState < 2 ||
      !this.jsQR ||
      now - this.lastScanAt < QrScannerPopupComponent.SCAN_INTERVAL_MS
    ) {
      this.rafId = requestAnimationFrame(() => this.scanFrame());
      return;
    }
    this.lastScanAt = now;

    const scale = Math.min(1, QrScannerPopupComponent.SCAN_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (this.scanContext?.canvas !== canvas) {
      this.scanContext = canvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.scanContext;
    if (!ctx) {
      this.ngZone.run(() => this.closeScanner());
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    // Both apps draw their QR codes dark on light, so skip the inverted pass.
    const result = this.jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
    if (result?.data && this.isScannerOpen) {
      const code = extractSessionCodeFromUrl(result.data);

      if (code === null) {
        this.ngZone.run(() => {
          this.scannerError = 'QR_CODE_INVALID_URL';
        });

        if (this.scannerErrorTimeout) clearTimeout(this.scannerErrorTimeout);
        this.scannerErrorTimeout = setTimeout(() => {
          this.scannerError = '';
          this.scannerErrorTimeout = null;
          this.cdr.detectChanges();

          this.rafId = requestAnimationFrame(() => this.scanFrame());
        }, 3000);
        return;
      }
      this.ngZone.run(() => {
        try {
          navigator.vibrate?.(50);
        } catch {
          /* ignore */
        }
        this.closeScanner();
        setTimeout(() => this.scanned.emit(code), 0);
      });
      return;
    }

    this.rafId = requestAnimationFrame(() => this.scanFrame());
  }

  private stopCamera(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  ngOnDestroy(): void {
    this.isScannerOpen = false;
    if (this.startCameraTimeout) {
      clearTimeout(this.startCameraTimeout);
      this.startCameraTimeout = null;
    }

    if (this.scannerErrorTimeout) {
      clearTimeout(this.scannerErrorTimeout);
      this.scannerErrorTimeout = null;
    }

    this.stopCamera();
  }
}
