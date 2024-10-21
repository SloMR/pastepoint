import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {ChatComponent} from './chat.component';
import {ChatRoutingModule} from './chat-routing.module';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatListModule} from '@angular/material/list';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatIconModule} from '@angular/material/icon';
import {FontAwesomeModule} from '@fortawesome/angular-fontawesome';
import {
  MatCard,
  MatCardActions,
  MatCardContent, MatCardHeader,
  MatCardSubtitle,
  MatCardTitle
} from "@angular/material/card";

@NgModule({
  declarations: [ChatComponent],
  imports: [
    CommonModule,
    FormsModule,
    ChatRoutingModule,
    MatToolbarModule,
    MatListModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    FontAwesomeModule,
    MatCardContent,
    MatCardSubtitle,
    MatCardTitle,
    MatCardActions,
    MatCardHeader,
    MatCard
  ],
  exports: [ChatComponent]
})
export class ChatModule {
}
