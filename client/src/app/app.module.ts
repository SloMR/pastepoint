import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {FormsModule} from '@angular/forms';

import {AppComponent} from './app.component';
import {ChatComponent} from './features/chat/chat.component';
import {RouterModule, Routes} from '@angular/router';

const routes: Routes = [
  {path: 'chat', component: ChatComponent},
  {path: '', redirectTo: '/chat', pathMatch: 'full'}
];

@NgModule({
  declarations: [
    AppComponent,
    ChatComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    RouterModule.forRoot(routes)
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
}
