import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  PlaylistEditorResponse,
  PlaylistSavePayload,
  PublicRadioResponse,
} from '../models/playlist.models';

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private readonly http = inject(HttpClient);

  getEditor(slug: string): Observable<PlaylistEditorResponse> {
    return this.http.get<PlaylistEditorResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/playlist`,
    );
  }

  save(
    slug: string,
    payload: PlaylistSavePayload,
  ): Observable<PlaylistEditorResponse> {
    return this.http.put<PlaylistEditorResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/playlist`,
      payload,
    );
  }

  preview(slug: string, at: number, duration = 30): Observable<Blob> {
    const params = new HttpParams()
      .set('at', String(Math.max(0, Math.floor(at))))
      .set('duration', String(duration));

    return this.http.get(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/playlist/preview`,
      { params, responseType: 'blob' },
    );
  }

  getRadio(slug: string): Observable<PublicRadioResponse> {
    return this.http.get<PublicRadioResponse>(
      `${API_BASE_URL}/stations/${encodeURIComponent(slug)}/radio`,
    );
  }

  streamUrl(slug: string, startSeconds?: number): string {
    const base = /^https?:\/\//i.test(API_BASE_URL)
      ? API_BASE_URL.replace(/\/+$/, '')
      : new URL(API_BASE_URL, globalThis.location.origin)
          .toString()
          .replace(/\/+$/, '');
    const suffix =
      startSeconds !== undefined && Number.isFinite(startSeconds)
        ? `?start=${Math.max(0, Math.floor(startSeconds))}`
        : '';

    return `${base}/stations/${encodeURIComponent(slug)}/stream.mp3${suffix}`;
  }
}
