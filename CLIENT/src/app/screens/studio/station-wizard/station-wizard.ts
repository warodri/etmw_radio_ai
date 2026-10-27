import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  STATION_STATUS_DESCRIPTIONS,
  STATION_STATUS_LABELS,
  StationPayload,
  StationStatus,
} from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;
const ALLOWED_ARTWORK_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function minArrayLength(min: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;

    if (Array.isArray(value) && value.length >= min) {
      return null;
    }

    return { minArray: { requiredLength: min, actualLength: Array.isArray(value) ? value.length : 0 } };
  };
}

function tagsValidator(control: AbstractControl): ValidationErrors | null {
  const tags = String(control.value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? null : { tagsRequired: true };
}

@Component({
  selector: 'app-station-wizard',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './station-wizard.html',
  styleUrl: './station-wizard.scss',
})
export class StationWizard implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly stationService = inject(StationService);
  private readonly destroy$ = new Subject<void>();
  private slugEdited = false;

  protected readonly steps = ['Identity', 'Sound & style', 'Artwork & publish'];
  protected readonly step = signal(0);
  protected readonly editing = signal(false);
  protected readonly stationId = signal<string | null>(null);
  protected readonly loadingStation = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);
  protected readonly tagPreview = signal<string[]>([]);
  protected readonly artworkDataUrl = signal<string | null>(null);
  protected readonly artworkPreview = signal<string | null>(null);
  protected readonly artworkError = signal<string | null>(null);
  protected readonly removeExistingArtwork = signal(false);
  protected readonly genreLimitHit = signal(false);
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected readonly statuses: StationStatus[] = [
    'draft',
    'published',
    'paused',
    'archived',
  ];
  protected readonly statusLabels = STATION_STATUS_LABELS;
  protected readonly statusDescriptions = STATION_STATUS_DESCRIPTIONS;

  protected readonly languages = [
    'English',
    'Spanish',
    'French',
    'German',
    'Italian',
    'Portuguese',
    'Dutch',
    'Japanese',
    'Korean',
    'Mandarin Chinese',
    'Hindi',
    'Arabic',
    'Russian',
    'Ukrainian',
    'Hebrew',
    'Turkish',
    'Polish',
    'Swedish',
    'Norwegian',
    'Danish',
    'Finnish',
    'Greek',
    'Czech',
    'Romanian',
    'Hungarian',
    'Indonesian',
    'Thai',
    'Vietnamese',
    'Filipino',
    'Other',
  ];

  protected readonly genres = [
    'Pop',
    'Rock',
    'Indie',
    'Electronic',
    'Hip-hop',
    'R&B / Soul',
    'Jazz',
    'Classical',
    'Latin',
    'Country',
    'Folk',
    'Ambient',
    'Lo-fi',
    'Reggae',
    'World',
    'Metal',
    'Punk',
    'Blues',
    'Funk',
    'News / Talk',
  ];

  protected readonly presentationStyles = [
    'Warm & conversational',
    'Energetic & upbeat',
    'Calm & ambient',
    'Newsroom & factual',
    'Storyteller',
    'Late-night & intimate',
    'Playful & curious',
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(80),
      ],
    ],
    slug: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(60),
        Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      ],
    ],
    description: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(2000),
      ],
    ],
    language: ['English', [Validators.required]],
    tagsText: ['', [Validators.required, tagsValidator]],
    region: ['', [Validators.maxLength(80)]],
    genres: this.fb.nonNullable.control<string[]>([], [minArrayLength(1)]),
    presentationStyle: [
      'Warm & conversational',
      [Validators.required, Validators.maxLength(60)],
    ],
    presentationNotes: ['', [Validators.maxLength(2000)]],
    status: this.fb.nonNullable.control<StationStatus>('draft', [
      Validators.required,
    ]),
  });

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    this.form.controls.tagsText.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
        this.tagPreview.set(
          value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
            .filter((tag, index, tags) => tags.indexOf(tag) === index)
            .slice(0, 12),
        );
      });

    this.form.controls.name.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((name) => {
        if (!this.slugEdited) {
          this.form.controls.slug.setValue(this.slugify(name), {
            emitEvent: false,
          });
        }
      });

    if (slug) {
      this.loadStation(slug);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  protected onSlugInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = this.slugify(input.value);
    this.slugEdited = true;

    if (clean !== input.value) {
      this.form.controls.slug.setValue(clean);
    }
  }

  protected useNameForSlug(): void {
    this.slugEdited = false;
    this.form.controls.slug.setValue(
      this.slugify(this.form.controls.name.value),
    );
  }

  protected toggleGenre(genre: string): void {
    const current = this.form.controls.genres.value;
    const selected = current.includes(genre);

    if (!selected && current.length >= 12) {
      this.genreLimitHit.set(true);
      return;
    }

    this.genreLimitHit.set(false);
    const next = selected
      ? current.filter((item) => item !== genre)
      : [...current, genre];

    this.form.controls.genres.setValue(next);
    this.form.controls.genres.markAsTouched();
  }

  protected isGenreSelected(genre: string): boolean {
    return this.form.controls.genres.value.includes(genre);
  }

  protected setStatus(status: StationStatus): void {
    this.form.controls.status.setValue(status);
  }

  protected nextStep(): void {
    if (this.step() >= this.steps.length - 1) {
      return;
    }

    this.pageError.set(null);

    const controls = this.controlsForStep(this.step());
    controls.forEach((control) => control.markAsTouched());

    if (this.step() === 0 && !this.form.controls.slug.value) {
      this.form.controls.slug.setValue(
        this.slugify(this.form.controls.name.value),
      );
    }

    if (controls.some((control) => control.invalid)) {
      return;
    }

    this.step.update((value) => value + 1);
    this.scrollToTop();
  }

  protected previousStep(): void {
    if (this.step() === 0) {
      return;
    }

    this.pageError.set(null);
    this.step.update((value) => value - 1);
    this.scrollToTop();
  }

  protected onArtworkSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.artworkError.set(null);

    if (!ALLOWED_ARTWORK_TYPES.includes(file.type)) {
      this.artworkError.set('Use a PNG, JPEG, WebP or GIF image.');
      input.value = '';
      return;
    }

    if (file.size > MAX_ARTWORK_BYTES) {
      this.artworkError.set('Artwork must be 2 MB or smaller.');
      input.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result ?? '');

      if (!result.startsWith('data:image/')) {
        this.artworkError.set('That file could not be read as an image.');
        return;
      }

      this.artworkDataUrl.set(result);
      this.artworkPreview.set(result);
      this.removeExistingArtwork.set(false);
    };

    reader.onerror = () => {
      this.artworkError.set('That file could not be read. Try another image.');
    };

    reader.readAsDataURL(file);
    input.value = '';
  }

  protected removeArtwork(): void {
    this.artworkDataUrl.set(null);
    this.artworkPreview.set(null);
    this.artworkError.set(null);

    if (this.editing()) {
      this.removeExistingArtwork.set(true);
    }
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }

    this.pageError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.step.set(this.firstInvalidStep());
      this.pageError.set('Please complete the highlighted fields.');
      this.scrollToTop();
      return;
    }

    const value = this.form.getRawValue();
    const tags = value.tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, all) => all.indexOf(tag) === index)
      .slice(0, 12);

    const payload: StationPayload = {
      name: value.name.trim(),
      slug: value.slug.trim().toLowerCase(),
      description: value.description.trim(),
      language: value.language,
      tags,
      region: value.region.trim() || null,
      genres: value.genres,
      presentationStyle: value.presentationStyle,
      presentationNotes: value.presentationNotes.trim() || null,
      status: value.status,
    };

    const artworkDataUrl = this.artworkDataUrl();

    if (artworkDataUrl) {
      payload.artworkDataUrl = artworkDataUrl;
    } else if (this.editing() && this.removeExistingArtwork()) {
      payload.removeArtwork = true;
    }

    this.saving.set(true);

    const request = this.editing()
      ? this.stationService.updateStation(this.stationId()!, payload)
      : this.stationService.createStation(payload);

    request.subscribe({
      next: (response) => {
        this.saving.set(false);
        void this.router.navigate(['/studio'], {
          queryParams: this.editing() ? { updated: response.station.slug } : { created: response.station.slug },
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.pageError.set(apiErrorMessage(error));

        if (
          error instanceof HttpErrorResponse &&
          error.error?.code === 'SLUG_TAKEN'
        ) {
          this.step.set(0);
        }

        this.scrollToTop();
      },
    });
  }

  protected slugPreview(): string {
    return `entertomyworld.com/apps/radio-ai/#/stations/${this.form.controls.slug.value || 'your-station'}`;
  }

  protected fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  private loadStation(slug: string): void {
    this.loadingStation.set(true);
    this.loadError.set(null);

    this.stationService.getStation(slug).subscribe({
      next: (response) => {
        const station = response.station;

        if (!station.isOwner) {
          this.loadError.set('You can only edit your own stations.');
          this.loadingStation.set(false);
          return;
        }

        this.editing.set(true);
        this.stationId.set(station.id);
        this.slugEdited = true;

        this.form.patchValue({
          name: station.name,
          slug: station.slug,
          description: station.description,
          language: station.language,
          tagsText: station.tags.join(', '),
          region: station.region ?? '',
          genres: station.genres,
          presentationStyle: station.presentationStyle,
          presentationNotes: station.presentationNotes ?? '',
          status: station.status,
        });

        this.tagPreview.set(station.tags);
        this.artworkPreview.set(this.stationService.artworkUrl(station));
        this.loadingStation.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error));
        this.loadingStation.set(false);
      },
    });
  }

  private controlsForStep(step: number): AbstractControl[] {
    const controls = this.form.controls;

    if (step === 0) {
      return [
        controls.name,
        controls.slug,
        controls.description,
        controls.language,
        controls.tagsText,
        controls.region,
      ];
    }

    if (step === 1) {
      return [
        controls.genres,
        controls.presentationStyle,
        controls.presentationNotes,
      ];
    }

    return [];
  }

  private firstInvalidStep(): number {
    for (let step = 0; step < this.steps.length; step += 1) {
      if (this.controlsForStep(step).some((control) => control.invalid)) {
        return step;
      }
    }

    return 0;
  }

  private slugify(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '');
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
