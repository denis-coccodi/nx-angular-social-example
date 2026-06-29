import { APP_BASE_HREF } from '@angular/common';
import { ApplicationConfig } from '@angular/core';
import { provideSingleSpa } from 'single-spa-angular';
import { appConfig } from './app.config';

/**
 * Application config used when Conduit is mounted inside the single-spa portfolio
 * hub. It reuses the standalone {@link appConfig} and adds:
 *  - a `/social` base href so the hub can mount it on that route prefix and
 *    single-spa `activeWhen` matches by path, and
 *  - the single-spa-aware Location so the router and single-spa cooperate.
 */
export const singleSpaAppConfig: ApplicationConfig = {
  providers: [
    ...appConfig.providers,
    { provide: APP_BASE_HREF, useValue: '/social' },
    provideSingleSpa(),
  ],
};
