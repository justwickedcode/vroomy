import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  ScriptedRacer,
  livePassage,
  placeText,
  typeLikeAPerson,
} from './helpers'

// Quick match: the page waits in the lobby, a scripted racer joins, the race starts on its own.
async function quickMatchWithARacer(page: Page) {
  await page.goto('/race/multiplayer?mode=classic')
  await expect(page.getByText('Finding racers')).toBeVisible()
  const rival = new ScriptedRacer('/ws/race?mode=classic', 'Rival')
  await rival.waitFor('race_start')
  return rival
}

test('quick match: a race against another player', async ({ page }) => {
  const rival = await quickMatchWithARacer(page)
  try {
    const passage = await livePassage(page)
    await typeLikeAPerson(page, passage)
    await expect(placeText(page)).toHaveText('1st')
    const finished = await rival.waitFor('player_finished')
    expect(finished.rank).toBe(1)
  } finally {
    rival.close()
  }
})

test('quick match: a reload mid-race lands back in the same race', async ({
  page,
}) => {
  const rival = await quickMatchWithARacer(page)
  try {
    const passage = await livePassage(page)
    const words = passage.split(' ')
    const firstWords = words.slice(0, 4).join(' ') + ' '
    await typeLikeAPerson(page, firstWords)
    await page.reload()

    // Back in, with those words already typed.
    await expect(page.locator('.race-word-correct').first()).toBeVisible()
    await rival.waitFor('player_back')
    await typeLikeAPerson(page, passage.slice(firstWords.length))
    await expect(placeText(page)).toHaveText('1st')
  } finally {
    rival.close()
  }
})

test('friends: the host starts a room a friend joined by code', async ({
  page,
  browser,
}) => {
  await page.goto('/race/new?mode=classic')
  const codeBox = page.locator('.play-input')
  await expect(codeBox).toHaveText(/^[A-Z0-9]+$/)
  const code = (await codeBox.innerText()).trim()

  const friendContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const friend = await friendContext.newPage()
  try {
    await friend.goto(`/race/${code}`)
    await expect(page.getByText('start when ready')).toBeVisible()
    await page
      .locator('.race-results')
      .getByRole('button', { name: 'Start now' })
      .click()

    const passage = await livePassage(page)
    expect(await livePassage(friend)).toBe(passage)
    await typeLikeAPerson(page, passage)
    await expect(placeText(page)).toHaveText('1st')
  } finally {
    await friendContext.close()
  }
})

test('quick match: alone for 30s, ghosts come out to race', async ({
  page,
}) => {
  await page.goto('/race/multiplayer?mode=classic')
  await expect(page.getByText('Finding racers')).toBeVisible()
  await expect(
    page.locator('.race-name-tag', { hasText: /ghost|Pace car/i }).first(),
  ).toBeVisible({ timeout: 40_000 })
  await livePassage(page)
})
