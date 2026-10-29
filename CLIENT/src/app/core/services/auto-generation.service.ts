import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import {
  AutoGenerationDashboard,
  AutoGenerationStatusResponse,
} from '../models/auto-generation.models';

@Injectable({ providedIn: 'root' })
export class AutoGenerationService {
  private readonly http = inject(HttpClient);

  getDashboard(slug: string): Observable<AutoGenerationDashboard> {
    return this.http.get<AutoGenerationDashboard>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/auto-generation`,
    );
  }

  start(slug: string): Observable<AutoGenerationDashboard> {
    return this.http.post<AutoGenerationDashboard>(
      `${API_BASE_URL}/creator/stations/${encodeURIComponent(slug)}/auto-generation`,
      {},
    );
  }

  getStatuses(): Observable<AutoGenerationStatusResponse> {
    return this.http.get<AutoGenerationStatusResponse>(
      `${API_BASE_URL}/generation/status`,
    );
  }
}
