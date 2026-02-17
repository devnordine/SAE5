/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/AdminReviewScreen`; params?: Router.UnknownInputParams; } | { pathname: `/AdminScreen`; params?: Router.UnknownInputParams; } | { pathname: `/AuthScreen`; params?: Router.UnknownInputParams; } | { pathname: `/CameraScreen`; params?: Router.UnknownInputParams; } | { pathname: `/HistoryScreen`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/AdminReviewScreen`; params?: Router.UnknownOutputParams; } | { pathname: `/AdminScreen`; params?: Router.UnknownOutputParams; } | { pathname: `/AuthScreen`; params?: Router.UnknownOutputParams; } | { pathname: `/CameraScreen`; params?: Router.UnknownOutputParams; } | { pathname: `/HistoryScreen`; params?: Router.UnknownOutputParams; } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; };
      href: Router.RelativePathString | Router.ExternalPathString | `/AdminReviewScreen${`?${string}` | `#${string}` | ''}` | `/AdminScreen${`?${string}` | `#${string}` | ''}` | `/AuthScreen${`?${string}` | `#${string}` | ''}` | `/CameraScreen${`?${string}` | `#${string}` | ''}` | `/HistoryScreen${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/AdminReviewScreen`; params?: Router.UnknownInputParams; } | { pathname: `/AdminScreen`; params?: Router.UnknownInputParams; } | { pathname: `/AuthScreen`; params?: Router.UnknownInputParams; } | { pathname: `/CameraScreen`; params?: Router.UnknownInputParams; } | { pathname: `/HistoryScreen`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; };
    }
  }
}
