import { DatePipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { HostPersona } from '../../../core/models/host.models';
import { RadioStation } from '../../../core/models/station.models';
import {
  CreateScriptDraftPayload,
  SCRIPT_STATUS_LABELS,
  ScriptLimits,
  ScriptMode,
  ScriptPagination,
  ScriptStatus,
  ScriptView,
} from '../../../core/models/script.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { CreatorService } from '../../../core/services/creator.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

const PAGE_SIZE = 6;

@Component({
  selector: 'app-scripts-dashboard',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './scripts-dashboard.html',
  styleUrl: './scripts-dashboard.scss',
})
export class ScriptsDashboard implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly creator = inject(CreatorService);
  private readonly stations = inject(StationService);

  private slug = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private audioSub: Subscription | null = null;
  private objectUrl: string | null = null;
  private readonly audio = new Audio();

  protected readonly statusLabels = SCRIPT_STATUS_LABELS;
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly station = signal<RadioStation | null>(null);
  protected readonly hosts = signal<HostPersona[]>([]);
  protected readonly scripts = signal<ScriptView[]>([]);
  protected readonly pagination = signal<ScriptPagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  protected readonly limits = signal<ScriptLimits>({
    maxWords: 1600,
    maxDurationSeconds: 600,
  });
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly pageError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly creatingDraft = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly selectedHostId = signal('');
  protected readonly mode = signal<ScriptMode>('text');
  protected readonly page = signal(1);

  protected readonly draft = signal<ScriptView | null>(null);
  protected readonly draftText = signal('');
  protected readonly draftTitle = signal('');
  protected readonly draftDirty = signal(false);
  protected readonly draftError = signal<string | null>(null);
  protected readonly savingDraft = signal(false);
  protected readonly approving = signal(false);

  protected readonly playingId = signal<string | null>(null);
  protected readonly isPlaying = signal(false);
  protected readonly audioLoadingId = signal<string | null>(null);
  protected readonly playerError = signal<string | null>(null);
  protected readonly currentTime = signal(0);
  protected readonly audioDuration = signal(0);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.maxLength(120)]],
    hostId: ['', [Validators.required]],
    mode: this.fb.nonNullable.control<ScriptMode>('text'),
    text: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(20000),
      ],
    ],
    research: [false],
  });

  protected readonly selectedHost = computed(
    () =>
      this.hosts().find((host) => host.id === this.selectedHostId()) ?? null,
  );
  protected readonly voicedHosts = computed(() =>
    this.hosts().filter((host) => Boolean(host.voice)),
  );
  protected readonly hasPending = computed(() =>
    this.scripts().some(
      (script) => script.status === 'queued' || script.status === 'generating',
    ),
  );
  protected readonly draftWordCount = computed(() =>
    this.countWords(this.draftText()),
  );
  protected readonly draftTooLong = computed(
    () => this.draftWordCount() > this.limits().maxWords,
  );

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
        this.playerError.set('This script audio could not be played.');
        this.isPlaying.set(false);
      }
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
    forkJoin({
      hosts: this.creator.getHosts(this.slug),
      scripts: this.creator.getScripts(this.slug, 1, PAGE_SIZE),
    }).subscribe({
      next: ({ hosts, scripts }) => {
        this.station.set(hosts.station);
        this.hosts.set(hosts.hosts);
        this.applyScripts(scripts.scripts, scripts.pagination, scripts.limits);
        const firstVoiced = hosts.hosts.find((host) => host.voice);
        if (firstVoiced) {
          this.form.patchValue({ hostId: firstVoiced.id });
          this.selectedHostId.set(firstVoiced.id);
        }
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });

    this.pollTimer = setInterval(() => {
      if (this.hasPending() && !this.refreshing()) {
        this.loadScripts(this.page(), true);
      }
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.closePlayer();
  }

  protected stationArtwork(station: RadioStation): string {
    return this.stations.artworkUrl(station) ?? this.defaultArtwork;
  }

  protected onHostChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedHostId.set(value);
    this.form.controls.hostId.setValue(value);
    this.formError.set(null);
  }

  protected setMode(mode: ScriptMode): void {
    this.mode.set(mode);
    this.form.controls.mode.setValue(mode);
    this.formError.set(null);
  }

  protected countWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
  }

  protected sourceWordCount(): number {
    return this.countWords(this.form.controls.text.value);
  }

  protected hostLabel(host: HostPersona): string {
    return host.voice
      ? `${host.name} — ${host.voice.name} · ${this.capitalize(host.voice.emotion)}`
      : `${host.name} — no voice assigned`;
  }

  protected createDraft(): void {
    this.formError.set(null);
    this.notice.set(null);
    this.form.markAllAsTouched();

    const host = this.selectedHost();

    if (!host?.voice) {
      this.formError.set('Choose a host with an assigned voice.');
      return;
    }

    if (this.form.invalid) {
      this.formError.set('Check the highlighted fields and try again.');
      return;
    }

    if (
      this.mode() === 'text' &&
      this.sourceWordCount() > this.limits().maxWords
    ) {
      this.formError.set(
        `That text is too long for the 10-minute limit. Shorten it to ${this.limits().maxWords} words or fewer.`,
      );
      return;
    }

    const values = this.form.getRawValue();
    const payload: CreateScriptDraftPayload = {
      hostId: host.id,
      title: values.title.trim() || undefined,
      mode: this.mode(),
      text: values.text.trim(),
      research: this.mode() === 'guideline' ? true : values.research,
    };

    this.creatingDraft.set(true);

    this.creator.createScriptDraft(this.slug, payload).subscribe({
      next: (response) => {
        this.creatingDraft.set(false);
        this.setDraft(response.script);
        this.notice.set(
          'Draft ready. Review the text, edit it if needed, then approve it for audio.',
        );
        this.loadScripts(1, true);
        this.scrollToDraft();
      },
      error: (error: unknown) => {
        this.creatingDraft.set(false);
        this.formError.set(apiErrorMessage(error));
      },
    });
  }

  protected openDraft(script: ScriptView): void {
    this.setDraft(script);
    this.draftError.set(null);
    this.scrollToDraft();
  }

  protected closeDraft(): void {
    this.draft.set(null);
    this.draftText.set('');
    this.draftTitle.set('');
    this.draftDirty.set(false);
    this.draftError.set(null);
  }

  protected onDraftTextInput(event: Event): void {
    this.draftText.set((event.target as HTMLTextAreaElement).value);
    this.draftDirty.set(true);
  }

  protected onDraftTitleInput(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement).value);
    this.draftDirty.set(true);
  }

  protected saveDraft(): void {
    const draft = this.draft();

    if (!draft) {
      return;
    }

    this.draftError.set(null);
    this.savingDraft.set(true);

    this.creator
      .updateScriptDraft(this.slug, draft.id, {
        title: this.draftTitle().trim() || draft.title,
        scriptText: this.draftText().trim(),
      })
      .subscribe({
        next: (response) => {
          this.savingDraft.set(false);
          this.setDraft(response.script);
          this.notice.set('Draft saved.');
          this.loadScripts(this.page(), true);
        },
        error: (error: unknown) => {
          this.savingDraft.set(false);
          this.draftError.set(apiErrorMessage(error));
        },
      });
  }

  protected approveDraft(): void {
    const draft = this.draft();

    if (!draft) {
      return;
    }

    this.draftError.set(null);

    if (this.draftTooLong()) {
      this.draftError.set(
        `The script is too long for the 10-minute limit. Shorten it to ${this.limits().maxWords} words or fewer.`,
      );
      return;
    }

    const title = this.draftTitle().trim() || draft.title;
    const scriptText = this.draftText().trim();
    const needsUpdate =
      title !== draft.title || scriptText !== draft.scriptText;

    this.approving.set(true);

    const update$ = needsUpdate
      ? this.creator.updateScriptDraft(this.slug, draft.id, {
          title,
          scriptText,
        })
      : of({ script: draft });

    update$
      .pipe(switchMap(() => this.creator.approveScript(this.slug, draft.id)))
      .subscribe({
        next: (response) => {
          this.approving.set(false);
          this.setDraft(response.script);
          this.notice.set(
            'Approved. The host audio is now queued for generation.',
          );
          this.replaceScript(response.script);
          this.loadScripts(this.page(), true);
        },
        error: (error: unknown) => {
          this.approving.set(false);
          this.draftError.set(apiErrorMessage(error));
        },
      });
  }

  protected retryScript(script: ScriptView): void {
    this.pageError.set(null);
    this.notice.set(null);
    this.creator.retryScript(this.slug, script.id).subscribe({
      next: (response) => {
        this.replaceScript(response.script);
        if (this.draft()?.id === response.script.id) {
          this.setDraft(response.script);
        }
        this.notice.set('The script audio is queued for another attempt.');
        this.loadScripts(this.page(), true);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
      },
    });
  }

  protected loadScripts(page: number, background: boolean): void {
    if (!this.slug) {
      return;
    }

    this.refreshing.set(true);

    this.creator.getScripts(this.slug, page, PAGE_SIZE).subscribe({
      next: (response) => {
        this.applyScripts(
          response.scripts,
          response.pagination,
          response.limits,
        );
        this.refreshing.set(false);
      },
      error: (error: unknown) => {
        if (!background) {
          this.pageError.set(apiErrorMessage(error));
        }
        this.refreshing.set(false);
      },
    });
  }

  protected refresh(): void {
    this.loadScripts(this.page(), true);
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
    this.loadScripts(target, false);
  }

  protected toggleScript(script: ScriptView): void {
    if (script.status !== 'completed' || !script.hasAudio) {
      return;
    }

    if (this.playingId() === script.id) {
      if (this.audio.paused) {
        this.playAudio();
      } else {
        this.audio.pause();
      }
      return;
    }

    this.loadAudio(script);
  }

  protected isCurrentScript(script: ScriptView): boolean {
    return this.playingId() === script.id;
  }

  protected seek(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.audio.currentTime = Math.max(
      0,
      Math.min(value, this.audioDuration() || 0),
    );
    this.currentTime.set(this.audio.currentTime);
  }

  protected formatTime(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
  }

  protected statusPillClass(status: ScriptStatus): string {
    if (status === 'completed') {
      return 'status-pill status-pill--published';
    }

    return `status-pill status-pill--${status}`;
  }

  protected modeLabel(mode: ScriptMode): string {
    return mode === 'text' ? 'My text' : 'AI topic';
  }

  protected capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private applyScripts(
    scripts: ScriptView[],
    pagination: ScriptPagination,
    limits: ScriptLimits,
  ): void {
    this.scripts.set(scripts);
    this.pagination.set(pagination);
    this.limits.set(limits);
    this.page.set(pagination.page);
    this.syncActiveDraft(scripts);
  }

  private syncActiveDraft(scripts: ScriptView[]): void {
    const current = this.draft();

    if (!current) {
      return;
    }

    const fresh = scripts.find((script) => script.id === current.id);

    if (!fresh) {
      return;
    }

    this.draft.set({
      ...fresh,
      title: this.draftDirty() ? current.title : fresh.title,
      scriptText: this.draftDirty() ? current.scriptText : fresh.scriptText,
    });

    if (!this.draftDirty()) {
      this.draftText.set(fresh.scriptText);
      this.draftTitle.set(fresh.title);
    }
  }

  private setDraft(script: ScriptView): void {
    this.draft.set(script);
    this.draftText.set(script.scriptText);
    this.draftTitle.set(script.title);
    this.draftDirty.set(false);
    this.draftError.set(null);
  }

  private replaceScript(script: ScriptView): void {
    this.scripts.update((scripts) =>
      scripts.map((item) => (item.id === script.id ? script : item)),
    );
  }

  private loadAudio(script: ScriptView): void {
    this.playerError.set(null);
    this.audioLoadingId.set(script.id);
    this.audioSub?.unsubscribe();
    this.audioSub = this.creator
      .getScriptAudio(this.slug, script.id)
      .subscribe({
        next: (blob) => {
          this.audio.pause();
          this.revokeObjectUrl();
          this.objectUrl = URL.createObjectURL(blob);
          this.audio.src = this.objectUrl;
          this.audio.load();
          this.playingId.set(script.id);
          this.currentTime.set(0);
          this.audioDuration.set(script.durationSeconds ?? 0);
          this.audioLoadingId.set(null);
          this.playAudio();
        },
        error: (error: unknown) => {
          this.playerError.set(apiErrorMessage(error));
          this.audioLoadingId.set(null);
        },
      });
  }

  private playAudio(): void {
    void this.audio.play().catch(() => {
      this.isPlaying.set(false);
      this.playerError.set('Your browser blocked playback. Press play again.');
    });
  }

  private closePlayer(): void {
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

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private scrollToDraft(): void {
    setTimeout(() => {
      document.getElementById('script-draft')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }
}
