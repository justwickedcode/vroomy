<script setup lang="ts">
defineProps<{
  word: string
}>()
</script>

<template>
  <span class="text-text-secondary opacity-40">{{ word }}</span>
</template>
