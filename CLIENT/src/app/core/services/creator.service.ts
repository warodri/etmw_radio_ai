import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  CreateCreatorSongPayload,
  CreateCreatorSongResponse,
  CreatorDashboardResponse,
} from '../models/creator.models';

@Injectable({ providedIn: 'root' })
export class CreatorService {
  private readonly http = inject(HttpClient);

  getDashboard(
    slug: string,
    page: number,
    pageSize: number,
  ): Observable<CreatorDashboardResponse> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    return this.http.get<CreatorDashboardResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}`,
      { params },
    );
  }

  createSong(
    slug: string,
    payload: CreateCreatorSongPayload,
  ): Observable<CreateCreatorSongResponse> {
    return this.http.post<CreateCreatorSongResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/songs`,
      payload,
    );
  }

  getSongAudio(slug: string, songId: string): Observable<Blob> {
    return this.http.get(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/songs/${encodeURIComponent(songId)}/audio`,
      { responseType: 'blob' },
    );
  }
}
