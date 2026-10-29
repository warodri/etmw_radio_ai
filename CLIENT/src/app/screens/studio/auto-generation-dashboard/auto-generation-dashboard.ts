import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AutoGenerationDashboard, AutoGenerationStatus } from '../../../core/models/auto-generation.models';
import { CreatorSong } from '../../../core/models/creator.models';
import { HostPersona } from '../../../core/models/host.models';
import { ScriptView } from '../../../core/models/script.models';
import { RadioStation } from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { AutoGenerationService } from '../../../core/services/auto-generation.service';
import { CreatorService } from '../../../core/services/creator.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

const STATUS_LABELS: Record<AutoGenerationStatus, string> = {
  queued: 'Queued',
  running: 'Generating',
  completed: 'Complete',
  failed: 'Failed',
};

@Component({
  selector: 'app-auto-generation-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './auto-generation-dashboard.html',
  styleUrl: './auto-generation-dashboard.scss',
})
export class AutoGenerationDashboardPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly auto = inject(AutoGenerationService);
  private readonly creator = inject(CreatorService);
  private readonly stations = inject(StationService);

  private slug = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly dashboard = signal<AutoGenerationDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly pageError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly clock = signal(Date.now());
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected readonly station = computed(() => this.dashboard()?.station ?? null);
  protected readonly hosts = computed(() => this.dashboard()?.hosts ?? []);
  protected readonly job = computed(() => this.dashboard()?.job ?? null);
  protected readonly voicedHosts = computed(() =>
    this.hosts().filter((host) => Boolean(host.voice)),
  );
  protected readonly isActive = computed(() => {
    const status = this.job()?.status;
    return status === 'queued' || status === 'running';
  });
  protected readonly canStart = computed(
    () => !this.loading() && !this.isActive() && this.voicedHosts().length > 0 && !this.starting(),
  );
  protected readonly progress = computed(() => {
    const job = this.job();

    if (!job) {
      return 0;
    }

    if (job.status === 'completed') {
      return 100;
    }

    if (job.status !== 'running' || !job.startedAt || !job.endsAt) {
      return 0;
    }

    const start = new Date(job.startedAt).getTime();
    const end = new Date(job.endsAt).getTime();
    return end > start
      ? Math.min(100, Math.max(0, ((this.clock() - start) / (end - start)) * 100))
      : 0;
  });
  protected readonly remainingLabel = computed(() => {
    const job = this.job();

    if (!job) {
      return '';
    }

    if (job.status === 'queued') {
      return 'Waiting for the current generation run to finish.';
    }

    if (job.status === 'completed') {
      return 'Run complete.';
    }

    if (job.status === 'failed') {
      return 'Run stopped.';
    }

    if (!job.endsAt) {
      return 'Starting…';
    }

    const remaining = Math.max(0, new Date(job.endsAt).getTime() - this.clock());
    const minutes = Math.ceil(remaining / 60000);
    return minutes > 0 ? `${minutes} min remaining` : 'Finishing the current item…';
  });

  constructor() {
    this.clockTimer = setInterval(() => this.clock.set(Date.now()), 1000);
  }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.pageError.set('That station does not exist.');
      this.loading.set(false);
      return;
    }

    this.slug = slug;
    this.load();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.pageError.set(null);

    this.auto.getDashboard(this.slug).subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
        this.schedulePoll();
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected start(): void {
    if (!this.canStart()) {
      return;
    }

    this.starting.set(true);
    this.actionError.set(null);

    this.auto.start(this.slug).subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.starting.set(false);
        this.schedulePoll();
      },
      error: (error: unknown) => {
        this.starting.set(false);
        this.actionError.set(apiErrorMessage(error));
      },
    });
  }

  protected artworkUrl(station: RadioStation): string {
    return this.stations.artworkUrl(station) ?? this.defaultArtwork;
  }

  protected hostAvatar(host: HostPersona): string | null {
    return this.creator.hostAvatarUrl(host);
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected statusLabel(status: AutoGenerationStatus): string {
    return STATUS_LABELS[status];
  }

  protected statusPill(status: AutoGenerationStatus): string {
    if (status === 'running') {
      return 'status-pill status-pill--generating';
    }

    if (status === 'completed') {
      return 'status-pill status-pill--published';
    }

    if (status === 'failed') {
      return 'status-pill status-pill--failed';
    }

    return 'status-pill status-pill--queued';
  }

  protected formatDuration(seconds: number | null): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds ?? 0)) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = String(safe % 60).padStart(2, '0');

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
      : `${minutes}:${rest}`;
  }

  protected songDuration(song: CreatorSong): string {
    return this.formatDuration(song.durationSeconds);
  }

  protected scriptDuration(script: ScriptView): string {
    return this.formatDuration(script.durationSeconds);
  }

  protected itemStatus(status: string): string {
    if (status === 'completed') {
      return 'Ready';
    }

    if (status === 'failed') {
      return 'Failed';
    }

    if (status === 'draft') {
      return 'Draft';
    }

    if (status === 'queued') {
      return 'Queued';
    }

    return 'Writing';
  }

  private schedulePoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (!this.isActive()) {
      return;
    }

    this.pollTimer = setInterval(() => {
      this.auto.getDashboard(this.slug).subscribe({
        next: (dashboard) => {
          this.dashboard.set(dashboard);

          if (!this.isActive()) {
            this.stopPolling();
          }
        },
        error: () => undefined,
      });
    }, 5000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
