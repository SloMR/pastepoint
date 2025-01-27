import { NgModule } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from './chat.component';
import { ChatRoutingModule } from './chat-routing.module';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TranslatePipe } from '@ngx-translate/core';
import { PickerModule } from '@ctrl/ngx-emoji-mart';

@NgModule({
  declarations: [ChatComponent],
  imports: [
    CommonModule,
    FormsModule,
    ChatRoutingModule,
    FontAwesomeModule,
    TranslatePipe,
    PickerModule,
    NgOptimizedImage,
  ],
  exports: [ChatComponent],
})
export class ChatModule {}
