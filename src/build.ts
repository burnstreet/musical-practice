export interface Build {
  version: string
  date: string // ISO time of the build
}

declare const __BUILD__: Build

/** This build, injected by vite.config.ts. */
export const build: Build = __BUILD__

const pad = (n: number) => String(n).padStart(2, '0')

/** `Version {version} · dd.mm HH:MM`, date in the device's local time. */
export function buildLabel(b: Build = build) {
  const d = new Date(b.date)
  return `Version ${b.version} · ${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
