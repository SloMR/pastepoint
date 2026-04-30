import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-page-header',
  imports: [CommonModule, RouterLink, NgOptimizedImage, TranslateModule],
  templateUrl: './page-header.component.html',
})
export class PageHeaderComponent {
  @Input() isDarkMode = false;
  @Input() isRTL = false;
  @Input() currentLanguage = 'en';

  @Output() toggleTheme = new EventEmitter<void>();
  @Output() switchLanguage = new EventEmitter<string>();
}
