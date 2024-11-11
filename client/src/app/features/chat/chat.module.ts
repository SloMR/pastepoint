import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from './chat.component';
import { ChatRoutingModule } from './chat-routing.module';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatLine } from '@angular/material/core';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe } from '@ngx-translate/core';

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
    MatCardModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatSidenavModule,
    MatDividerModule,
    MatMenuModule,
    MatLine,
    MatSnackBarModule,
    TranslatePipe,
  ],
  exports: [ChatComponent],
})
export class ChatModule {}
