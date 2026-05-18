import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '@realworld/auth/data-access';
import { InputErrorsComponent, ListErrorsComponent } from '@realworld/core/forms';
import { SettingsStore } from '@realworld/settings/data-access';

@Component({
  selector: 'cdt-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
  imports: [ListErrorsComponent, ReactiveFormsModule, InputErrorsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly authStore = inject(AuthStore);
  private readonly settingsStore = inject(SettingsStore);
  private readonly fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    image: [''],
    username: ['', [Validators.required]],
    bio: [''],
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  darkMode = this.settingsStore.darkMode();

  readonly setUserDataToForm = effect(() => {
    const userLoaded = this.authStore.getUserLoaded();
    if (userLoaded) {
      this.form.patchValue(this.authStore.user());
    }
  });

  toggleDarkMode() {
    this.settingsStore.toggleDarkModeStatus();
  }

  onSubmit() {
    this.authStore.updateUser(this.form.getRawValue());
  }

  logout() {
    this.authStore.logout();
  }
}
