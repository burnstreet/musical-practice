// Runs the Gherkin blocks embedded in specs/*.spec.md as Vitest tests.
// Step files: `export default steps(({ Given, When, Then }) => { Given(/^...$/, (ctx, ...captures) => {}) })`
// Test stubs:  runSpec('vault', 'tests/steps/vault.steps.ts')
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type StepFn = (ctx: any, ...captures: string[]) => unknown
export type Registry = [RegExp, StepFn][]
type Define = (re: RegExp, fn: StepFn) => void

export interface Scenario {
  name: string
  steps: string[]
}
export interface Feature {
  name: string
  scenarios: Scenario[]
}

/** Collects step definitions. The keyword is irrelevant for matching. */
export function steps(define: (k: { Given: Define; When: Define; Then: Define }) => void): Registry {
  const registry: Registry = []
  const add: Define = (re, fn) => void registry.push([re, fn])
  define({ Given: add, When: add, Then: add })
  return registry
}

/** Runs step texts (keyword stripped) in order against one fresh ctx. */
export async function runSteps(registry: Registry, texts: string[], ctx: any = {}): Promise<void> {
  for (const text of texts) {
    const hit = registry.map(([re, fn]) => [text.match(re), fn] as const).find(([m]) => m)
    if (!hit) throw new Error(`Unmatched step: ${text}`)
    await hit[1](ctx, ...hit[0]!.slice(1))
  }
}

/** Features of every gherkin block whose nearest preceding [@test] link resolves to stepsPath. Paths relative to repo root. */
export function parseSpec(specPath: string, stepsPath: string): Feature[] {
  const specFile = resolve(ROOT, specPath)
  const target = resolve(ROOT, stepsPath)
  const md = readFileSync(specFile, 'utf8').replace(/\r\n/g, '\n')
  const features: Feature[] = []
  let link = ''
  for (const m of md.matchAll(/\[@test\]\s+([^`\s]+)|^```gherkin\n([\s\S]*?)^```/gm)) {
    if (m[1]) link = resolve(dirname(specFile), m[1])
    else if (link === target) features.push(...parseGherkin(m[2]))
  }
  return features
}

function parseGherkin(text: string): Feature[] {
  const features: Feature[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    let m: RegExpMatchArray | null
    if ((m = line.match(/^Feature:\s*(.*)$/))) features.push({ name: m[1], scenarios: [] })
    else if ((m = line.match(/^Scenario:\s*(.*)$/))) features.at(-1)!.scenarios.push({ name: m[1], steps: [] })
    else if ((m = line.match(/^(?:Given|When|Then|And|But|\*)\s+(.*)$/))) features.at(-1)!.scenarios.at(-1)!.steps.push(m[1])
  }
  return features
}

/** Feature -> describe, Scenario -> it. Step file is imported per scenario, so a missing file is a red test. */
export function runSpec(specName: string, stepsPath: string, specsDir = 'specs'): void {
  const features = parseSpec(`${specsDir}/${specName}.spec.md`, stepsPath)
  if (!features.length) throw new Error(`No gherkin blocks in ${specName} link to ${stepsPath}`)
  const load = async () => (await import(/* @vite-ignore */ pathToFileURL(resolve(ROOT, stepsPath)).href)).default as Registry
  for (const f of features)
    describe(f.name, () => {
      for (const s of f.scenarios) it(s.name, async () => runSteps(await load(), s.steps))
    })
}
