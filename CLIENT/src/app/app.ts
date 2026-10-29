import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { RadioPlayerService } from './core/services/radio-player.service';
import { Header } from './shared/header/header';
import { RadioPlayer } from './shared/radio-player/radio-player';

@Component({
  imports: [RouterOutlet, Header, RadioPlayer],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(AuthService);
  protected readonly player = inject(RadioPlayerService);

  protected readonly year = new Date().getFullYear();
  protected readonly user = this.auth.user;
}
