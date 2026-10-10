import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  Renderer2,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-message-actions',
  imports: [TranslatePipe],
  templateUrl: './message-actions.component.html',
  styleUrl: './message-actions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageActionsComponent {
  @Input() isRTL = false;

  @Output() blockRequested = new EventEmitter<void>();
  @Output() reportRequested = new EventEmitter<void>();

  protected readonly isOpen = signal(false);

  private host = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);
  private removeDocumentListeners: (() => void)[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.setOpen(false));
  }

  protected toggle(): void {
    this.setOpen(!this.isOpen());
  }

  protected block(): void {
    this.setOpen(false);
    this.blockRequested.emit();
  }

  protected report(): void {
    this.setOpen(false);
    this.reportRequested.emit();
  }

  /** Listens on the document only while the menu is open; every incoming bubble has a menu. */
  private setOpen(open: boolean): void {
    this.isOpen.set(open);
    this.removeDocumentListeners.forEach((remove) => remove());
    this.removeDocumentListeners = open
      ? [
          this.renderer.listen('document', 'click', (event: MouseEvent) =>
            this.onDocumentClick(event)
          ),
          this.renderer.listen('document', 'keydown.escape', () => this.setOpen(false)),
        ]
      : [];
  }

  private onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.setOpen(false);
    }
  }
}
