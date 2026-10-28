import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  CREATOR_SONG_STATUS_LABELS,
  CreatorDashboardResponse,
  CreatorSong,
  CreatorSongStatus,
} from '../../../core/models/creator.models';
import { RadioStation } from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { CreatorService } from '../../../core/services/creator.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

const PAGE_SIZE = 6;
const MAX_DURATION_SECONDS = 240;

const COMMON_GENRES = [
  'Ambient',
  'Alternative',
  'Blues',
  'Cinematic',
  'Classical',
  'Country',
  'Dance',
  'Disco',
  'Electronic',
  'Folk',
  'Funk',
  'Hip hop',
  'House',
  'Indie',
  'Jazz',
  'Lo-fi',
  'Pop',
  'R&B',
  'Reggae',
  'Rock',
  'Soul',
  'Synthwave',
  'Techno',
  'World',
];

const MOOD_SUGGESTIONS = [
  'Warm',
  'Nocturnal',
  'Euphoric',
  'Melancholic',
  'Dreamy',
  'Driving',
  'Intimate',
  'Cinematic',
];

const STYLE_SUGGESTIONS = [
  'analog synth',
  'piano',
  'guitar',
  'brushed drums',
  'cinematic strings',
  'female voice',
  'male voice',
  'lo-fi texture',
];

