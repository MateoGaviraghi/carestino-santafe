import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // typedRoutes intentionally disabled: we build navigation URLs from
  // dynamic search params (e.g. SalesFiltersBar router.replace(...)), and
  // typedRoutes rejects any string that isn't a literal Route. The benefit
  // (catching typos in static link hrefs) doesn't justify the friction at
  // this codebase size.
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
