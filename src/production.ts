import type { Production } from './production-config'

declare const __PRODUCTION__: Production

/** The production this build is for, injected by vite.config.ts from $MP_PRODUCTION/production.json. */
export const production: Production = __PRODUCTION__
