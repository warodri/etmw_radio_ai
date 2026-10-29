import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CreatorSong } from '../../../core/models/creator.models';
import {
  PlaylistEditorResponse,
  PlaylistItem,
  PlaylistItemKind,
  PlaylistVolumePoint,
  PlaylistView,
} from '../../../core/models/playlist.models';
import { ScriptView } from '../../../core/models/script.models';
import { RadioStation } from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { PlaylistService } from '../../../core/services/playlist.service';
import { RadioPlayerService } from '../../../core/services/radio-player.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

const PREVIEW_SECONDS = 45;
const MAX_START_SECONDS = 86_400;
const DRAG_TYPE = 'application/x-etmw-playlist';

type SaveState = 'saved' | 'saving' | 'error';

@Component({
  selector: 'app-playlist-dashboard',
  imports: [RouterLink],
  templateUrl: './playlist-dashboard.html',
  styleUrl: './playlist-dashboard.scss',
})
export class PlaylistDashboard implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly playlists = inject(PlaylistService);
  private readonly stations = inject(StationService);
  private readonly radio = inject(RadioPlayerService);

  private slug = '';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  private saving = false;
  private savePending = false;
  private scrubTrack: HTMLElement | null = null;
  private previewUrl: string | null = null;
  private previewStartedAt = 0;
  private previewToken = 0;
  private readonly previewAudio = new Audio();

  protected readonly station = signal<RadioStation | null>(null);
  protected readonly playlist = signal<PlaylistView | null>(null);
  protected readonly songs = signal<CreatorSong[]>([]);
  protected readonly scripts = signal<ScriptView[]>([]);
  protected readonly streamUrl = signal('');
  protected readonly publicStreamReady = signal(false);
  protected readonly loading = signal(true);
  protected readonly pageError = signal<string | null>(null);
  protected readonly saveState = signal<SaveState>('saved');
  protected readonly saveError = signal<string | null>(null);
  protected readonly selectionError = signal<string | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly playhead = signal(0);
  protected readonly duckVolume = signal(15);
  protected readonly previewing = signal(false);
  protected readonly previewLoading = signal(false);
  protected readonly previewError = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;
  protected readonly previewSeconds = PREVIEW_SECONDS;
  protected readonly timelineTicks = [0, 0.25, 0.5, 0.75, 1];

  protected readonly items = computed(() => this.playlist()?.items ?? []);
  protected readonly totalDuration = computed(
    () => this.playlist()?.totalDurationSeconds ?? 0,
  );
  protected readonly voiceItems = computed(() =>
    this.items().filter((item) => item.kind === 'script'),
  );
  protected readonly musicItems = computed(() =>
    this.items().filter((item) => item.kind === 'song'),
  );
  protected readonly selectedItem = computed(
    () => this.items().find((item) => item.id === this.selectedId()) ?? null,
  );
  protected readonly selectedKeyframes = computed(
    () => this.selectedItem()?.volumeKeyframes ?? [],
  );
  protected readonly playheadPercent = computed(() => {
    const total = this.totalDuration();
    return total > 0 ? Math.min(100, Math.max(0, (this.playhead() / total) * 100)) : 0;
  });

  constructor() {
    this.previewAudio.preload = 'auto';
    this.previewAudio.addEventListener('timeupdate', () => {
      const total = this.totalDuration();
      const raw = this.previewStartedAt + (this.previewAudio.currentTime || 0);
      this.playhead.set(total > 0 ? raw % total : raw);
    });
    this.previewAudio.addEventListener('ended', () => this.stopPreview());
    this.previewAudio.addEventListener('error', () => {
      if (this.previewing()) {
        this.previewError.set('The playlist preview could not be played.');
        this.stopPreview(false);
      }
    });
  }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.pageError.set('That station does not exist.');
      this.loading.set(false);
      return;
    }

    this.slug = slug;
    this.load();
  }

  ngOnDestroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.stopPreview();
  }

  protected load(): void {
    if (!this.slug) {
      return;
    }

    this.loading.set(true);
    this.pageError.set(null);

    this.playlists.getEditor(this.slug).subscribe({
      next: (response) => {
        this.applyEditor(response);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected artworkUrl(station: RadioStation): string {
    return this.stations.artworkUrl(station) ?? this.defaultArtwork;
  }

  protected formatDuration(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const rest = String(safe % 60).padStart(2, '0');

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
      : `${minutes}:${rest}`;
  }

  protected formatTotal(seconds: number): string {
    const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);

    if (hours > 0) {
      return `${hours} h ${String(minutes).padStart(2, '0')} min`;
    }

    if (minutes > 0) {
      return `${minutes} min ${String(safe % 60).padStart(2, '0')} s`;
    }

    return `${safe} s`;
  }

  protected formatPercent(value: number): string {
    return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
  }

  protected songStyle(song: CreatorSong): string {
    if (song.style.trim()) {
      return song.style;
    }

    return song.tags.slice(0, 4).join(' · ') || song.genres.slice(0, 4).join(' · ');
  }

  protected scriptHosts(script: ScriptView): string {
    return script.participants.map((participant) => participant.name).join(' & ');
  }

  protected trackLeft(item: PlaylistItem): number {
    const total = this.totalDuration();
    return total > 0 ? Math.min(100, Math.max(0, (item.startAt / total) * 100)) : 0;
  }

  protected trackWidth(item: PlaylistItem): number {
    const total = this.totalDuration();
    return total > 0
      ? Math.min(100, Math.max(0, (item.durationSeconds / total) * 100))
      : 0;
  }

  protected tickLabel(tick: number): string {
    return this.formatDuration(this.totalDuration() * tick);
  }

  protected pointPosition(item: PlaylistItem, point: PlaylistVolumePoint): number {
    return item.durationSeconds > 0
      ? Math.min(100, Math.max(0, (point.atSeconds / item.durationSeconds) * 100))
      : 0;
  }

  protected isSelected(item: PlaylistItem): boolean {
    return item.id === this.selectedId();
  }

  protected selectItem(item: PlaylistItem): void {
    this.selectedId.set(item.id);
    this.selectionError.set(null);
  }

  protected addSong(song: CreatorSong, mode: 'end' | 'playhead'): void {
    const startAt = this.startForMode(mode);
    const overlay = mode === 'playhead' && this.scriptAt(startAt) !== null;

    this.addItem({
      id: this.newId(),
      kind: 'song',
      sourceId: song.id,
      title: song.title,
      subtitle: this.songStyle(song),
      durationSeconds: song.durationSeconds,
      startAt,
      volume: overlay ? 0.35 : 1,
      volumeKeyframes: [],
    });
  }

  protected addScript(script: ScriptView, mode: 'end' | 'playhead'): void {
    if (!script.durationSeconds || script.durationSeconds <= 0) {
      this.selectionError.set('That conversation does not have playable audio yet.');
      return;
    }

    this.addItem({
      id: this.newId(),
      kind: 'script',
      sourceId: script.id,
      title: script.title,
      subtitle: this.scriptHosts(script),
      durationSeconds: script.durationSeconds,
      startAt: this.startForMode(mode),
      volume: 1,
      volumeKeyframes: [],
    });
  }

  protected removeItem(item: PlaylistItem): void {
    this.updatePlaylist(
      this.items().filter((candidate) => candidate.id !== item.id),
    );

    if (this.selectedId() === item.id) {
      this.selectedId.set(null);
    }
  }

  protected moveItemToPlayhead(item: PlaylistItem): void {
    this.updateItem(item.id, (candidate) => ({
      ...candidate,
      startAt: this.round(this.playhead()),
    }));
  }

  protected setItemStart(item: PlaylistItem, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.updateItem(item.id, (candidate) => ({
      ...candidate,
      startAt: Math.min(MAX_START_SECONDS, Math.max(0, Number.isFinite(value) ? value : 0)),
    }));
  }

  protected setItemVolume(item: PlaylistItem, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    this.updateItem(item.id, (candidate) => ({
      ...candidate,
      volume: Math.min(1, Math.max(0, value)),
    }));
  }

  protected setDuckVolume(event: Event): void {
    this.duckVolume.set(
      Math.min(100, Math.max(0, Number((event.target as HTMLInputElement).value))),
    );
  }

  protected addVolumePoint(): void {
    const item = this.selectedItem();

    if (!item || item.kind !== 'song') {
      return;
    }

    const relative = this.playhead() - item.startAt;

    if (relative < 0 || relative > item.durationSeconds) {
      this.selectionError.set(
        'Move the playhead inside this song before adding a volume point.',
      );
      return;
    }

    const atSeconds = this.round(Math.max(0, Math.min(item.durationSeconds, relative)));
    const volume = this.duckVolume() / 100;
    const points = [
      ...item.volumeKeyframes.filter((point) => Math.abs(point.atSeconds - atSeconds) > 0.05),
      { atSeconds, volume },
    ].sort((a, b) => a.atSeconds - b.atSeconds);

    this.updateItem(item.id, (candidate) => ({
      ...candidate,
      volumeKeyframes: points,
    }));
    this.selectionError.set(null);
  }

  protected removeVolumePoint(item: PlaylistItem, point: PlaylistVolumePoint): void {
    this.updateItem(item.id, (candidate) => ({
      ...candidate,
      volumeKeyframes: candidate.volumeKeyframes.filter(
        (candidatePoint) => candidatePoint !== point,
      ),
    }));
  }

  protected onPlayheadInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.stopPreview();
    this.playhead.set(
      Math.min(this.totalDuration(), Math.max(0, Number.isFinite(value) ? value : 0)),
    );
  }

  protected onTimelinePointerDown(event: PointerEvent): void {
    if (this.totalDuration() <= 0) {
      return;
    }

    this.stopPreview();
    this.scrubTrack = event.currentTarget as HTMLElement;
    this.scrubTrack.setPointerCapture?.(event.pointerId);
    this.updatePlayheadFromPointer(event);
  }

  protected onTimelinePointerMove(event: PointerEvent): void {
    if (!this.scrubTrack) {
      return;
    }

    this.updatePlayheadFromPointer(event);
  }

  protected onTimelinePointerUp(event: PointerEvent): void {
    if (this.scrubTrack) {
      this.scrubTrack.releasePointerCapture?.(event.pointerId);
      this.scrubTrack = null;
    }
  }

  protected onTimelineDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const payload = this.readDrag(event);

    if (!payload) {
      return;
    }

    this.addDragged(payload.kind, payload.sourceId, 'playhead');
  }

  protected onPlaylistDrop(event: DragEvent): void {
    event.preventDefault();
    const payload = this.readDrag(event);

    if (!payload) {
      return;
    }

    this.addDragged(payload.kind, payload.sourceId, 'end');
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDragStart(
    event: DragEvent,
    kind: PlaylistItemKind,
    sourceId: string,
  ): void {
    if (!event.dataTransfer) {
      return;
    }

    const payload = JSON.stringify({ kind, sourceId });
    event.dataTransfer.setData(DRAG_TYPE, payload);
    event.dataTransfer.setData('text/plain', payload);
    event.dataTransfer.effectAllowed = 'copy';
  }

  protected togglePreview(): void {
    if (this.previewing() || this.previewLoading()) {
      this.stopPreview();
      return;
    }

    if (this.totalDuration() <= 0) {
      this.previewError.set('Add at least one item before previewing.');
      return;
    }

    this.radio.pause();
    this.previewLoading.set(true);
    this.previewError.set(null);
    const startedAt = this.playhead();
    const token = ++this.previewToken;

    this.playlists.preview(this.slug, startedAt, PREVIEW_SECONDS).subscribe({
      next: (blob) => {
        if (token !== this.previewToken) {
          return;
        }

        this.previewLoading.set(false);
        this.revokePreviewUrl();
        this.previewUrl = URL.createObjectURL(blob);
        this.previewStartedAt = startedAt;
        this.previewAudio.src = this.previewUrl;
        this.previewAudio.load();
        this.previewing.set(true);
        void this.previewAudio.play().catch(() => {
          this.previewing.set(false);
          this.previewError.set('Your browser blocked the preview. Press play again.');
        });
      },
      error: (error: unknown) => {
        if (token !== this.previewToken) {
          return;
        }

        this.previewLoading.set(false);
        this.previewError.set(apiErrorMessage(error));
      },
    });
  }

  protected stopPreview(showState = true): void {
    this.previewToken += 1;
    this.previewAudio.pause();
    this.previewAudio.removeAttribute('src');
    this.previewAudio.load();
    this.revokePreviewUrl();
    this.previewing.set(false);
    this.previewLoading.set(false);

    if (showState) {
      this.previewError.set(null);
    }
  }

  protected async copyStreamUrl(): Promise<void> {
    const url = this.streamUrl();

    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1800);
  }

  private applyEditor(response: PlaylistEditorResponse): void {
    this.station.set(response.station);
    this.playlist.set(response.playlist);
    this.songs.set(response.songs);
    this.scripts.set(response.scripts);
    this.streamUrl.set(response.streamUrl);
    this.publicStreamReady.set(response.publicStreamReady);
    this.playhead.set(
      Math.min(
        this.playhead(),
        response.playlist.totalDurationSeconds,
      ),
    );

    if (
      this.selectedId() &&
      !response.playlist.items.some((item) => item.id === this.selectedId())
    ) {
      this.selectedId.set(null);
    }

    if (!this.selectedId() && response.playlist.items.length > 0) {
      this.selectedId.set(response.playlist.items[0].id);
    }
  }

  private startForMode(mode: 'end' | 'playhead'): number {
    return this.round(
      mode === 'end' ? this.totalDuration() : this.playhead(),
    );
  }

  private scriptAt(seconds: number): PlaylistItem | null {
    return (
      this.items().find(
        (item) =>
          item.kind === 'script' &&
          item.startAt <= seconds &&
          item.startAt + item.durationSeconds > seconds,
      ) ?? null
    );
  }

  private addDragged(
    kind: PlaylistItemKind,
    sourceId: string,
    mode: 'end' | 'playhead',
  ): void {
    if (kind === 'song') {
      const song = this.songs().find((candidate) => candidate.id === sourceId);
      if (song) {
        this.addSong(song, mode);
      }
      return;
    }

    const script = this.scripts().find((candidate) => candidate.id === sourceId);
    if (script) {
      this.addScript(script, mode);
    }
  }

  private readDrag(event: DragEvent): { kind: PlaylistItemKind; sourceId: string } | null {
    const raw =
      event.dataTransfer?.getData(DRAG_TYPE) ||
      event.dataTransfer?.getData('text/plain');

    if (!raw) {
      return null;
    }

    try {
      const payload = JSON.parse(raw) as {
        kind?: PlaylistItemKind;
        sourceId?: string;
      };

      if (
        (payload.kind === 'song' || payload.kind === 'script') &&
        typeof payload.sourceId === 'string' &&
        payload.sourceId
      ) {
        return { kind: payload.kind, sourceId: payload.sourceId };
      }
    } catch {
      return null;
    }

    return null;
  }

  private addItem(item: PlaylistItem): void {
    if (!Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0) {
      this.selectionError.set('That item has no playable duration.');
      return;
    }

    const items = [...this.items(), item].sort(
      (a, b) => a.startAt - b.startAt || a.title.localeCompare(b.title),
    );
    this.updatePlaylist(items);
    this.selectedId.set(item.id);
    this.selectionError.set(null);
  }

  private updateItem(id: string, updater: (item: PlaylistItem) => PlaylistItem): void {
    const items = this.items()
      .map((item) => (item.id === id ? updater(item) : item))
      .sort((a, b) => a.startAt - b.startAt || a.title.localeCompare(b.title));
    this.updatePlaylist(items);
  }

  private updatePlaylist(items: PlaylistItem[]): void {
    const total = items.reduce(
      (longest, item) => Math.max(longest, item.startAt + item.durationSeconds),
      0,
    );

    this.playlist.update((playlist) =>
      playlist
        ? {
            ...playlist,
            items,
            itemCount: items.length,
            totalDurationSeconds: total,
          }
        : playlist,
    );
    this.playhead.set(Math.min(this.playhead(), total));
    this.queueSave();
  }

  private queueSave(): void {
    this.revision += 1;
    this.saveState.set('saving');
    this.saveError.set(null);

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 700);
  }

  protected saveNow(): void {
    if (!this.slug || this.loading()) {
      return;
    }

    if (this.saving) {
      this.savePending = true;
      return;
    }

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const revision = this.revision;
    this.saving = true;
    this.saveState.set('saving');
    this.saveError.set(null);

    this.playlists
      .save(this.slug, {
        items: this.items().map((item) => ({
          id: item.id,
          kind: item.kind,
          sourceId: item.sourceId,
          startAt: item.startAt,
          volume: item.volume,
          volumeKeyframes: item.volumeKeyframes,
        })),
      })
      .subscribe({
        next: (response) => {
          if (revision === this.revision) {
            this.applyEditor(response);
            this.saveState.set('saved');
          }
        },
        error: (error: unknown) => {
          this.saveState.set('error');
          this.saveError.set(apiErrorMessage(error));
        },
        complete: () => {
          this.saving = false;

          if (this.savePending || revision !== this.revision) {
            this.savePending = false;
            this.saveNow();
          }
        },
      });
  }

  private updatePlayheadFromPointer(event: PointerEvent): void {
    if (!this.scrubTrack) {
      return;
    }

    const rect = this.scrubTrack.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)),
    );
    this.playhead.set(ratio * this.totalDuration());
  }

  private newId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private round(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private revokePreviewUrl(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }
}
