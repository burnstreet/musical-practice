import 'fake-indexeddb/auto'
import { expect } from 'vitest'
import { steps } from '../gherkin'
import { build, setup } from './library.steps'

const withScript = async (ctx: any, lines: string[]) => {
  ctx.server = await build(['01'], {}, lines)
  setup(ctx)
}

export default steps(({ Given, When, Then }) => {
  Given(/^an unlocked vault and a manifest with song "01" and a script with 2 audio files$/, (ctx) => withScript(ctx, ['aaaa', 'bbbb']))
  Given(/^an unlocked vault and a library without script$/, async (ctx) => {
    ctx.server = await build(['01'])
    setup(ctx)
  })
  Given(/^a completed sync with a script whose line "(.*)" has audio$/, async (ctx, id) => {
    await withScript(ctx, [id, 'bbbb'])
    await ctx.lib.sync()
  })

  When(/^I sync$/, (ctx) => ctx.lib.sync())
  When(/^I get the script and ask for the audio of "(.*)"$/, async (ctx, id) => {
    ctx.blob = await (await ctx.lib.getScript()).audio(id)
  })

  Then(/^the script file and its audio are fetched after the files of "01"$/, (ctx) => {
    const { fetched, script, ids } = ctx.server
    expect(fetched.slice(-3)).toEqual([script.file, ...script.audio])
    expect(fetched.indexOf(ids['01'].backing)).toBeLessThan(fetched.indexOf(script.file))
  })
  Then(/^the last progress event has scriptReady true$/, (ctx) => {
    expect(ctx.events.at(-1).scriptReady).toBe(true)
  })
  Then(/^hasScript is false and getScript throws$/, async (ctx) => {
    expect(ctx.lib.hasScript()).toBe(false)
    expect(ctx.lib.scriptReady()).toBe(false)
    await expect(ctx.lib.getScript()).rejects.toThrow()
  })
  Then(/^I receive a Blob of type audio\/mpeg$/, (ctx) => {
    expect(ctx.blob).toBeInstanceOf(Blob)
    expect(ctx.blob.type).toBe('audio/mpeg')
  })
})
