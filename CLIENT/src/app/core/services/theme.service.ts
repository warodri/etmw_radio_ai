import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { readStorage, writeStorage } from '../utils/storage';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'etmw.radio.ai.theme';
const DARK_THEME_COLOR = '#0c0a09';
const LIGHT_THEME_COLOR = '#faf7f3';

function readStoredTheme(): Theme {
  return readStorage(THEME_KEY) === 'light' ? 'light' : 'dark';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly themeSignal = signal<Theme>(readStoredTheme());

  readonly theme = this.themeSignal.asReadonly();

  constructor() {
    effect(() => this.apply(this.themeSignal()));
  }

  toggle(): void {
    this.set(this.themeSignal() === 'dark' ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.themeSignal.set(theme);

    writeStorage(THEME_KEY, theme);
  }

  private apply(theme: Theme): void {
    const root = this.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');

    const meta = this.document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }
}
