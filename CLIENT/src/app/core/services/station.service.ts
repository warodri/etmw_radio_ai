import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  RadioStation,
  StationListResponse,
  StationPayload,
  StationResponse,
} from '../models/station.models';

export const DEFAULT_STATION_ARTWORK = 'brand/default-radio-station-image.jpg';

@Injectable({ providedIn: 'root' })
export class StationService {
  private readonly http = inject(HttpClient);

  getPublicStations(): Observable<StationListResponse> {
    return this.http.get<StationListResponse>(`${API_BASE_URL}/stations/public`);
  }

  getMyStations(): Observable<StationListResponse> {
    return this.http.get<StationListResponse>(`${API_BASE_URL}/stations/mine`);
  }

  getStation(slug: string): Observable<StationResponse> {
    return this.http.get<StationResponse>(
      `${API_BASE_URL}/stations/${encodeURIComponent(slug)}`,
    );
  }

  createStation(payload: StationPayload): Observable<StationResponse> {
    return this.http.post<StationResponse>(`${API_BASE_URL}/stations`, payload);
  }

  updateStation(
    id: string,
    payload: Partial<StationPayload>,
  ): Observable<StationResponse> {
    return this.http.patch<StationResponse>(
      `${API_BASE_URL}/stations/${encodeURIComponent(id)}`,
      payload,
    );
  }

  deleteStation(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${API_BASE_URL}/stations/${encodeURIComponent(id)}`,
    );
  }

  artworkUrl(station: Pick<RadioStation, 'artworkUrl'>): string | null {
    if (!station.artworkUrl) {
      return null;
    }

    if (/^https?:\/\//i.test(station.artworkUrl)) {
      return station.artworkUrl;
    }

    return `${API_BASE_URL}${station.artworkUrl}`;
  }
}
