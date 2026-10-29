import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RadioStation } from '../../core/models/station.models';
import { apiErrorMessage, AuthService } from '../../core/services/auth.service';
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
  protected readonly auth = inject(AuthService);

  protected readonly bars = [34, 58, 42, 76, 50, 88, 44, 68, 38, 82, 52, 72, 36, 62, 46, 80];
  protected readonly stations = signal<RadioStation[]>([]);
  protected readonly loadingStations = signal(true);
  protected readonly stationsError = signal<string | null>(null);
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  ngOnInit(): void {
    this.loadStations();
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

  protected playStation(station: RadioStation, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.player.toggleStation(station);
  }
}
