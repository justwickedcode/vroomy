import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const TARGET =
  'A man can be himself only so long as he is alone, and if he does not love solitude, he will not love freedom, for it is only when he is alone that he is really free.'

export const useTypingStore = defineStore('typing', () => {
  const words = TARGET.split(' ')

  const completedWords = ref<('correct' | 'incorrect')[]>([])
  const currentWordIndex = ref(0)
  const currentInput = ref('')
  const hasError = ref(false)

  const currentWord = computed(() => words[currentWordIndex.value])
  const isDone = computed(() => currentWordIndex.value >= words.length)
  const progress = computed(() => Math.round((currentWordIndex.value / words.length) * 100))
  const errorCount = computed(() => completedWords.value.filter((w) => w === 'incorrect').length)
  const accuracy = computed(() => {
    const total = completedWords.value.length
    const correct = completedWords.value.filter((w) => w === 'correct').length
    return total > 0 ? Math.round((correct / total) * 100) : null
  })

  function onInput(val: string) {
    const isLastWord = currentWordIndex.value === words.length - 1
    const isSpaceSubmit = val.endsWith(' ')
    const isLastWordComplete = isLastWord && val === currentWord.value

    if (isSpaceSubmit || isLastWordComplete) {
      const typed = val.trim()
      completedWords.value.push(typed === currentWord.value ? 'correct' : 'incorrect')
      currentWordIndex.value++
      currentInput.value = ''
      hasError.value = false
      return
    }

    hasError.value = val.length > 0 && !currentWord.value?.startsWith(val)
    currentInput.value = val
  }

  function reset() {
    completedWords.value = []
    currentWordIndex.value = 0
    currentInput.value = ''
    hasError.value = false
  }

  return {
    words,
    completedWords,
    currentWordIndex,
    currentInput,
    hasError,
    currentWord,
    isDone,
    progress,
    errorCount,
    accuracy,
    onInput,
    reset,
  }
})
