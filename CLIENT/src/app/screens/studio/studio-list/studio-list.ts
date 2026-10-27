import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  RadioStation,
  STATION_STATUS_LABELS,
  StationStatus,
} from '../../../core/models/station.models';
import { apiErrorMessage, AuthService } from '../../../core/services/auth.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

type StatusFilter = 'all' | StationStatus;

@Component({
  selector: 'app-studio-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './studio-list.html',
  styleUrl: './studio-list.scss',
})
export class StudioList implements OnInit {
  private readonly stationService = inject(StationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly stations = signal<RadioStation[]>([]);
  protected readonly loading = signal(true);
  protected readonly pageError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly updatingId = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly filter = signal<StatusFilter>('all');
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected readonly statuses: StationStatus[] = [
    'draft',
    'published',
    'paused',
    'archived',
  ];
  protected readonly statusLabels = STATION_STATUS_LABELS;
  protected readonly filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
    { value: 'paused', label: 'Paused' },
    { value: 'archived', label: 'Archived' },
  ];

  protected readonly filteredStations = computed(() => {
    const current = this.filter();
    const stations = this.stations();

    return current === 'all'
      ? stations
      : stations.filter((station) => station.status === current);
  });

  ngOnInit(): void {
    const created = this.route.snapshot.queryParamMap.get('created');
    const updated = this.route.snapshot.queryParamMap.get('updated');

    if (created) {
      this.notice.set('Station created. It is ready in your studio.');
    } else if (updated) {
      this.notice.set('Station updated.');
    }

    if (created || updated) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    this.loadStations();
  }

  protected loadStations(): void {
    this.loading.set(true);
    this.pageError.set(null);

    this.stationService.getMyStations().subscribe({
      next: (response) => {
        this.stations.set(response.stations);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected countFor(filter: StatusFilter): number {
    const stations = this.stations();
    return filter === 'all'
      ? stations.length
      : stations.filter((station) => station.status === filter).length;
  }

  protected setFilter(filter: StatusFilter): void {
    this.filter.set(filter);
    this.notice.set(null);
  }

  protected artworkUrl(station: RadioStation): string | null {
    return this.stationService.artworkUrl(station);
  }

  protected statusPillClass(status: StationStatus): string {
    return `status-pill status-pill--${status}`;
  }

  protected changeStatus(station: RadioStation, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = select.value as StationStatus;

    if (status === station.status) {
      return;
    }

    this.pageError.set(null);
    this.notice.set(null);
    this.updatingId.set(station.id);

    this.stationService.updateStation(station.id, { status }).subscribe({
      next: (response) => {
        this.stations.update((stations) =>
          stations.map((item) =>
            item.id === response.station.id ? response.station : item,
          ),
        );
        this.updatingId.set(null);
        this.notice.set(
          `"${response.station.name}" is now ${STATION_STATUS_LABELS[response.station.status].toLowerCase()}.`,
        );
      },
      error: (error: unknown) => {
        select.value = station.status;
        this.updatingId.set(null);
        this.pageError.set(apiErrorMessage(error));
      },
    });
  }

  protected remove(station: RadioStation): void {
    const confirmed = window.confirm(
      `Delete "${station.name}"? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    this.pageError.set(null);
    this.notice.set(null);
    this.deletingId.set(station.id);

    this.stationService.deleteStation(station.id).subscribe({
      next: () => {
        this.stations.update((stations) =>
          stations.filter((item) => item.id !== station.id),
        );
        this.deletingId.set(null);
        this.notice.set(`"${station.name}" was deleted.`);
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.pageError.set(apiErrorMessage(error));
      },
    });
  }
}
