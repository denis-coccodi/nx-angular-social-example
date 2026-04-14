import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Article } from '@realworld/core/api-types';
import { setLoaded, setLoading, withCallState } from '@realworld/core/data-access';
import { concatMap, pipe, tap } from 'rxjs';
import {
  Articles,
  ArticlesListConfig,
  ArticlesListState,
  articlesListInitialState,
} from './models/articles-list.model';
import { ActionsService } from './services/actions.service';
import { ArticlesService } from './services/articles.service';

export const ArticlesListStore = signalStore(
  { providedIn: 'root' },
  withState<ArticlesListState>(articlesListInitialState),
  withComputed(({ listConfig, articles }) => ({
    totalPages: computed(() =>
      Array.from(
        new Array(Math.ceil(articles().articlesCount / (listConfig()?.filters?.limit ?? 1))),
        (_, index) => index + 1,
      ),
    ),
  })),
  withMethods((store, articlesService = inject(ArticlesService), actionsService = inject(ActionsService)) => ({
    loadArticles: rxMethod<ArticlesListConfig>(
      pipe(
        tap(() => setLoading('getArticles')),
        concatMap((listConfig) =>
          articlesService.query(listConfig).pipe(
            tapResponse({
              next: ({ articles, articlesCount }) => {
                patchState(store, {
                  articles: {
                    articlesCount: articlesCount,
                    entities: articles,
                  },
                  ...setLoaded('getArticles'),
                });
              },
              error: () => {
                patchState(store, { ...articlesListInitialState, ...setLoaded('getArticles') });
              },
            }),
          ),
        ),
      ),
    ),
    favouriteArticle: rxMethod<string>(
      pipe(
        concatMap((slug) =>
          actionsService.favorite(slug).pipe(
            tapResponse({
              next: ({ article }) => {
                patchState(store, {
                  articles: replaceArticle(store.articles(), article),
                });
              },
              error: () => {
                patchState(store, articlesListInitialState);
              },
            }),
          ),
        ),
      ),
    ),
    unFavouriteArticle: rxMethod<string>(
      pipe(
        concatMap((slug) =>
          actionsService.unfavorite(slug).pipe(
            tapResponse({
              next: ({ article }) => {
                patchState(store, {
                  articles: replaceArticle(store.articles(), article),
                });
              },
              error: () => {
                patchState(store, articlesListInitialState);
              },
            }),
          ),
        ),
      ),
    ),
    setListConfig: (listConfig: ArticlesListConfig) => {
      patchState(store, { listConfig });
    },
    setListPage: (page: number) => {
      const filters = {
        ...store.listConfig.filters(),
        offset: (store.listConfig().filters.limit ?? 10) * (page - 1),
      };
      const listConfig: ArticlesListConfig = {
        ...store.listConfig(),
        currentPage: page,
        filters,
      };
      patchState(store, { listConfig });
    },
  })),
  withCallState({ collection: 'getArticles' }),
);

function replaceArticle(articles: Articles, payload: Article): Articles {
  const articleIndex = articles.entities.findIndex((a) => a.slug === payload.slug);
  const entities = [
    ...articles.entities.slice(0, articleIndex),
    Object.assign({}, articles.entities[articleIndex], payload),
    ...articles.entities.slice(articleIndex + 1),
  ];
  return { ...articles, entities };
}
