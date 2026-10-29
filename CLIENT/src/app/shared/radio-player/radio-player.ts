import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RadioStation } from '../../core/models/station.models';
import { RadioPlayerService } from '../../core/services/radio-player.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../core/services/station.service';

@Component({
  selector: 'app-radio-player',
  imports: [RouterLink],
  templateUrl: './radio-player.html',
  styleUrl: './radio-player.scss',
})
export class RadioPlayer {
  protected readonly player = inject(RadioPlayerService);
  private readonly stations = inject(StationService);
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected artworkUrl(station: RadioStation): string {
    return this.stations.artworkUrl(station) ?? this.defaultArtwork;
  }

  protected formatTime(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = String(safe % 60).padStart(2, '0');

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
      : `${minutes}:${rest}`;
  }

  protected progress(): number {
    const duration = this.player.duration();
    return duration > 0
      ? Math.min(100, Math.max(0, (this.player.elapsed() / duration) * 100))
      : 0;
  }

  protected onVolumeInput(event: Event): void {
    this.player.setVolume(Number((event.target as HTMLInputElement).value) / 100);
  }
}
