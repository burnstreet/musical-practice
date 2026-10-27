import { expect, test } from '@playwright/test'

// Synthetic song 90 (e2e/fixture.py): all notes A4, the fake microphone sings a steady 440 Hz.
test('unlock, pick role and song, sing with the microphone, see the reaction, stop, back to start', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Abspielen' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click() // headphone sheet
  await expect(page.getByRole('button', { name: 'Pause und Auswertung' })).toBeVisible()

  // the sung A4 against target A4 shows up as a live reading
  await expect(page.getByText(/Ziel A4/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/\d+ Cent · sauber/)).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Pause und Auswertung' }).click()
  await expect(page).toHaveURL(/#\/results\/90$/)
  await expect(page.getByRole('img', { name: /Prozent Treffsicherheit/ })).toBeVisible()

  await page.getByRole('button', { name: 'Schließen' }).click()
  await expect(page).toHaveURL(/#\/songs$/)
  await expect(page.getByRole('heading', { name: 'Lied zum Üben' })).toBeVisible()
  expect(errors).toEqual([])
})
