export type StationStatus = 'draft' | 'published' | 'paused' | 'archived';

export interface RadioStation {
  id: string;
  name: string;
  slug: string;
  description: string;
  language: string;
  tags: string[];
  region: string | null;
  genres: string[];
  presentationStyle: string;
  presentationNotes: string | null;
  status: StationStatus;
  artworkUrl: string | null;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface StationPayload {
  name: string;
  slug: string;
  description: string;
  language: string;
  tags: string[];
  region: string | null;
  genres: string[];
  presentationStyle: string;
  presentationNotes: string | null;
  status: StationStatus;
  artworkDataUrl?: string | null;
  removeArtwork?: boolean;
}

export interface StationListResponse {
  stations: RadioStation[];
}

export interface StationResponse {
  station: RadioStation;
}

export const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  archived: 'Archived',
};

export const STATION_STATUS_DESCRIPTIONS: Record<StationStatus, string> = {
  draft: 'Private. Only you can see it while you prepare the station.',
  published: 'Public. Everyone can find it on the station dashboard.',
  paused: 'Hidden from the public, but kept ready to resume later.',
  archived: 'Retired from the dashboard and kept for your records.',
};
