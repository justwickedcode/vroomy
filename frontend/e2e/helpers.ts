/// <reference types="node" />
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export const WS_URL = process.env.E2E_WS_URL ?? 'ws://localhost:8081'

// The passage, once the race is live: the words stop being blurred when typing unlocks.
export async function livePassage(page: Page): Promise<string> {
  const words = page.locator(
    '.race-words-inner:not(.race-words-inner--blurred)',
  )
  await expect(words).toBeVisible({ timeout: 60_000 })
  const text = await words.innerText()
  // \s covers the non-breaking spaces between words too.
  return text.replace(/\s+/g, ' ').trim()
}

// Types like a quick person (~120 WPM): fast enough to win against the slow bots, slow enough
// that the anti-cheat lets it through.
export async function typeLikeAPerson(page: Page, text: string) {
  await page
    .getByLabel('Type the passage')
    .pressSequentially(text, { delay: 100 })
}

// Types like a script: the whole passage at once.
export async function typeLikeAScript(page: Page, text: string) {
  await page
    .getByLabel('Type the passage')
    .pressSequentially(text, { delay: 0 })
}

// The place on the finish screen ("1st", "2nd"...).
export function placeText(page: Page) {
  return page.locator('.race-results').getByText(/^\d+(st|nd|rd|th)$/)
}

// A scripted opponent in a multiplayer room: joins, and then just sits at the line (it never
// types), so it never wins and the race starts as soon as it's in.
export class ScriptedRacer {
  private ws: WebSocket
  readonly messages: Array<{ type: string; [key: string]: unknown }> = []

  constructor(path: string, name: string) {
    const url = new URL(path, WS_URL)
    url.searchParams.set('name', name)
    url.searchParams.set('racer', `e2e-${name}-${Date.now()}`)
    this.ws = new WebSocket(url)
    this.ws.onmessage = (event) => {
      this.messages.push(JSON.parse(String(event.data)))
    }
  }

  // Resolves with the first message of this type (already received, or the next one).
  async waitFor(type: string, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const found = this.messages.find((m) => m.type === type)
      if (found) return found
      if (Date.now() > deadline) throw new Error(`no ${type} message`)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  close() {
    this.ws.close()
  }
}
