<script setup lang="ts">
defineProps<{
  word: string
  status: 'correct' | 'incorrect'
}>()
</script>

<template>
  <span :class="status === 'correct' ? 'text-green-500' : 'text-red-500 line-through'">{{
    word
  }}</span>
</template>
