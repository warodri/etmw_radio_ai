import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  HOST_SKILL_SUGGESTIONS,
  HostGender,
  HostPersona,
  HostSkill,
  HostVoiceCatalogResponse,
  HostVoiceEmotion,
  HostVoiceOption,
} from '../../../core/models/host.models';
import { RadioStation } from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { CreatorService } from '../../../core/services/creator.service';
import { DEFAULT_STATION_ARTWORK, StationService } from '../../../core/services/station.service';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

@Component({
  selector: 'app-hosts-dashboard',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './hosts-dashboard.html',
  styleUrl: './hosts-dashboard.scss',
})
export class HostsDashboard implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly creator = inject(CreatorService);
  private readonly stations = inject(StationService);

  private slug = '';

  protected readonly skillSuggestions = HOST_SKILL_SUGGESTIONS;
  protected readonly defaultArtwork = DEFAULT_STATION_ARTWORK;

  protected readonly station = signal<RadioStation | null>(null);
  protected readonly hosts = signal<HostPersona[]>([]);
  protected readonly loading = signal(true);
  protected readonly pageError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly generatingAvatar = signal(false);
  protected readonly avatarError = signal<string | null>(null);
  protected readonly avatarPreview = signal<string | null>(null);
  protected readonly avatarDataUrl = signal<string | null>(null);
  protected readonly avatarSource = signal<'upload' | 'ai' | null>(null);
  protected readonly removeAvatar = signal(false);
  protected readonly skillDraft = signal('');

  protected readonly voiceHost = signal<HostPersona | null>(null);
  protected readonly voiceCatalog = signal<HostVoiceCatalogResponse | null>(null);
  protected readonly voiceCatalogLoading = signal(false);
  protected readonly selectedVoiceId = signal<string | null>(null);
  protected readonly selectedEmotion = signal<HostVoiceEmotion>('calm');
  protected readonly previewLoading = signal(false);
  protected readonly previewPlaying = signal(false);
  protected readonly voiceSaving = signal(false);
  protected readonly voiceError = signal<string | null>(null);

  private readonly previewAudio = new Audio();
  private previewUrl: string | null = null;

  protected readonly editing = computed(() => this.editingId() !== null);
  protected readonly formTitle = computed(() =>
    this.editing() ? 'Edit host persona' : 'Create a host persona',
  );

  protected readonly voicePanelOpen = computed(() => this.voiceHost() !== null);
  protected readonly availableVoices = computed(() => {
    const host = this.voiceHost();
    const catalog = this.voiceCatalog();

    if (!host || !catalog) {
      return [];
    }

    return catalog.voices.filter((voice) => voice.gender === host.gender);
  });
  protected readonly emotionOptions = computed(() => this.voiceCatalog()?.emotions ?? []);
  protected readonly selectedVoice = computed(
    () => this.availableVoices().find((voice) => voice.id === this.selectedVoiceId()) ?? null,
  );

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    gender: this.fb.nonNullable.control<HostGender>('female'),
    personality: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(4000)]],
    skills: this.fb.nonNullable.control<HostSkill[]>([]),
  });

  constructor() {
    this.previewAudio.preload = 'auto';
    this.previewAudio.addEventListener('play', () => this.previewPlaying.set(true));
    this.previewAudio.addEventListener('pause', () => this.previewPlaying.set(false));
    this.previewAudio.addEventListener('ended', () => this.stopPreview());
    this.previewAudio.addEventListener('error', () => {
      if (this.previewPlaying()) {
        this.voiceError.set('This voice preview could not be played.');
      }
      this.stopPreview();
    });
  }

  ngOnDestroy(): void {
    this.stopPreview();
  }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');

    if (!slug) {
      this.pageError.set('That station does not exist.');
      this.loading.set(false);
      return;
    }

    this.slug = slug;
    this.loadHosts();
  }

  protected loadHosts(): void {
    if (!this.slug) {
      return;
    }

    this.loading.set(true);
    this.pageError.set(null);

    this.creator.getHosts(this.slug).subscribe({
      next: (response) => {
        this.station.set(response.station);
        this.hosts.set(response.hosts);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(apiErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected stationArtwork(station: RadioStation): string {
    return this.stations.artworkUrl(station) ?? this.defaultArtwork;
  }

  protected hostAvatar(host: HostPersona): string | null {
    return this.creator.hostAvatarUrl(host);
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  protected openCreate(): void {
    this.closeVoice();
    this.form.reset({ name: '', gender: 'female', personality: '', skills: [] });
    this.editingId.set(null);
    this.formError.set(null);
    this.notice.set(null);
    this.skillDraft.set('');
    this.resetAvatar();
    this.formOpen.set(true);
    this.scrollToForm();
  }

  protected openEdit(host: HostPersona): void {
    this.closeVoice();
    this.form.reset({
      name: host.name,
      gender: host.gender,
      personality: host.personality,
      skills: host.skills,
    });
    this.editingId.set(host.id);
    this.formError.set(null);
    this.notice.set(null);
    this.avatarError.set(null);
    this.skillDraft.set('');
    this.avatarPreview.set(this.creator.hostAvatarUrl(host));
    this.avatarDataUrl.set(null);
    this.avatarSource.set(host.avatarSource);
    this.removeAvatar.set(false);
    this.formOpen.set(true);
    this.scrollToForm();
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
    this.skillDraft.set('');
    this.resetAvatar();
  }

  protected setGender(gender: HostGender): void {
    this.form.controls.gender.setValue(gender);
    this.form.controls.gender.markAsDirty();
  }

  protected onSkillDraftInput(event: Event): void {
    this.skillDraft.set((event.target as HTMLInputElement).value);
  }

  protected onSkillKeydown(event: KeyboardEvent, input: HTMLInputElement): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addSkillTags(input);
    }
  }

  protected addSkillTags(input?: HTMLInputElement): void {
    const values = this.skillDraft().split(',');
    this.addSkillValues(values);
    this.skillDraft.set('');

    if (input) {
      input.value = '';
    }
  }

  protected addSkillTag(skill: string): void {
    this.addSkillValues([skill]);
  }

  protected removeSkill(skill: string): void {
    this.form.controls.skills.setValue(
      this.form.controls.skills.value.filter((item) => item !== skill),
    );
    this.form.controls.skills.markAsDirty();
  }

  protected commitSkillDraft(input?: HTMLInputElement): void {
    if (this.skillDraft().trim()) {
      this.addSkillTags(input);
    }
  }

  protected nameInvalid(): boolean {
    const control = this.form.controls.name;
    return control.invalid && (control.touched || control.dirty);
  }

  protected personalityInvalid(): boolean {
    const control = this.form.controls.personality;
    return control.invalid && (control.touched || control.dirty);
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      this.avatarError.set('Use a PNG, JPEG, WebP or GIF image.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      this.avatarError.set('The avatar image must be 2 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';

      if (!result.startsWith('data:image/')) {
        this.avatarError.set('That file could not be read as an image.');
        return;
      }

      this.avatarPreview.set(result);
      this.avatarDataUrl.set(result);
      this.avatarSource.set('upload');
      this.removeAvatar.set(false);
      this.avatarError.set(null);
    };
    reader.onerror = () => {
      this.avatarError.set('That file could not be read. Try another image.');
    };
    reader.readAsDataURL(file);
  }

  protected generateAvatar(): void {
    this.commitSkillDraft();
    const values = this.form.getRawValue();

    if (values.name.trim().length < 2) {
      this.form.controls.name.markAsTouched();
      this.avatarError.set('Add the host name first so the avatar has an identity.');
      return;
    }

    if (values.skills.length === 0) {
      this.avatarError.set('Choose at least one skill so the avatar reflects the show.');
      return;
    }

    this.generatingAvatar.set(true);
    this.avatarError.set(null);

    this.creator
      .generateHostAvatar(this.slug, {
        name: values.name.trim(),
        gender: values.gender,
        personality: values.personality.trim(),
        skills: values.skills,
      })
      .subscribe({
        next: (response) => {
          this.avatarPreview.set(response.avatarDataUrl);
          this.avatarDataUrl.set(response.avatarDataUrl);
          this.avatarSource.set('ai');
          this.removeAvatar.set(false);
          this.generatingAvatar.set(false);
          this.notice.set('Avatar generated. Save the host to keep it.');
        },
        error: (error: unknown) => {
          this.generatingAvatar.set(false);
          this.avatarError.set(apiErrorMessage(error));
        },
      });
  }

  protected removeAvatarImage(): void {
    this.avatarPreview.set(null);
    this.avatarDataUrl.set(null);
    this.avatarSource.set(null);
    this.removeAvatar.set(true);
    this.avatarError.set(null);
  }

  protected save(): void {
    this.commitSkillDraft();
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.notice.set(null);

    if (this.form.controls.skills.value.length === 0) {
      this.formError.set('Choose at least one skill for the host.');
      return;
    }

    if (this.form.invalid) {
      this.formError.set('Check the highlighted fields and try again.');
      return;
    }

    const values = this.form.getRawValue();
    const payload = {
      name: values.name.trim(),
      gender: values.gender,
      personality: values.personality.trim(),
      skills: values.skills,
      avatarDataUrl: this.avatarDataUrl() ?? undefined,
      avatarSource: this.avatarSource() ?? undefined,
      removeAvatar: this.removeAvatar() || undefined,
    };

    this.saving.set(true);

    const request = this.editingId()
      ? this.creator.updateHost(this.slug, this.editingId()!, payload)
      : this.creator.createHost(this.slug, payload);

    request.subscribe({
      next: (response) => {
        this.saving.set(false);
        this.notice.set(
          this.editing()
            ? `"${response.host.name}" was updated.`
            : `"${response.host.name}" is ready.`,
        );
        this.formOpen.set(false);
        this.editingId.set(null);
        this.resetAvatar();
        this.loadHosts();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(apiErrorMessage(error));
      },
    });
  }

  protected remove(host: HostPersona): void {
    const confirmed = window.confirm(`Delete "${host.name}"? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    if (this.voiceHost()?.id === host.id) {
      this.closeVoice();
    }

    this.deletingId.set(host.id);
    this.pageError.set(null);
    this.notice.set(null);

    this.creator.deleteHost(this.slug, host.id).subscribe({
      next: () => {
        this.hosts.update((hosts) => hosts.filter((item) => item.id !== host.id));
        this.deletingId.set(null);
        this.notice.set(`"${host.name}" was deleted.`);
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.pageError.set(apiErrorMessage(error));
      },
    });
  }

  protected openVoice(host: HostPersona): void {
    this.closeForm();
    this.notice.set(null);
    this.voiceError.set(null);
    this.voiceHost.set(host);
    this.selectedEmotion.set(host.voice?.emotion ?? 'calm');
    this.selectedVoiceId.set(host.voice?.id ?? null);
    this.stopPreview();

    if (this.voiceCatalog()) {
      this.ensureSelectedVoice();
    } else {
      this.loadVoiceCatalog();
    }

    setTimeout(() => {
      document.getElementById('voice-panel')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }

  protected closeVoice(): void {
    this.stopPreview();
    this.voiceHost.set(null);
    this.voiceError.set(null);
    this.previewLoading.set(false);
  }

  protected loadVoiceCatalog(): void {
    this.voiceCatalogLoading.set(true);
    this.voiceError.set(null);

    this.creator.getVoiceCatalog().subscribe({
      next: (catalog) => {
        this.voiceCatalog.set(catalog);
        this.voiceCatalogLoading.set(false);
        this.ensureSelectedVoice();
      },
      error: (error: unknown) => {
        this.voiceCatalogLoading.set(false);
        this.voiceError.set(apiErrorMessage(error));
      },
    });
  }

  protected selectVoice(voice: HostVoiceOption): void {
    this.selectedVoiceId.set(voice.id);
    this.stopPreview();
    this.voiceError.set(null);
  }

  protected selectEmotion(emotion: HostVoiceEmotion): void {
    this.selectedEmotion.set(emotion);
    this.stopPreview();
    this.voiceError.set(null);
  }

  protected togglePreview(): void {
    if (this.previewPlaying()) {
      this.stopPreview();
      return;
    }

    const host = this.voiceHost();
    const voice = this.selectedVoice();

    if (!host || !voice) {
      this.voiceError.set('Choose a voice first.');
      return;
    }

    this.stopPreview();
    this.previewLoading.set(true);
    this.voiceError.set(null);

    this.creator
      .previewHostVoice(this.slug, host.id, {
        voiceId: voice.id,
        emotion: this.selectedEmotion(),
      })
      .subscribe({
        next: (blob) => {
          this.previewUrl = URL.createObjectURL(blob);
          this.previewAudio.src = this.previewUrl;
          this.previewAudio.load();
          this.previewAudio
            .play()
            .catch(() => {
              this.voiceError.set('Your browser blocked playback. Press play again.');
              this.previewPlaying.set(false);
            })
            .finally(() => this.previewLoading.set(false));
        },
        error: (error: unknown) => {
          this.previewLoading.set(false);
          this.voiceError.set(apiErrorMessage(error));
        },
      });
  }

  protected assignSelectedVoice(): void {
    const host = this.voiceHost();
    const voice = this.selectedVoice();

    if (!host || !voice) {
      this.voiceError.set('Choose a voice first.');
      return;
    }

    this.voiceSaving.set(true);
    this.voiceError.set(null);

    this.creator
      .assignHostVoice(this.slug, host.id, {
        voiceId: voice.id,
        emotion: this.selectedEmotion(),
      })
      .subscribe({
        next: (response) => {
          this.voiceSaving.set(false);
          this.hosts.update((hosts) =>
            hosts.map((item) => (item.id === response.host.id ? response.host : item)),
          );
          this.notice.set(`${voice.name} is now the voice of ${response.host.name}.`);
          this.closeVoice();
        },
        error: (error: unknown) => {
          this.voiceSaving.set(false);
          this.voiceError.set(apiErrorMessage(error));
        },
      });
  }

  protected removeSelectedVoice(): void {
    const host = this.voiceHost();

    if (!host?.voice) {
      return;
    }

    this.voiceSaving.set(true);
    this.voiceError.set(null);

    this.creator.removeHostVoice(this.slug, host.id).subscribe({
      next: (response) => {
        this.voiceSaving.set(false);
        this.hosts.update((hosts) =>
          hosts.map((item) => (item.id === response.host.id ? response.host : item)),
        );
        this.notice.set(`The voice was removed from ${response.host.name}.`);
        this.closeVoice();
      },
      error: (error: unknown) => {
        this.voiceSaving.set(false);
        this.voiceError.set(apiErrorMessage(error));
      },
    });
  }

  protected emotionLabel(emotion: HostVoiceEmotion): string {
    return (
      this.emotionOptions().find((option) => option.id === emotion)?.label ??
      emotion.charAt(0).toUpperCase() + emotion.slice(1)
    );
  }

  private ensureSelectedVoice(): void {
    const voices = this.availableVoices();
    const current = this.selectedVoiceId();

    if (!current || !voices.some((voice) => voice.id === current)) {
      this.selectedVoiceId.set(voices[0]?.id ?? null);
    }
  }

  private stopPreview(): void {
    this.previewAudio.pause();
    this.previewAudio.removeAttribute('src');
    this.previewAudio.load();

    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }

    this.previewPlaying.set(false);
    this.previewLoading.set(false);
  }

  private addSkillValues(values: string[]): void {
    const current = [...this.form.controls.skills.value];
    const seen = new Set(current.map((skill) => skill.toLowerCase()));

    for (const value of values) {
      const trimmed = value.trim().replace(/\s+/g, ' ');
      const key = trimmed.toLowerCase();

      if (!trimmed || seen.has(key) || current.length >= 20) {
        continue;
      }

      current.push(trimmed.slice(0, 40));
      seen.add(key);
    }

    this.form.controls.skills.setValue(current);
    this.form.controls.skills.markAsDirty();
    this.formError.set(null);
  }

  private resetAvatar(): void {
    this.avatarPreview.set(null);
    this.avatarDataUrl.set(null);
    this.avatarSource.set(null);
    this.removeAvatar.set(false);
    this.avatarError.set(null);
  }

  private scrollToForm(): void {
    setTimeout(() => {
      document.getElementById('host-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 0);
  }
}
