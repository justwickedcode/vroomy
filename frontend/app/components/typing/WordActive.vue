<script setup lang="ts">
defineProps<{
  word: string
  input: string
  hasError: boolean
}>()
</script>

<template>
  <span
    v-for="(char, ci) in word.split('')"
    :key="ci"
    :class="{
      'text-green-500': ci < input.length && !hasError,
      'text-red-500': ci < input.length && hasError,
      'text-text-secondary': ci >= input.length,
    }"
    >{{ char }}</span
  >
</template>
