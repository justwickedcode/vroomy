<script setup lang="ts">
import { useTypingStore } from '~/stores/typing'

const store = useTypingStore()
</script>

<template>
  <div class="grid grid-cols-4 gap-2">
    <div
      v-for="stat in [
        { label: 'progress', value: store.progress + '%' },
        { label: 'words', value: store.currentWordIndex, class: 'text-green-500' },
        { label: 'errors', value: store.errorCount, class: 'text-red-500' },
        { label: 'accuracy', value: store.accuracy !== null ? store.accuracy + '%' : '—' },
      ]"
      :key="stat.label"
      class="flex flex-col gap-1 bg-background rounded-lg p-3"
    >
      <span class="text-[11px] uppercase tracking-widest text-text-secondary">{{
        stat.label
      }}</span>
      <span class="font-mono font-medium text-text-primary" :class="stat.class">{{
        stat.value
      }}</span>
    </div>
  </div>
</template>
