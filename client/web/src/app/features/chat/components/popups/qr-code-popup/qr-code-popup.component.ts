import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-qr-code-popup',
  imports: [CommonModule, TranslateModule],
  templateUrl: './qr-code-popup.component.html',
})
export class QrCodePopupComponent {
  @Input() isOpen = false;
  @Input() isRTL = false;
  @Input() isGenerating = false;

  @Output() closed = new EventEmitter<void>();
}
