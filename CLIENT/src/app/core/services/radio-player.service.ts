import { Injectable, computed, inject, signal } from '@angular/core';
import { RadioStation } from '../models/station.models';
import { readStorage, removeStorage, writeStorage } from '../utils/storage';
import { apiErrorMessage } from './auth.service';
import { PlaylistService } from './playlist.service';

const STORAGE_KEY = 'etmw.radio.player.v1';

interface SavedPlayer {
  station: RadioStation;
  offsetSeconds: number;
  durationSeconds: number;
  volume: number;
}

@Injectable({ providedIn: 'root' })
export class RadioPlayerService {
  private readonly playlists = inject(PlaylistService);
  private readonly audio = new Audio();
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private requestToken = 0;

  private readonly stationSignal = signal<RadioStation | null>(null);
  private readonly playingSignal = signal(false);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);
  private readonly elapsedSignal = signal(0);
  private readonly durationSignal = signal(0);
  private readonly volumeSignal = signal(1);

  readonly station = this.stationSignal.asReadonly();
  readonly playing = this.playingSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly elapsed = this.elapsedSignal.asReadonly();
  readonly duration = this.durationSignal.asReadonly();
  readonly volume = this.volumeSignal.asReadonly();
  readonly visible = computed(() => this.station() !== null);

  constructor() {
    this.audio.preload = 'none';
    this.restore();
    this.audio.volume = this.volumeSignal();

    this.audio.addEventListener('timeupdate', () => {
      const total = this.durationSignal();
      const raw = this.startedAt + (this.audio.currentTime || 0);
      this.elapsedSignal.set(total > 0 ? raw % total : raw);
    });
    this.audio.addEventListener('play', () => {
      this.playingSignal.set(true);
      this.loadingSignal.set(false);
      this.errorSignal.set(null);
    });
    this.audio.addEventListener('pause', () => {
      this.playingSignal.set(false);
      this.persist();
    });
    this.audio.addEventListener('error', () => {
      if (!this.stationSignal()) {
        return;
      }

      this.playingSignal.set(false);
      this.loadingSignal.set(false);
      this.errorSignal.set('The live stream could not be loaded. Please try again.');
    });

    this.saveTimer = setInterval(() => {
      if (this.playingSignal()) {
        this.persist();
      }
    }, 5000);

    globalThis.addEventListener?.('pagehide', () => this.persist());
  }

  toggleStation(station: RadioStation): void {
    const current = this.stationSignal();

    if (current?.slug === station.slug) {
      this.togglePlay();
      return;
    }

    this.startStation(station);
  }

  playStationAt(station: RadioStation, offsetSeconds: number): void {
    this.startStation(station, offsetSeconds);
  }

  togglePlay(): void {
    if (!this.stationSignal()) {
      return;
    }

    if (this.playingSignal()) {
      this.pause();
      return;
    }

    this.startFrom(this.elapsedSignal());
  }

  pause(): void {
    if (!this.playingSignal()) {
      return;
    }

    this.audio.pause();
    this.persist();
  }

  close(): void {
    this.requestToken += 1;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.stationSignal.set(null);
    this.playingSignal.set(false);
    this.loadingSignal.set(false);
    this.errorSignal.set(null);
    this.elapsedSignal.set(0);
    this.durationSignal.set(0);
    this.startedAt = 0;
    removeStorage(STORAGE_KEY);
  }

  setVolume(value: number): void {
    const volume = Math.min(1, Math.max(0, value));
    this.volumeSignal.set(volume);
    this.audio.volume = volume;
    this.persist();
  }

  private startStation(station: RadioStation, preferredOffset?: number): void {
    const token = ++this.requestToken;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.stationSignal.set(station);
    this.playingSignal.set(false);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.elapsedSignal.set(0);
    this.durationSignal.set(0);
    this.startedAt = 0;

    this.playlists.getRadio(station.slug).subscribe({
      next: (radio) => {
        if (token !== this.requestToken) {
          return;
        }

        this.stationSignal.set(radio.station);
        this.durationSignal.set(radio.playlist.totalDurationSeconds);

        if (radio.playlist.totalDurationSeconds <= 0) {
          this.loadingSignal.set(false);
          this.errorSignal.set('This station does not have a playlist yet.');
          return;
        }

        const saved = this.readSaved();
        const offset =
          typeof preferredOffset === 'number' && Number.isFinite(preferredOffset)
            ? preferredOffset
            : saved?.station.slug === radio.station.slug
              ? saved.offsetSeconds
              : radio.liveOffsetSeconds;

        this.startFrom(offset);
      },
      error: (error: unknown) => {
        if (token !== this.requestToken) {
          return;
        }

        this.loadingSignal.set(false);
        this.errorSignal.set(apiErrorMessage(error));
      },
    });
  }

  private startFrom(offset: number): void {
    const station = this.stationSignal();

    if (!station) {
      return;
    }

    const total = this.durationSignal();
    const safeOffset = total > 0 ? Math.max(0, offset) % total : Math.max(0, offset);

    this.startedAt = safeOffset;
    this.elapsedSignal.set(safeOffset);
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.audio.src = this.playlists.streamUrl(station.slug, safeOffset);
    this.audio.load();

    void this.audio
      .play()
      .then(() => {
        this.loadingSignal.set(false);
        this.persist();
      })
      .catch(() => {
        this.loadingSignal.set(false);
        this.errorSignal.set('Press play to resume the station.');
      });
  }

  private persist(): void {
    const station = this.stationSignal();

    if (!station) {
      return;
    }

    const saved: SavedPlayer = {
      station,
      offsetSeconds: this.elapsedSignal(),
      durationSeconds: this.durationSignal(),
      volume: this.volumeSignal(),
    };

    writeStorage(STORAGE_KEY, JSON.stringify(saved));
  }

  private restore(): void {
    const raw = readStorage(STORAGE_KEY);

    if (!raw) {
      return;
    }

    try {
      const saved = JSON.parse(raw) as SavedPlayer;

      if (!saved.station?.slug) {
        return;
      }

      this.stationSignal.set(saved.station);
      this.durationSignal.set(
        Number.isFinite(saved.durationSeconds) ? saved.durationSeconds : 0,
      );
      this.elapsedSignal.set(
        Number.isFinite(saved.offsetSeconds) ? Math.max(0, saved.offsetSeconds) : 0,
      );
      this.volumeSignal.set(
        Number.isFinite(saved.volume) ? Math.min(1, Math.max(0, saved.volume)) : 1,
      );
      this.startedAt = this.elapsedSignal();
    } catch {
      removeStorage(STORAGE_KEY);
    }
  }

  private readSaved(): SavedPlayer | null {
    const raw = readStorage(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as SavedPlayer;
    } catch {
      return null;
    }
  }
}
