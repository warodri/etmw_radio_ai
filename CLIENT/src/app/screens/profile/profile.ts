import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, apiErrorMessage } from '../../core/services/auth.service';

type Step = 'email' | 'code';

@Component({
  selector: 'app-profile',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly auth = inject(AuthService);
  protected readonly user = this.auth.user;
  protected readonly restoring = this.auth.restoring;

  protected readonly step = signal<Step>('email');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pendingEmail = signal('');
  protected readonly expiresInMinutes = signal(10);
  protected readonly resendIn = signal(0);

  protected readonly emailForm = this.fb.nonNullable.group({
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(254)],
    ],
  });

  protected readonly codeForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6}$/)]],
  });

  ngOnDestroy(): void {
    this.stopCooldown();
  }

  protected submitEmail(): void {
    if (this.loading()) {
      return;
    }

    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const email = this.emailForm.controls.email.value.trim().toLowerCase();
    this.requestCode(email);
  }

  protected submitCode(): void {
    if (this.loading()) {
      return;
    }

    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }

    const code = this.codeForm.controls.code.value.trim().toUpperCase();

    this.loading.set(true);
    this.error.set(null);

    this.auth.verifyCode(this.pendingEmail(), code).subscribe({
      next: () => {
        this.loading.set(false);
        this.error.set(null);
        this.notice.set(null);
        this.stopCooldown();

        const redirect = this.route.snapshot.queryParamMap.get('redirect');

        if (redirect?.startsWith('/') && !redirect.startsWith('//')) {
          void this.router.navigateByUrl(redirect);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  protected resendCode(): void {
    if (this.resendIn() > 0 || this.loading()) {
      return;
    }

    this.requestCode(this.pendingEmail());
  }

  protected changeEmail(): void {
    this.step.set('email');
    this.codeForm.reset();
    this.error.set(null);
    this.notice.set(null);
    this.stopCooldown();
    this.resendIn.set(0);
  }

  protected logout(): void {
    this.auth.logout();
    this.emailForm.reset();
    this.codeForm.reset();
    this.pendingEmail.set('');
    this.step.set('email');
    this.error.set(null);
    this.notice.set(null);
    this.stopCooldown();
    this.resendIn.set(0);
  }

  private requestCode(email: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);

    this.auth.requestCode(email).subscribe({
      next: (response) => {
        this.pendingEmail.set(email);
        this.expiresInMinutes.set(response.expiresInMinutes);
        this.notice.set(
          response.devCode
            ? `Development mode — your code is ${response.devCode}`
            : response.message,
        );
        this.step.set('code');
        this.loading.set(false);
        this.startCooldown(60);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(error));
      },
    });
  }

  private startCooldown(seconds: number): void {
    this.stopCooldown();
    this.resendIn.set(seconds);

    this.cooldownTimer = setInterval(() => {
      const next = this.resendIn() - 1;

      if (next <= 0) {
        this.resendIn.set(0);
        this.stopCooldown();
        return;
      }

      this.resendIn.set(next);
    }, 1000);
  }

  private stopCooldown(): void {
    if (this.cooldownTimer !== null) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}
