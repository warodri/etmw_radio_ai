import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import { readStorage, removeStorage, writeStorage } from '../utils/storage';
import {
  ApiErrorBody,
  AuthResponse,
  MeResponse,
  RadioUser,
  RequestCodeResponse,
} from '../models/auth.models';

export const TOKEN_KEY = 'etmw.radio.ai.token';
const USER_KEY = 'etmw.radio.ai.user';

function readStoredUser(): RadioUser | null {
  try {
    const stored = readStorage(USER_KEY);
    return stored ? (JSON.parse(stored) as RadioUser) : null;
  } catch {
    return null;
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as ApiErrorBody | null;
    if (body?.message) {
      return body.message;
    }
    if (error.status === 0) {
      return 'We could not reach the station. Check your connection and try again.';
    }
  }

  return 'Something went wrong. Please try again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenSignal = signal<string | null>(readStorage(TOKEN_KEY));
  private readonly userSignal = signal<RadioUser | null>(readStoredUser());
  private readonly restoringSignal = signal(Boolean(readStorage(TOKEN_KEY)));

  readonly user = this.userSignal.asReadonly();
  readonly token = this.tokenSignal.asReadonly();
  readonly restoring = this.restoringSignal.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.tokenSignal() && this.userSignal()));
  readonly isAdmin = computed(() => this.userSignal()?.isAdmin === true);

  constructor() {
    if (this.tokenSignal()) {
      this.refreshUser();
    }
  }

  requestCode(email: string): Observable<RequestCodeResponse> {
    return this.http.post<RequestCodeResponse>(`${API_BASE_URL}/auth/request-code`, { email });
  }

  verifyCode(email: string, code: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${API_BASE_URL}/auth/verify-code`, { email, code })
      .pipe(tap((response) => this.storeSession(response)));
  }

  refreshUser(): void {
    if (!this.tokenSignal()) {
      this.restoringSignal.set(false);
      return;
    }

    this.restoringSignal.set(true);
    this.http
      .get<MeResponse>(`${API_BASE_URL}/me`)
      .pipe(finalize(() => this.restoringSignal.set(false)))
      .subscribe({
        next: (response) => {
          writeStorage(USER_KEY, JSON.stringify(response.user));
          this.userSignal.set(response.user);
        },
        error: () => this.logout(),
      });
  }

  logout(): void {
    removeStorage(TOKEN_KEY);
    removeStorage(USER_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.restoringSignal.set(false);
  }

  private storeSession(response: AuthResponse): void {
    writeStorage(TOKEN_KEY, response.token);
    writeStorage(USER_KEY, JSON.stringify(response.user));
    this.tokenSignal.set(response.token);
    this.userSignal.set(response.user);
    this.restoringSignal.set(false);
  }
}
