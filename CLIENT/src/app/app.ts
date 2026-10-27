import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { Header } from './shared/header/header';

@Component({
  imports: [RouterOutlet, Header],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(AuthService);

  protected readonly year = new Date().getFullYear();
  protected readonly user = this.auth.user;
}
