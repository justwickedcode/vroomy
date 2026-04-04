import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const SENTENCES = [
  'A man can be himself only so long as he is alone, and if he does not love solitude, he will not love freedom, for it is only when he is alone that he is really free.',
  'Talent hits a target no one else can hit. Genius hits a target no one else can see.',
  'Compassion is the basis of morality.',
  'The assumption that animals are without rights and the illusion that our treatment of them has no moral significance is a positively outrageous example of Western crudity and barbarity. Universal compassion is the only guarantee of morality.',
  'Every man takes the limits of his own field of vision for the limits of the world.',
  'We forfeit three fourths of ourselves in order to be like other people.',
  'After your death you will be what you were before your birth.',
  'Mostly it is loss which teaches us about the worth of things.',
  'The world is my representation.',
  'Life swings like a pendulum backward and forward between pain and boredom.',
  'Reading is merely a surrogate for thinking for yourself; it means letting someone else direct your thoughts.',
  'It is difficult to find happiness within oneself, but it is impossible to find it anywhere else.',
  'The doctor sees all the weakness of mankind; the lawyer all the wickedness, the theologian all the stupidity.',
  'Wealth is like sea water; the more we drink, the thirstier we become; and the same is true of fame.',
  'A sense of humor is the only divine quality of man.',
  'Nature shows that with the growth of intelligence comes increased capacity for pain, and it is only with the highest degree of intelligence that suffering reaches its supreme point.',
  'To live alone is the fate of all great souls.',
  'Every parting gives a foretaste of death, every reunion a hint of the resurrection.',
  'Will minus intellect constitutes vulgarity.',
  'Great men are like eagles, and build their nest on some lofty solitude.',
]

export const useTypingStore = defineStore('typing', () => {
  const target = ref<string>(pickRandom())
  const words = computed(() => target.value.split(' '))

  const completedWords = ref<('correct' | 'incorrect')[]>([])
  const currentWordIndex = ref(0)
  const currentInput = ref('')
  const hasError = ref(false)

  const currentWord = computed(() => words.value[currentWordIndex.value])
  const isDone = computed(() => currentWordIndex.value >= words.value.length)
  const progress = computed(() => Math.round((currentWordIndex.value / words.value.length) * 100))
  const errorCount = computed(() => completedWords.value.filter((w) => w === 'incorrect').length)
  const accuracy = computed(() => {
    const total = completedWords.value.length
    const correct = completedWords.value.filter((w) => w === 'correct').length
    return total > 0 ? Math.round((correct / total) * 100) : null
  })

  function pickRandom() {
    return SENTENCES[Math.floor(Math.random() * SENTENCES.length)]!
  }

  function onInput(val: string) {
    const isLastWord = currentWordIndex.value === words.value.length - 1
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
    target.value = pickRandom()
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
