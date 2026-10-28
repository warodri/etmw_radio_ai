import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CreatorDashboardResponse } from '../../../core/models/creator.models';
import { HostPersona } from '../../../core/models/host.models';
import { ScriptView } from '../../../core/models/script.models';
import { RadioStation } from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { CreatorService } from '../../../core/services/creator.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

@Component({
  selector: 'app-creator-overview',
  imports: [RouterLink],
  templateUrl: './creator-overview.html',
  styleUrl: './creator-overview.scss',
})
export class CreatorOverview implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly creator = inject(CreatorService);
  private readonly stations = inject(StationService);

  private slug = '';

  protected readonly dashboard = signal<CreatorDashboardResponse | null>(null);
  protected readonly hosts = signal<HostPersona[]>([]);
  protected readonly scripts = signal<ScriptView[]>([]);
  protected readonly scriptTotal = signal(0);
  protected readonly loading = signal(true);
  protected readonly pageError = signal<string | null>(null);
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected readonly station = computed(() => this.dashboard()?.station ?? null);
  protected readonly hostsCount = computed(() => this.hosts().length);
  protected readonly songsCount = computed(
    () => this.dashboard()?.pagination.total ?? 0,
  );
  protected readonly scriptsCount = computed(() => this.scriptTotal());
  protected readonly hostsPreview = computed(() => this.hosts().slice(0, 2));
  protected readonly songsPreview = computed(
    () => this.dashboard()?.songs.slice(0, 2) ?? [],
  );
  protected readonly scriptsPreview = computed(() => this.scripts().slice(0, 2));
  protected readonly hostsSummary = computed(() =>
    this.summarize(this.hostsPreview().map((host) => host.name), this.hostsCount(), 'No hosts yet'),
  );
  protected readonly songsSummary = computed(() =>
    this.summarize(this.songsPreview().map((song) => song.title), this.songsCount(), 'No songs yet'),
  );
  protected readonly scriptsSummary = computed(() =>
    this.summarize(
      this.scriptsPreview().map((script) => script.title),
      this.scriptsCount(),
      'No scripts yet',
    ),
  );

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

  protected load(): void {
    if (!this.slug) {
      return;
    }

    this.pageError.set(null);
    this.loading.set(true);

    forkJoin({
      dashboard: this.creator.getDashboard(this.slug, 1, 2),
      hosts: this.creator.getHosts(this.slug),
      scripts: this.creator.getScripts(this.slug, 1, 2),
    }).subscribe({
      next: ({ dashboard, hosts, scripts }) => {
        this.dashboard.set(dashboard);
        this.hosts.set(hosts.hosts);
        this.scripts.set(scripts.scripts);
        this.scriptTotal.set(scripts.pagination.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected stationArtwork(station: RadioStation): string {
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

  protected initial(title: string): string {
    return title.trim().charAt(0).toUpperCase() || '?';
  }

  protected countLabel(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  private summarize(names: string[], total: number, empty: string): string {
    if (!names.length) {
      return empty;
    }

    const extra = Math.max(0, total - names.length);
    return `${names.join(' & ')}${extra ? ` +${extra} more` : ''}`;
  }
}
