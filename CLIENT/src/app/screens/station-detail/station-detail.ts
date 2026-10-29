import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  RadioStation,
  STATION_STATUS_LABELS,
} from '../../core/models/station.models';
import { apiErrorMessage } from '../../core/services/auth.service';
import { RadioPlayerService } from '../../core/services/radio-player.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../core/services/station.service';

@Component({
  selector: 'app-station-detail',
  imports: [DatePipe, RouterLink],
  templateUrl: './station-detail.html',
  styleUrl: './station-detail.scss',
})
export class StationDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly stationService = inject(StationService);
  private readonly player = inject(RadioPlayerService);

  protected readonly station = signal<RadioStation | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly statusLabels = STATION_STATUS_LABELS;
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.error.set('That station does not exist.');
      this.loading.set(false);
      return;
    }

    this.loadStation(slug);
  }

  protected loadStation(slug: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.stationService.getStation(slug).subscribe({
      next: (response) => {
        this.station.set(response.station);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected artworkUrl(station: RadioStation): string | null {
    return this.stationService.artworkUrl(station);
  }

  protected playStation(station: RadioStation): void {
    this.player.toggleStation(station);
  }

  protected statusPillClass(station: RadioStation): string {
    return `status-pill status-pill--${station.status}`;
  }
}
