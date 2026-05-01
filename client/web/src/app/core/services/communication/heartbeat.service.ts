import { Injectable, OnDestroy, inject } from '@angular/core';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NGXLogger } from 'ngx-logger';
import { Subject } from 'rxjs';

import {
  HEARTBEAT_INTERVAL_DESKTOP_SEC,
  HEARTBEAT_INTERVAL_MOBILE_SEC,
  HEARTBEAT_TIMEOUT_DESKTOP_SEC,
  HEARTBEAT_TIMEOUT_MOBILE_SEC,
} from '../../../utils/constants';

@Injectable({ providedIn: 'root' })
export class HeartbeatService implements OnDestroy {
  private deviceDetector = inject(DeviceDetectorService);
  private logger = inject(NGXLogger);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat: number = Date.now();

  /** Emits when a suspension is detected (interval missed by more than the timeout) */
  readonly suspended$ = new Subject<{ secondsSinceLastBeat: number }>();

  start(): void {
    this.stop();

    const isDesktop = this.deviceDetector.isDesktop();
    const heartbeatInterval = isDesktop
      ? HEARTBEAT_INTERVAL_DESKTOP_SEC
      : HEARTBEAT_INTERVAL_MOBILE_SEC;
    const heartbeatTimeout = isDesktop
      ? HEARTBEAT_TIMEOUT_DESKTOP_SEC
      : HEARTBEAT_TIMEOUT_MOBILE_SEC;

    this.logger.debug(
      'HeartbeatService.start',
      `Starting heartbeat for ${isDesktop ? 'desktop' : 'mobile'} with ${heartbeatInterval}s interval`
    );

    this.lastHeartbeat = Date.now();

    this.intervalId = setInterval(() => {
      const now = Date.now();
      const diff = (now - this.lastHeartbeat) / 1000;
      this.lastHeartbeat = now;

      if (diff > heartbeatTimeout) {
        this.logger.warn('HeartbeatService', `Suspension detected: last beat ${diff}s ago`);
        this.suspended$.next({ secondsSinceLastBeat: diff });
      }
    }, heartbeatInterval * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.debug('HeartbeatService.stop', 'Heartbeat stopped');
    }
  }

  ngOnDestroy(): void {
    this.stop();
    this.suspended$.complete();
  }
}
