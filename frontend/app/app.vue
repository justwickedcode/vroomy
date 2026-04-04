<script setup lang="ts">
import TypingRacer from '~/components/typing/TypingRacer.client.vue'
</script>
<template>
  <div>
    <ClientOnly>
      <TypingRacer />
    </ClientOnly>
  </div>
</template>
