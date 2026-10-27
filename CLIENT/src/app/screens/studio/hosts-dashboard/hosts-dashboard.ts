import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  HOST_SKILLS,
  HOST_SKILL_DESCRIPTIONS,
  HostGender,
  HostPersona,
  HostSkill,
} from '../../../core/models/host.models';
import { RadioStation } from '../../../core/models/station.models';
import { apiErrorMessage } from '../../../core/services/auth.service';
import { CreatorService } from '../../../core/services/creator.service';
import {
  DEFAULT_STATION_ARTWORK,
  StationService,
} from '../../../core/services/station.service';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

@Component({
  selector: 'app-hosts-dashboard',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './hosts-dashboard.html',
  styleUrl: './hosts-dashboard.scss',
})
export class HostsDashboard implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly creator = inject(CreatorService);
  private readonly stations = inject(StationService);

  private slug = '';

  protected readonly skillOptions = HOST_SKILLS;
  protected readonly skillDescriptions = HOST_SKILL_DESCRIPTIONS;
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

  protected readonly editing = computed(() => this.editingId() !== null);
  protected readonly formTitle = computed(() =>
    this.editing() ? 'Edit host persona' : 'Create a host persona',
  );

  protected readonly form = this.fb.nonNullable.group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    ],
    gender: this.fb.nonNullable.control<HostGender>('female'),
    personality: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(4000)],
    ],
    skills: this.fb.nonNullable.control<HostSkill[]>([]),
  });

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
    this.form.reset({ name: '', gender: 'female', personality: '', skills: [] });
    this.editingId.set(null);
    this.formError.set(null);
    this.notice.set(null);
    this.resetAvatar();
    this.formOpen.set(true);
    this.scrollToForm();
  }

  protected openEdit(host: HostPersona): void {
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
    this.resetAvatar();
  }

  protected setGender(gender: HostGender): void {
    this.form.controls.gender.setValue(gender);
    this.form.controls.gender.markAsDirty();
  }

  protected isSkillSelected(skill: HostSkill): boolean {
    return this.form.controls.skills.value.includes(skill);
  }

  protected toggleSkill(skill: HostSkill): void {
    const current = new Set(this.form.controls.skills.value);

    if (current.has(skill)) {
      current.delete(skill);
    } else {
      current.add(skill);
    }

    this.form.controls.skills.setValue(Array.from(current));
    this.form.controls.skills.markAsDirty();
    this.formError.set(null);
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
    const confirmed = window.confirm(
      `Delete "${host.name}"? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    this.deletingId.set(host.id);
    this.pageError.set(null);
    this.notice.set(null);

    this.creator.deleteHost(this.slug, host.id).subscribe({
      next: () => {
        this.hosts.update((hosts) =>
          hosts.filter((item) => item.id !== host.id),
        );
        this.deletingId.set(null);
        this.notice.set(`"${host.name}" was deleted.`);
      },
      error: (error: unknown) => {
        this.deletingId.set(null);
        this.pageError.set(apiErrorMessage(error));
      },
    });
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
