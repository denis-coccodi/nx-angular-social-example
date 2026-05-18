import { DOCUMENT, effect, inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { SettingsState, settingsInitialState } from './models/settings.model';

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>(settingsInitialState),
  withMethods((store) => ({
    _darkModeStatusInit: () => {
      const darkMode: boolean = localStorage.getItem('darkMode') === 'true';
      patchState(store, { darkMode });
    },
    toggleDarkModeStatus: () => {
      const darkMode: boolean = localStorage.getItem('darkMode') === 'true';
      localStorage.setItem('darkMode', darkMode ? 'false' : 'true');
      patchState(store, { darkMode: !darkMode });
    },
  })),
  withHooks({
    onInit: (store) => {
      const document = inject(DOCUMENT);
      store._darkModeStatusInit();

      effect(() => {
        document.body.classList.toggle('dark', store.darkMode());
      });
    },
  }),
);
