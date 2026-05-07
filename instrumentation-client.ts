import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      'development',
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
