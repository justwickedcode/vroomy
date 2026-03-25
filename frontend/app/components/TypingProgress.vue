<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const TARGET =
  'the quick brown fox jumps over the lazy dog and all the while the world keeps spinning round and round without pause'
const words = TARGET.split(' ')

const completedWords = ref<('correct' | 'incorrect')[]>([])
const currentWordIndex = ref(0)
const currentInput = ref('')
const hasError = ref(false)

const currentWord = computed(() => words[currentWordIndex.value])
const isDone = computed(() => currentWordIndex.value >= words.length)

const progress = computed(() => Math.round((currentWordIndex.value / words.length) * 100))

const errors = computed(() => completedWords.value.filter((w) => w === 'incorrect').length)
const accuracy = computed(() => {
  const total = completedWords.value.length
  const correct = completedWords.value.filter((w) => w === 'correct').length
  return total > 0 ? Math.round((correct / total) * 100) : null
})

watch(currentInput, (val) => {
  if (val.endsWith(' ')) {
    const typed = val.trim()
    if (typed === currentWord.value) {
      completedWords.value.push('correct')
    } else {
      completedWords.value.push('incorrect')
    }
    currentWordIndex.value++
    currentInput.value = ''
    hasError.value = false
    return
  }
  hasError.value = !currentWord.value.startsWith(val)
})

function reset() {
  completedWords.value = []
  currentWordIndex.value = 0
  currentInput.value = ''
  hasError.value = false
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="flex flex-col gap-4 w-full max-w-xl p-6 rounded-xl border border-border bg-surface">
      <h1 class="text-xl font-semibold text-accent">Typing Progress</h1>

      <div
        class="font-mono text-sm leading-loose p-4 rounded-lg bg-background border border-border select-none"
      >
        <span v-for="(word, wi) in words" :key="wi">
          <template v-if="wi < currentWordIndex">
            <span
              :class="
                completedWords[wi] === 'correct' ? 'text-green-500' : 'text-red-500 line-through'
              "
              >{{ word }}</span
            >
          </template>

          <template v-else-if="wi === currentWordIndex">
            <span
              v-for="(char, ci) in word.split('')"
              :key="ci"
              :class="{
                'text-green-500': ci < currentInput.length && !hasError,
                'text-red-500': ci < currentInput.length && hasError,
                'outline outline-2 outline-offset-1 rounded-sm': ci === currentInput.length,
                'outline-accent': ci === currentInput.length && !hasError,
                'outline-red-500': ci === currentInput.length && hasError,
                'text-text-secondary': ci >= currentInput.length,
              }"
              >{{ char }}</span
            >
          </template>

          <template v-else>
            <span class="text-text-secondary opacity-40">{{ word }}</span>
          </template>

          <span v-if="wi < words.length - 1" class="text-text-secondary opacity-40">&nbsp;</span>
        </span>
      </div>

      <div class="h-1.5 rounded-full bg-background overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-150"
          :class="errors > 0 ? 'bg-yellow-500' : 'bg-green-500'"
          :style="{ width: progress + '%' }"
        />
      </div>

      <input
        v-if="!isDone"
        v-model="currentInput"
        placeholder="type the highlighted word..."
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="w-full font-mono text-sm p-4 rounded-lg bg-background border text-text-primary placeholder-text-secondary outline-none transition-colors"
        :class="
          hasError
            ? 'border-red-500 bg-red-500/5'
            : 'border-border focus:border-[var(--color-accent)]'
        "
      />

      <div class="grid grid-cols-4 gap-2">
        <div class="flex flex-col gap-1 bg-background rounded-lg p-3">
          <span class="text-[11px] uppercase tracking-widest text-text-secondary">progress</span>
          <span class="font-mono font-medium text-text-primary">{{ progress }}%</span>
        </div>
        <div class="flex flex-col gap-1 bg-background rounded-lg p-3">
          <span class="text-[11px] uppercase tracking-widest text-text-secondary">words</span>
          <span class="font-mono font-medium text-green-500">{{ currentWordIndex }}</span>
        </div>
        <div class="flex flex-col gap-1 bg-background rounded-lg p-3">
          <span class="text-[11px] uppercase tracking-widest text-text-secondary">errors</span>
          <span class="font-mono font-medium text-red-500">{{ errors }}</span>
        </div>
        <div class="flex flex-col gap-1 bg-background rounded-lg p-3">
          <span class="text-[11px] uppercase tracking-widest text-text-secondary">accuracy</span>
          <span class="font-mono font-medium text-text-primary">{{
            accuracy !== null ? accuracy + '%' : '—'
          }}</span>
        </div>
      </div>

      <div
        v-if="isDone"
        class="flex items-center justify-between p-4 rounded-lg bg-green-500/10 border border-green-500/20"
      >
        <span class="text-sm font-medium text-green-500"
          >done! {{ accuracy }}% accuracy, {{ errors }} error{{ errors !== 1 ? 's' : '' }}.</span
        >
        <button
          @click="reset"
          class="text-sm px-3 py-1.5 rounded-lg border border-border text-text-primary hover:bg-background transition-colors"
        >
          reset
        </button>
      </div>
    </div>
  </div>
</template>