@Component({
  selector: 'app-creator-dashboard',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './creator-dashboard.html',
  styleUrl: './creator-dashboard.scss',
})
export class CreatorDashboard implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly creator = inject(CreatorService);
  private readonly stations = inject(StationService);
  private readonly destroyRef = inject(DestroyRef);

  private slug = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private audioSub: Subscription | null = null;
  private objectUrl: string | null = null;
  private readonly audio = new Audio();

  protected readonly maxDuration = MAX_DURATION_SECONDS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusLabels = CREATOR_SONG_STATUS_LABELS;
  protected readonly moods = MOOD_SUGGESTIONS;
  protected readonly styleSuggestions = STYLE_SUGGESTIONS;
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected readonly dashboard = signal<CreatorDashboardResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly pageError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly page = signal(1);
  protected readonly durationSeconds = signal(60);

  protected readonly playingId = signal<string | null>(null);
  protected readonly isPlaying = signal(false);
  protected readonly audioLoadingId = signal<string | null>(null);
  protected readonly playerError = signal<string | null>(null);
  protected readonly currentTime = signal(0);
  protected readonly audioDuration = signal(0);

  protected readonly station = computed(() => this.dashboard()?.station ?? null);
  protected readonly songs = computed(() => this.dashboard()?.songs ?? []);
  protected readonly pagination = computed(
    () =>
      this.dashboard()?.pagination ?? {
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0,
        totalPages: 1,
      },
  );
  protected readonly pendingCount = computed(
    () => this.dashboard()?.pendingCount ?? 0,
  );
  protected readonly completedCount = computed(
    () => this.dashboard()?.completedCount ?? 0,
  );
  protected readonly hasPending = computed(
    () => this.dashboard()?.hasPending ?? false,
  );
  protected readonly genreOptions = computed(() => {
    const stationGenres = this.station()?.genres ?? [];
    return Array.from(new Set([...stationGenres, ...COMMON_GENRES]));
  });

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.maxLength(120)]],
    lyrics: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(20000),
      ],
    ],
    mood: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    ],
    genres: this.fb.nonNullable.control<string[]>([]),
    style: ['', [Validators.maxLength(600)]],
  });

  constructor() {
    this.audio.preload = 'auto';
    this.audio.volume = 0.9;
    this.audio.addEventListener('timeupdate', () => {
      this.currentTime.set(this.audio.currentTime || 0);
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(this.audio.duration)) {
        this.audioDuration.set(this.audio.duration);
      }
    });
    this.audio.addEventListener('play', () => this.isPlaying.set(true));
    this.audio.addEventListener('pause', () => this.isPlaying.set(false));
    this.audio.addEventListener('ended', () => {
      this.isPlaying.set(false);
      this.currentTime.set(0);
    });
    this.audio.addEventListener('error', () => {
      if (this.playingId()) {
        this.playerError.set('This song could not be played.');
        this.isPlaying.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
      this.closePlayer();
    });
  }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.pageError.set('That station does not exist.');
      this.loading.set(false);
      return;
    }

    this.slug = slug;
    this.loadDashboard(1, true);

    this.pollTimer = setInterval(() => {
      if (this.hasPending() && !this.refreshing()) {
        this.loadDashboard(this.page(), false);
      }
    }, 5000);
  }

  protected stationArtwork(station: RadioStation): string {
    return this.stations.artworkUrl(station) ?? this.defaultArtwork;
  }

  protected loadDashboard(page: number, syncForm: boolean): void {
    if (!this.slug) {
      return;
    }

    this.pageError.set(null);

    if (this.dashboard()) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }

    this.creator.getDashboard(this.slug, page, PAGE_SIZE).subscribe({
      next: (response) => {
        this.dashboard.set(response);
        this.page.set(response.pagination.page);

        if (syncForm) {
          this.patchForm(response);
        }

        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  protected refresh(): void {
    this.loadDashboard(this.page(), false);
  }

  protected isGenreSelected(genre: string): boolean {
    return this.form.controls.genres.value.includes(genre);
  }

  protected toggleGenre(genre: string): void {
    const current = new Set(this.form.controls.genres.value);

    if (current.has(genre)) {
      current.delete(genre);
    } else if (current.size < 12) {
      current.add(genre);
    }

    this.form.controls.genres.setValue(Array.from(current));
    this.form.controls.genres.markAsDirty();
    this.formError.set(null);
  }

  protected setMood(mood: string): void {
    this.form.controls.mood.setValue(mood);
    this.form.controls.mood.markAsDirty();
    this.formError.set(null);
  }

  protected addStyleTag(tag: string): void {
    const current = this.form.controls.style.value.trim();
    const existing = current
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (existing.includes(tag.toLowerCase())) {
      return;
    }

    this.form.controls.style.setValue(current ? `${current}, ${tag}` : tag);
    this.form.controls.style.markAsDirty();
  }

  protected useStarterLyrics(): void {
    if (this.form.controls.lyrics.value.trim()) {
      return;
    }

    this.form.controls.lyrics.setValue(
      `[Verse]
Late light on an empty street
A quiet pulse beneath my feet
The city breathes in slow repair
And leaves a little music there

[Chorus]
Turn the dial and let it glow
Every night a radio
Say the words you need to hear
We are almost home from here`,
    );
    this.form.controls.lyrics.markAsDirty();
  }

  protected setDuration(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.durationSeconds.set(
      Math.max(5, Math.min(MAX_DURATION_SECONDS, Math.round(value))),
    );
  }

  protected lyricsInvalid(): boolean {
    const control = this.form.controls.lyrics;
    return control.invalid && (control.touched || control.dirty);
  }

  protected moodInvalid(): boolean {
    const control = this.form.controls.mood;
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    this.formError.set(null);
    this.notice.set(null);
    this.form.markAllAsTouched();

    if (this.form.controls.genres.value.length === 0) {
      this.formError.set('Choose at least one genre for this song.');
      return;
    }

    if (this.form.invalid) {
      this.formError.set('Check the highlighted fields and try again.');
      return;
    }

    const values = this.form.getRawValue();
    this.submitting.set(true);

    this.creator
      .createSong(this.slug, {
        title: values.title.trim() || undefined,
        lyrics: values.lyrics.trim(),
        mood: values.mood.trim(),
        genres: values.genres,
        style: values.style.trim(),
        durationSeconds: this.durationSeconds(),
      })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.notice.set(
            `“${response.song.title}” is in the ETMW Radio AI queue. We will show it here as soon as it is ready.`,
          );
          this.form.patchValue({ title: '', lyrics: '' });
          this.closePlayer();
          this.loadDashboard(1, false);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.formError.set(apiErrorMessage(error));
        },
      });
  }

  protected changePage(nextPage: number): void {
    const target = Math.min(
      Math.max(1, nextPage),
      this.pagination().totalPages,
    );

    if (target === this.page()) {
      return;
    }

    this.closePlayer();
    this.loadDashboard(target, false);
  }

  protected toggleSong(song: CreatorSong): void {
    if (song.status !== 'completed') {
      return;
    }

    if (this.playingId() === song.id) {
      if (this.audio.paused) {
        this.playAudio();
      } else {
        this.audio.pause();
      }
      return;
    }

    this.loadSong(song);
  }

  protected isCurrentSong(song: CreatorSong): boolean {
    return this.playingId() === song.id;
  }

  protected seek(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.audio.currentTime = Math.max(
      0,
      Math.min(value, this.audioDuration() || 0),
    );
    this.currentTime.set(this.audio.currentTime);
  }

  protected closePlayer(): void {
    this.audioSub?.unsubscribe();
    this.audioSub = null;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.revokeObjectUrl();
    this.playingId.set(null);
    this.isPlaying.set(false);
    this.audioLoadingId.set(null);
    this.playerError.set(null);
    this.currentTime.set(0);
    this.audioDuration.set(0);
  }

  protected statusPillClass(status: CreatorSongStatus): string {
    if (status === 'completed') {
      return 'status-pill status-pill--published';
    }

    return `status-pill status-pill--${status}`;
  }

  protected formatTime(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
  }

  private patchForm(response: CreatorDashboardResponse): void {
    this.durationSeconds.set(response.settings.durationSeconds);
    this.form.patchValue({
      mood: response.settings.mood,
      genres: response.settings.genres,
      style: response.settings.style,
    });
  }

  private loadSong(song: CreatorSong): void {
    this.playerError.set(null);
    this.audioLoadingId.set(song.id);
    this.audioSub?.unsubscribe();
    this.audioSub = this.creator.getSongAudio(this.slug, song.id).subscribe({
      next: (blob) => {
        this.audio.pause();
        this.revokeObjectUrl();
        this.objectUrl = URL.createObjectURL(blob);
        this.audio.src = this.objectUrl;
        this.audio.load();
        this.playingId.set(song.id);
        this.currentTime.set(0);
        this.audioDuration.set(song.durationSeconds);
        this.audioLoadingId.set(null);
        this.playAudio();
      },
      error: (error: unknown) => {
        this.audioLoadingId.set(null);
        this.playerError.set(apiErrorMessage(error));
      },
    });
  }

  private playAudio(): void {
    void this.audio.play().catch(() => {
      this.isPlaying.set(false);
      this.playerError.set('Your browser blocked playback. Press play again.');
    });
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
