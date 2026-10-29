import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AutoGenerationStatus } from '../../core/models/auto-generation.models';
import { RadioStation } from '../../core/models/station.models';
import { apiErrorMessage, AuthService } from '../../core/services/auth.service';
import { AutoGenerationService } from '../../core/services/auto-generation.service';
import { RadioPlayerService } from '../../core/services/radio-player.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../core/services/station.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private readonly stationService = inject(StationService);
  private readonly player = inject(RadioPlayerService);
  private readonly autoGeneration = inject(AutoGenerationService);
  protected readonly auth = inject(AuthService);

  protected readonly bars = [34, 58, 42, 76, 50, 88, 44, 68, 38, 82, 52, 72, 36, 62, 46, 80];
  protected readonly stations = signal<RadioStation[]>([]);
  protected readonly generationStatuses = signal<Record<string, AutoGenerationStatus>>({});
  protected readonly loadingStations = signal(true);
  protected readonly stationsError = signal<string | null>(null);
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  ngOnInit(): void {
    this.loadStations();
    this.loadGenerationStatuses();
  }

  protected loadStations(): void {
    this.loadingStations.set(true);
    this.stationsError.set(null);

    this.stationService.getPublicStations().subscribe({
      next: (response) => {
        this.stations.set(response.stations);
        this.loadingStations.set(false);
      },
      error: (error: unknown) => {
        this.stationsError.set(apiErrorMessage(error));
        this.loadingStations.set(false);
      },
    });
  }

  protected artworkUrl(station: RadioStation): string | null {
    return this.stationService.artworkUrl(station);
  }

  protected isGenerating(station: RadioStation): boolean {
    const status = this.generationStatuses()[station.slug];
    return status === 'queued' || status === 'running';
  }

  private loadGenerationStatuses(): void {
    this.autoGeneration.getStatuses().subscribe({
      next: (response) => {
        const statuses: Record<string, AutoGenerationStatus> = {};
        for (const entry of response.statuses) {
          statuses[entry.slug] = entry.status;
        }
        this.generationStatuses.set(statuses);
      },
      error: () => undefined,
    });
  }

  protected playStation(station: RadioStation, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.player.toggleStation(station);
  }
}
