import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

export interface EnterKeyEvent {
  event: KeyboardEvent;
  form: NgForm;
}

@Component({
  selector: 'app-chat-input',
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './chat-input.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ChatInputComponent {
  @Input() message = '';
  @Input() isDragging = false;
  @Input() isRTL = false;
  @Input() isDarkMode = false;
  @Input() hasNoConnectedPeers = false;
  @Input() isSendDisabled = false;
  @Input() isEmojiPickerVisible = false;
  @Input() isHoveringOverPicker = false;

  @Output() messageChange = new EventEmitter<string>();
  @Output() isEmojiPickerVisibleChange = new EventEmitter<boolean>();
  @Output() isHoveringOverPickerChange = new EventEmitter<boolean>();

  @Output() messageSubmit = new EventEmitter<NgForm>();
  @Output() enterKey = new EventEmitter<EnterKeyEvent>();
  @Output() autoResize = new EventEmitter<void>();
  @Output() filesAttached = new EventEmitter<Event>();
  @Output() emojiClicked = new EventEmitter<unknown>();
  @Output() openEmojiPickerRequested = new EventEmitter<void>();
  @Output() emojiIconLeft = new EventEmitter<void>();
  @Output() dragOver = new EventEmitter<DragEvent>();
  @Output() dragLeave = new EventEmitter<DragEvent>();
  @Output() dragEnter = new EventEmitter<void>();
  @Output() dropped = new EventEmitter<DragEvent>();

  @ViewChild('messageTextarea', { static: false }) messageTextarea!: ElementRef;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;
}
