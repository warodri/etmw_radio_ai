import { ObjectId } from 'mongodb';

export const STATION_STATUSES = ['draft', 'published', 'paused', 'archived'] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];

export interface StationArtwork {
  mimeType: string;
  data?: Buffer;
}

export interface StationDocument {
  _id?: ObjectId;
  ownerId: ObjectId;
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
  artwork: StationArtwork | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface StationView {
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

export interface StationViewOptions {
  viewerId?: string;
  includePrivate?: boolean;
}

export function toStationView(
  station: StationDocument & { _id: ObjectId },
  options: StationViewOptions = {},
): StationView {
  const id = station._id.toHexString();
  const isOwner = Boolean(options.viewerId && options.viewerId === station.ownerId.toHexString());
  const canSeePrivate = options.includePrivate === true || isOwner;
  const hasArtwork = Boolean(station.artwork?.mimeType);

  return {
    id,
    name: station.name,
    slug: station.slug,
    description: station.description,
    language: station.language,
    tags: station.tags,
    region: station.region,
    genres: station.genres,
    presentationStyle: station.presentationStyle,
    presentationNotes: canSeePrivate ? station.presentationNotes : null,
    status: station.status,
    artworkUrl: hasArtwork ? `/stations/${id}/artwork?v=${station.updatedAt.getTime()}` : null,
    isOwner,
    createdAt: station.createdAt.toISOString(),
    updatedAt: station.updatedAt.toISOString(),
    publishedAt: station.publishedAt ? station.publishedAt.toISOString() : null,
  };
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}
