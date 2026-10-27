import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  private readonly auth = inject(AuthService);
  protected readonly themeService = inject(ThemeService);

  protected readonly user = this.auth.user;
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly theme = this.themeService.theme;
  protected readonly initial = computed(
    () => this.user()?.email.charAt(0).toUpperCase() ?? '?',
  );

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
