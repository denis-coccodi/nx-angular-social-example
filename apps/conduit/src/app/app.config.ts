import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { AuthGuard } from '@realworld/auth/data-access';
import { errorHandlingInterceptor } from '@realworld/core/error-handler';
import { API_URL } from '@realworld/core/http-client';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(
      [
        {
          path: '',
          redirectTo: 'home',
          pathMatch: 'full',
        },
        {
          path: 'home',
          canActivate: [AuthGuard],
          loadComponent: () => import('@realworld/home/feature-home').then((m) => m.HomeComponent),
        },
        {
          path: 'login',
          loadComponent: () => import('@realworld/auth/feature-auth').then((m) => m.LoginComponent),
        },
        {
          path: 'register',
          loadComponent: () => import('@realworld/auth/feature-auth').then((m) => m.RegisterComponent),
        },
        {
          path: 'article',
          loadChildren: () => import('@realworld/articles/article').then((m) => m.ARTICLE_ROUTES),
        },
        {
          path: 'settings',
          loadComponent: () =>
            import('@realworld/settings/feature-settings').then((settings) => settings.SettingsComponent),
          canActivate: [AuthGuard],
        },
        {
          path: 'editor',
          loadChildren: () => import('@realworld/articles/article-edit').then((article) => article.ARTICLE_EDIT_ROUTES),
          canActivate: [AuthGuard],
        },
        {
          path: 'profile',
          canActivate: [AuthGuard],
          loadChildren: () => import('@realworld/profile/feature-profile').then((profile) => profile.PROFILE_ROUTES),
        },
      ],
      withViewTransitions(),
      withComponentInputBinding(),
    ),
    provideHttpClient(withInterceptors([errorHandlingInterceptor])),
    { provide: API_URL, useValue: environment.api_url },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
