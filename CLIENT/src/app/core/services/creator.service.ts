import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  CreateCreatorSongPayload,
  CreateCreatorSongResponse,
  CreatorDashboardResponse,
} from '../models/creator.models';
import {
  GenerateHostAvatarPayload,
  GenerateHostAvatarResponse,
  HostListResponse,
  HostPayload,
  HostPersona,
  HostResponse,
  HostVoiceCatalogResponse,
  HostVoicePayload,
} from '../models/host.models';
import {
  CreateScriptDraftPayload,
  ScriptListResponse,
  ScriptResponse,
  UpdateScriptDraftPayload,
} from '../models/script.models';

@Injectable({ providedIn: 'root' })
export class CreatorService {
  private readonly http = inject(HttpClient);

  getDashboard(slug: string, page: number, pageSize: number): Observable<CreatorDashboardResponse> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);

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

  getHosts(slug: string): Observable<HostListResponse> {
    return this.http.get<HostListResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts`,
    );
  }

  createHost(slug: string, payload: HostPayload): Observable<HostResponse> {
    return this.http.post<HostResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts`,
      payload,
    );
  }

  updateHost(
    slug: string,
    hostId: string,
    payload: Partial<HostPayload>,
  ): Observable<HostResponse> {
    return this.http.patch<HostResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts/${encodeURIComponent(hostId)}`,
      payload,
    );
  }

  deleteHost(slug: string, hostId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts/${encodeURIComponent(hostId)}`,
    );
  }

  generateHostAvatar(
    slug: string,
    payload: GenerateHostAvatarPayload,
  ): Observable<GenerateHostAvatarResponse> {
    return this.http.post<GenerateHostAvatarResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts/avatar/generate`,
      payload,
    );
  }

  getVoiceCatalog(): Observable<HostVoiceCatalogResponse> {
    return this.http.get<HostVoiceCatalogResponse>(`${API_BASE_URL}/creator/voice-catalog`);
  }

  assignHostVoice(
    slug: string,
    hostId: string,
    payload: HostVoicePayload,
  ): Observable<HostResponse> {
    return this.http.patch<HostResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts/${encodeURIComponent(hostId)}/voice`,
      payload,
    );
  }

  removeHostVoice(slug: string, hostId: string): Observable<HostResponse> {
    return this.http.delete<HostResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts/${encodeURIComponent(hostId)}/voice`,
    );
  }

  previewHostVoice(slug: string, hostId: string, payload: HostVoicePayload): Observable<Blob> {
    return this.http.post(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/hosts/${encodeURIComponent(hostId)}/voice/preview`,
      payload,
      { responseType: 'blob' },
    );
  }

  hostAvatarUrl(host: Pick<HostPersona, 'avatarUrl'>): string | null {
    if (!host.avatarUrl) {
      return null;
    }

    if (/^https?:\/\//i.test(host.avatarUrl)) {
      return host.avatarUrl;
    }

    return `${API_BASE_URL}${host.avatarUrl}`;
  }

  getScripts(
    slug: string,
    page: number,
    pageSize: number,
  ): Observable<ScriptListResponse> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<ScriptListResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/scripts`,
      { params },
    );
  }

  createScriptDraft(
    slug: string,
    payload: CreateScriptDraftPayload,
  ): Observable<ScriptResponse> {
    return this.http.post<ScriptResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/scripts`,
      payload,
    );
  }

  updateScriptDraft(
    slug: string,
    scriptId: string,
    payload: UpdateScriptDraftPayload,
  ): Observable<ScriptResponse> {
    return this.http.patch<ScriptResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/scripts/${encodeURIComponent(scriptId)}`,
      payload,
    );
  }

  approveScript(
    slug: string,
    scriptId: string,
  ): Observable<ScriptResponse> {
    return this.http.post<ScriptResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/scripts/${encodeURIComponent(scriptId)}/approve`,
      {},
    );
  }

  retryScript(slug: string, scriptId: string): Observable<ScriptResponse> {
    return this.http.post<ScriptResponse>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/scripts/${encodeURIComponent(scriptId)}/retry`,
      {},
    );
  }

  getScriptAudio(slug: string, scriptId: string): Observable<Blob> {
    return this.http.get(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/scripts/${encodeURIComponent(scriptId)}/audio`,
      { responseType: 'blob' },
    );
  }

  getSongAudio(slug: string, songId: string): Observable<Blob> {
    return this.http.get(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/songs/${encodeURIComponent(songId)}/audio`,
      { responseType: 'blob' },
    );
  }
}
