import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-join-session-popup',
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './join-session-popup.component.html',
  styleUrl: './join-session-popup.component.css',
})
export class JoinSessionPopupComponent {
  @Input() isOpen = false;
  @Input() sessionCode = '';

  @Output() sessionCodeChange = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();
}
