import { expect, test } from '@playwright/test'
import { livePassage, placeText, typeLikeAPerson } from './helpers'

test('a solo race against slow bots finishes in first', async ({ page }) => {
  await page.goto('/race/solo/chill?abilities=off')
  const passage = await livePassage(page)
  await typeLikeAPerson(page, passage)
  await expect(placeText(page)).toHaveText('1st')
})
