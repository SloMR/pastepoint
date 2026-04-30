import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-end-session-popup',
  imports: [CommonModule, TranslateModule],
  templateUrl: './end-session-popup.component.html',
})
export class EndSessionPopupComponent {
  @Input() isOpen = false;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<void>();
}
