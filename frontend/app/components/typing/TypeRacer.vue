<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'
import WordPending from '~/components/typing/WordPending.vue'
import WordActive from '~/components/typing/WordActive.vue'
import WordCompleted from '~/components/typing/WordCompleted.vue'
import StatsBar from '~/components/typing/StatsBar.vue'

const store = useTypingStore()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="flex flex-col gap-4 w-full max-w-xl p-6 rounded-xl border border-border bg-surface">
      <h1 class="text-xl font-semibold text-accent">Type Racer</h1>

      <div
        class="font-mono text-sm leading-loose p-4 rounded-lg bg-background border border-border select-none whitespace-pre-wrap"
      >
        <span v-for="(word, wi) in store.words" :key="wi">
          <WordCompleted
            v-if="wi < store.currentWordIndex"
            :word
            :status="store.completedWords[wi]"
          />
          <WordActive
            v-else-if="wi === store.currentWordIndex"
            :word
            :input="store.currentInput"
            :has-error="store.hasError"
          />
          <WordPending v-else :word />
          <span v-if="wi < store.words.length - 1">{{ ' ' }}</span>
        </span>
      </div>

      <div class="h-1.5 rounded-full bg-background overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-150"
          :class="store.errorCount > 0 ? 'bg-yellow-500' : 'bg-green-500'"
          :style="{ width: store.progress + '%' }"
        />
      </div>

      <input
        v-if="!store.isDone"
        :value="store.currentInput"
        placeholder="type the highlighted word..."
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="w-full font-mono text-sm p-4 rounded-lg bg-background border text-text-primary placeholder-text-secondary outline-none transition-colors"
        :class="
          store.hasError
            ? 'border-red-500 bg-red-500/5'
            : 'border-border focus:border-[var(--color-accent)]'
        "
        @input="store.onInput(($event.target as HTMLInputElement).value)"
      />

      <StatsBar />

      <div
        v-if="store.isDone"
        class="flex items-center justify-between p-4 rounded-lg bg-green-500/10 border border-green-500/20"
      >
        <span class="text-sm font-medium text-green-500">
          done! {{ store.accuracy }}% accuracy, {{ store.errorCount }} error{{
            store.errorCount !== 1 ? 's' : ''
          }}.
        </span>
        <button
          class="text-sm px-3 py-1.5 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
          @click="store.reset"
        >
          reset
        </button>
      </div>
    </div>
  </div>
</template>
