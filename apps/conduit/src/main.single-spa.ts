import { bootstrapApplication, platformBrowser } from '@angular/platform-browser';
import { NavigationStart, Router } from '@angular/router';
import { provideSingleSpaPlatform, singleSpaAngular } from 'single-spa-angular';
import { AppComponent } from './app/app.component';
import { singleSpaAppConfig } from './app/app.config.single-spa';

// single-spa entry for Conduit. The whole app (including its internal router) is
// exposed as ONE single-spa application; the portfolio hub loads this ESM bundle
// and mounts it under the `/social` route prefix.
const lifecycles = singleSpaAngular({
  bootstrapFunction: () => {
    const platformRef = platformBrowser(provideSingleSpaPlatform());
    return bootstrapApplication(AppComponent, singleSpaAppConfig, { platformRef });
  },
  template: '<cdt-root />',
  // Zoneless: single-spa-angular skips zone-based router/location wiring.
  NgZone: 'noop',
  Router,
  NavigationStart,
});

// Conduit's global styles are emitted as a sibling `styles.css`. Since this
// bundle is loaded as a bare ESM module (no index.html), inject that stylesheet
// on mount — resolved relative to this module's own URL — and remove on unmount.
const STYLE_ELEMENT_ID = 'conduit-single-spa-styles';
const STYLE_HREF = new URL('styles.css', import.meta.url).href;

function injectStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const link = document.createElement('link');
  link.id = STYLE_ELEMENT_ID;
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

function removeStyles(): void {
  document.getElementById(STYLE_ELEMENT_ID)?.remove();
}

export const bootstrap = lifecycles.bootstrap;

export async function mount(props: unknown): Promise<unknown> {
  injectStyles();
  return (lifecycles.mount as (p: unknown) => Promise<unknown>)(props);
}

export async function unmount(props: unknown): Promise<unknown> {
  const result = await (lifecycles.unmount as (p: unknown) => Promise<unknown>)(props);
  removeStyles();
  return result;
}
