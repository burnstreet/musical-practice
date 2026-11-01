import { expect, test } from '@playwright/test'

// Synthetic song 90 (e2e/fixture.py): all notes A4, the fake microphone sings a steady 440 Hz.
test('unlock, pick role and song, sing with the microphone, see the reaction, pause, back to the song list', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByPlaceholder('Passwort eingeben').fill('e2e')
  await page.getByRole('button', { name: 'Entsperren' }).click()

  await expect(page).toHaveURL(/#\/songs$/)
  await page.getByRole('button', { name: 'Maria', exact: true }).click()
  await page.locator('button.row[data-song="90"]').click({ timeout: 30_000 }) // waits for the download
  await page.getByRole('button', { name: 'Üben starten' }).click()
  await expect(page).toHaveURL(/#\/practice\/90$/)
  await expect(page.getByRole('img', { name: 'Mikrofon aktiv' })).toBeVisible()
  // phone layout: the practice screen must not be wider than the viewport
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  // ... and fit the visible height, play row included, on common phone sizes (upright and sideways) and the desktop,
  // with and without sections and with and without the note banner (the screen is set to each case)
  const setCase = (sections: boolean, banner: boolean) =>
    page.evaluate(
      ([withSections, withBanner]) => {
        // the screen's own state, reached through the shadow roots
        const el = (document.querySelector('gu-app') as any).shadowRoot.querySelector('gu-practice')
        el.loaded.song.sections = withSections
          ? [
              { name: 'Strophe 1', start: 0, end: 8 },
              { name: 'Refrain', start: 8, end: 14 },
              { name: 'Strophe 2', start: 14, end: 20 },
            ]
          : []
        el.mic = !withBanner
        return el.updateComplete
      },
      [sections, banner],
    )
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [412, 915],
    [844, 390],
    [915, 412],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height })
    for (const [sections, banner] of [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ]) {
      await setCase(sections, banner)
      const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      expect(over, `${width}x${height} sections ${sections} banner ${banner}`).toBeLessThanOrEqual(0)
    }
  }
  await setCase(false, false)
  await page.setViewportSize({ width: 430, height: 900 })

  await page.getByRole('button', { name: 'Abspielen' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click() // headphone sheet
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  // the sung A4 against target A4 shows up as a live reading
  await expect(page.getByText(/Ziel A\b/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/\d+ Cent · sauber/)).toBeVisible({ timeout: 15_000 })

  // pause just pauses; the results come on request
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Abspielen' })).toBeVisible()
  await expect(page).toHaveURL(/#\/practice\/90$/)
  await page.getByRole('button', { name: 'Auswertung' }).click()
  await expect(page).toHaveURL(/#\/results\/90$/)
  await expect(page.getByText('Töne getroffen')).toBeVisible()
  // the pass was stored as today's sum
  await page.getByRole('button', { name: 'Verlauf' }).click()
  await expect(page.getByText('an 1 von 7 Tagen geübt')).toBeVisible()
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/verlauf.png`, fullPage: true })
  await page.getByRole('button', { name: 'Zurück', exact: true }).click()
  await page.getByRole('button', { name: 'Zurück zum Üben' }).click()
  await expect(page).toHaveURL(/#\/practice\/90$/)

  await page.getByRole('button', { name: 'Zurück zur Auswahl' }).click()
  await expect(page).toHaveURL(/#\/songs$/)
  await expect(page.getByRole('heading', { name: 'Lied zum Üben' })).toBeVisible()
  expect(errors).toEqual([])
})
