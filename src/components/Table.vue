<template>
  <div class="room">
    <div class="table">
      <template v-for="(player, k) in players" :key="player">
        <seat
          v-if="k < playerCount"
          :player="player"
          :style="getPlayerPosition(k)"
          class="player-seat"
          @player-hover="onPlayerHover"
          @player-leave="onPlayerLeave"
          @hi-hover="onHiHover"
          @hi-leave="onHiLeave"
          @lo-hover="onLoHover"
          @lo-leave="onLoLeave"
        />
      </template>
<!--      <span v-html="cardDeck" />-->
      <div class="board">
        <div v-if="boardCards.length === 0" class="board-placeholder">
          {{ getBoardText() }}
        </div>
        <PokerCard
          v-for="(card, key) in boardCards"
          :key="key"
          :card="card"
          :show="true"
          :isInBestHand="isBoardCardInBestHand(card)"
          :isInLowHand="isBoardCardInLowHand(card)"
          :isInBothHands="isBoardCardInBothHands(card)"
          :isBoardCard="true"
        />
      </div>
      <div class="deck-info">
        Колода: {{ cardDeck.length }} карт
      </div>
    </div>
    <div class="interface">
      <div class="settings">
        <label for="cardCount">Карт:</label>
        <select id="cardCount" v-model.number="cardCount">
          <option value="2">2 (Hold'em)</option>
          <option value="4">4 (Omaha)</option>
          <option value="6">6</option>
          <option value="7">7</option>
        </select>
      </div>
      <div class="settings">
        <label for="playerCount">Игроков:</label>
        <select id="playerCount" v-model.number="playerCount">
          <option v-for="count in availablePlayerCounts" :key="count" :value="count">
            {{ count }}
          </option>
        </select>
      </div>
      <div class="settings">
        <label for="lowRules">Hi-Lo:</label>
        <input type="checkbox" id="lowRules" v-model="lowRules" :disabled="cardCount == 2">
      </div>
      <button @click="next" style="font-size: 20px">next</button>
      <button @click="calc" style="font-size: 20px">calc</button>
    </div>
    <div class="results" v-if="hasResults">
      <h3>Результаты раздачи</h3>
      <div v-for="(player, index) in players" :key="index" class="player-result" :class="{ 'winner-result': player.isWinner }">
        <div v-if="player.combinations && player.combinations.hi">
          <strong>{{ player.name }}:</strong> {{ player.combinations.hi }}
          <span v-if="player.isWinner" class="result-winner-badge">🏆</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import cardDeck from "../config/cardDeck";
import gcd from "../helpers/gcd";
import shuffle from "../helpers/shuffle";
import Seat from "./Seat";
import PokerCard from "./PokerCard";
import { determineWinner, translateHandDescription } from "@/helpers/pokerEvaluator";

export default {
  name: 'Table',
  components: {PokerCard, Seat},
  props: {
    placeCount: {
      default: 8
    },
    players: {
      default() {
        return []
      }
    },
    msg: String
  },

  data() {
    return {
      cardDeck: cardDeck,
      boardCards: [],
      /** @var ''|'preflop'|'flop'|'tern'|'river'|'end' */
      step: '',
      hoveredPlayer: null,
      cardCount: 4,
      playerCount: 8,
      lowRules: false,
      showHiCards: false,
      showLoCards: false
    }
  },
  computed: {
    // Вычисляем максимальное количество игроков в зависимости от карт
    maxPlayers() {
      // В колоде 52 карты
      // 5 карт на стол + N игроков × (карт в руке)
      // Решаем: 52 = 5 + N × cardCount
      // N = (52 - 5) / cardCount = 47 / cardCount
      const max = Math.floor((52 - 5) / this.cardCount)
      return Math.min(max, 8) // Ограничиваем максимум 8 игроками
    },
    // Доступные количества игроков для выбора
    availablePlayerCounts() {
      const counts = []
      for (let i = 2; i <= this.maxPlayers; i++) {
        counts.push(i)
      }
      return counts
    },
    hasResults() {
      return Array.isArray(this.players) && this.players.some(player => player.combinations && player.combinations.hi)
    }
  },
  watch: {
    cardCount(newVal, oldVal) {
      // Если значение действительно изменилось
      if (newVal !== oldVal) {
        // Сначала уменьшаем количество игроков если нужно
        if (this.playerCount > this.maxPlayers) {
          this.playerCount = this.maxPlayers
        }

        // Ждем немного чтобы Vue успел обновить состояние
        setTimeout(() => {
          // Потом сбрасываем всё
          this.resetGame()

          // Ждем завершения реактивности и затем начинаем новую игру
          this.$nextTick(() => {
            this.start()
          })
        }, 100)
      }
    },
    playerCount(newVal, oldVal) {
      // Если значение действительно изменилось
      if (newVal !== oldVal) {
        // Сначала сбрасываем всё
        this.resetGame()

        // Ждем завершения реактивности и затем начинаем новую игру
        this.$nextTick(() => {
          this.start()
        })
      }
    },
    lowRules(newVal, oldVal) {
      // Если значение действительно изменилось
      if (newVal !== oldVal) {
        // Сначала сбрасываем всё
        this.resetGame()

        // Ждем завершения реактивности и затем начинаем новую игру
        this.$nextTick(() => {
          this.start()
        })
      }
    }
  },
  methods: {
    getPlayerPosition(index) {
      // Равномерно распределяем игроков вокруг стола
      const totalPlayers = this.playerCount
      const angle = (360 / totalPlayers) * index - 90 // -90 чтобы первый игрок был снизу
      
      // Конвертируем полярные координаты в декартовы
      // Радиус зависит от количества игроков для лучшего распределения
      let radius
      if (totalPlayers <= 3) {
        radius = 35 // Для малого количества игроков
      } else if (totalPlayers <= 6) {
        radius = 38 // Для среднего количества
      } else {
        radius = 42 // Для большого количества
      }
      
      const centerX = 50
      const centerY = 50
      
      const x = centerX + radius * Math.cos(angle * Math.PI / 180)
      const y = centerY + radius * Math.sin(angle * Math.PI / 180)
      
      return {
        left: `${x}%`,
        top: `${y}%`
      }
    },

    getSeatPost(i) {
      const length = this.placeCount
      const gcdValue = gcd(i, length)
      return `${i/gcdValue}of${length/gcdValue}`
    },

    shuffle() {
      this.cardDeck = shuffle(this.cardDeck)
    },

    next() {
      console.log('next')
      if (this.step === '') {
        return this.start()
      }
      if (this.step === 'preflop') {
        return this.openFlop()
      }
      if (this.step === 'flop') {
        return this.openTurn()
      }
      if (this.step === 'turn') {
        return this.openRiver()
      }
      if (this.step === 'river') {
        return this.endGame()
      }
    },

    resetGame() {
      this.step = ''
      this.boardCards = []
      this.hoveredPlayer = null
      this.showHiCards = false
      this.showLoCards = false
      // Сбрасываем колоду к исходному состоянию с глубокой копией
      this.cardDeck = [...cardDeck]
      if (Array.isArray(this.players)) {
        this.players.forEach(player => {
          player.cards = []
          player.combinations = { hi: null, lo: null }
          player.bestHand = []
          player.isWinner = false
          player.isLowWinner = false
          player.handDescription = null
          player.handRank = null
          player.handScore = null
          player.lowHand = null
          player.lowDescription = null
          player.lowScore = null
        })
        // Создаем новый массив чтобы гарантированно сбросить реактивность
        const newPlayers = this.players.map(player => ({
          ...player,
          cards: [],
          combinations: { hi: null, lo: null },
          bestHand: [],
          isWinner: false,
          isLowWinner: false,
          handDescription: null,
          handRank: null,
          handScore: null,
          lowHand: null,
          lowDescription: null,
          lowScore: null
        }))
        this.updatePlayers(newPlayers)
      }
    },

    start() {
      this.shuffle()
      this.showHiCards = false
      this.showLoCards = false
      if (Array.isArray(this.players)) {
        // Раздаем карты только активным игрокам
        this.players.forEach((player, index) => {
          if (index < this.playerCount) {
            player.cards = [] // Очищаем старые карты
            player.combinations = { hi: null, lo: null }
            player.bestHand = []
            player.isWinner = false
            player.isLowWinner = false
            player.lowHand = null
            player.lowDescription = null
            player.lowScore = null

            for (let i = 0; i < this.cardCount; i++) {
              player.cards.push(this.cardDeck.pop())
            }
          } else {
            // Очищаем неактивных игроков
            player.cards = []
            player.combinations = { hi: null, lo: null }
            player.bestHand = []
            player.isWinner = false
            player.isLowWinner = false
            player.lowHand = null
            player.lowDescription = null
            player.lowScore = null
          }
        })
        this.updatePlayers([...this.players])
      }
      this.step = 'preflop'
    },

    openFlop() {
      for (let i = 0; i < 3; i++) {
        this.boardCards.push(this.cardDeck.pop())
      }
      this.step = 'flop'
    },
    openTurn() {
      this.boardCards.push(this.cardDeck.pop())
      this.step = 'turn'
    },
    openRiver() {
      this.boardCards.push(this.cardDeck.pop())
      this.step = 'river'
    },
    endGame() {
      this.step = 'end'
      if (Array.isArray(this.players)) {
        this.players.forEach(player => {
          player.combinations = { hi: null, lo: null }
          player.bestHand = []
          player.isWinner = false
        })
      }
    },

    updatePlayers(value) {
      this.$emit('update:players', value)
    },

    getBoardText() {
      const texts = {
        '': 'Нажмите "next" для начала',
        'preflop': 'Префлоп',
        'flop': 'Флоп',
        'turn': 'Терн',
        'river': 'Ривер',
        'end': 'Игра завершена'
      }
      return texts[this.step] || 'Стол'
    },

    onPlayerHover(player) {
      this.hoveredPlayer = player
    },

    onPlayerLeave() {
      this.hoveredPlayer = null
    },

    isBoardCardInBestHand(card) {
      if (!this.hoveredPlayer || !this.hoveredPlayer.bestHand) {
        return false
      }
      // Показываем только если активирован showHiCards (наведение на "Hi:")
      if (!this.showHiCards) {
        return false
      }
      return this.hoveredPlayer.bestHand.includes(card)
    },

    isBoardCardInLowHand(card) {
      if (!this.hoveredPlayer || !this.hoveredPlayer.lowHand) {
        return false
      }
      // Показываем только если активирован showLoCards (наведение на "Lo:")
      if (!this.showLoCards) {
        return false
      }
      return this.hoveredPlayer.lowHand.includes(card)
    },

    isBoardCardInBothHands(card) {
      return this.isBoardCardInBestHand(card) && this.isBoardCardInLowHand(card)
    },

    onHiHover(player) {
      this.hoveredPlayer = player
      this.showHiCards = true
    },

    onHiLeave() {
      this.showHiCards = false
      // Если не наведены на Lo, то сбрасываем hoveredPlayer
      if (!this.showLoCards) {
        this.hoveredPlayer = null
      }
    },

    onLoHover(player) {
      this.hoveredPlayer = player
      this.showLoCards = true
    },

    onLoLeave() {
      this.showLoCards = false
      // Если не наведены на Hi, то сбрасываем hoveredPlayer
      if (!this.showHiCards) {
        this.hoveredPlayer = null
      }
    },

    calc() {
      if (!Array.isArray(this.players) || this.boardCards.length < 5) {
        console.log('Недостаточно карт на столе для определения победителя')
        return
      }

      const result = determineWinner(this.players, this.boardCards, this.lowRules)

      if (result.winners.length > 0) {
        console.log('=== РЕЗУЛЬТАТЫ РАЗДАЧИ ===')

        if (result.isSplit) {
          console.log(`Сплит пот! ${result.winners.length} победителей:`)
        } else {
          console.log('Победитель:')
        }

        result.winners.forEach(winner => {
          const translatedDesc = translateHandDescription(winner.handDescription)
          console.log(`${winner.name}: ${translatedDesc} (score: ${winner.handScore}, rank: ${winner.handRank})`)
          console.log(`Лучшая комбинация: ${winner.bestHand.join(', ')}`)
        })

        if (this.lowRules && result.lowWinners.length > 0) {
          console.log('=== LOW ПОБЕДИТЕЛИ ===')
          if (result.lowIsSplit) {
            console.log(`Сплит low пот! ${result.lowWinners.length} победителей:`)
          } else {
            console.log('Low победитель:')
          }

          result.lowWinners.forEach(winner => {
            console.log(`${winner.name}: ${winner.lowDescription} (score: ${winner.lowScore})`)
            console.log(`Low комбинация: ${winner.lowHand.join(', ')}`)
          })
        }

        // Сохраняем результаты в данные игроков
        this.players.forEach(player => {
          if (player.handDescription) {
            player.combinations = {
              hi: translateHandDescription(player.handDescription),
              lo: player.lowDescription || null
            }
            // Добавляем информацию о лучшей комбинации
            player.bestHand = player.bestHand || []
            // Проверяем, является ли игрок победителем
            player.isWinner = result.winners.some(winner => winner.name === player.name)
            // Проверяем, является ли игрок low победителем
            player.isLowWinner = this.lowRules && result.lowWinners.some(winner => winner.name === player.name)
          } else {
            player.isWinner = false
            player.bestHand = []
            player.isLowWinner = false
          }
        })

        this.updatePlayers({...this.players})
      } else {
        console.log('Не удалось определить победителя')
      }
    },

    bestCombo(cards) {
      const values = cards.map(c => c[0])
      const suits = cards.map(c => c[1])
      const valuesSet = new Set(values)
      const suitsSet = new Set(suits)
      let isStreet = valuesSet.size === 5 && values[4] - values[0] === 4
      let isFlush = suitsSet.size === 1

      if (isStreet && isFlush) {
        return `street flush, ${values[4]}`
      }
      if (isFlush) {
        return `flush, ${values.join('_')}`
      }
      if (isStreet) {
        return `street ${values[4]}`
      }

      if (valuesSet.size !== 5) {
        let maxRepeats = 0
        let currentRepeats = 1
        let repeatsValues = []

        for (let i = 1; i < 6; i++) {
          if (values[i] === values[i - 1]) {
            currentRepeats++
          } else {
            if (currentRepeats > 1) {
              repeatsValues[values[i - 1]] = currentRepeats
              if (currentRepeats > maxRepeats) {
                maxRepeats = currentRepeats
              }
            }
            currentRepeats = 1
          }
        }

        const kare = Object.keys(repeatsValues).find(key => repeatsValues[key] === 4)
        const set = Object.keys(repeatsValues).find(key => repeatsValues[key] === 3)
        let pairs = Object.keys(repeatsValues).filter(key => repeatsValues[key] === 2)

        if (kare) {
          return `kare, ${kare}`
        }
        if (set && pairs.length) {
          return `full house, ${set}_${pairs[0]}`
        }
        if (set) {
          return `set, ${set}`
        }
        if (pairs.length === 2) {
          pairs = pairs.sort((a, b) => b-a)
          console.log({pairs})
          return `2 pairs, ${pairs[0]}_${pairs[1]}`
        }
        if (pairs.length === 1) {
          return `pair, ${pairs[0]}`
        }
      }

      return `height card ${cards[4]}`
    }
  }
}
</script>

<style lang="scss" scoped>
.room {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);

  .table {
    width: 900px;
    min-height: 550px;
    background: radial-gradient(ellipse at center, #2d5a27 0%, #1e3d1a 100%);
    border-radius: 50%;
    border: 12px solid #8b4513;
    box-shadow: 
      0 10px 30px rgba(0,0,0,0.5),
      inset 0 0 50px rgba(0,0,0,0.3);
    box-sizing: border-box;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;

    .player-seat {
      position: absolute;
      transform: translate(-50%, -50%);
      font-weight: 600;
      font-size: 16px;
      width: 110px;
      height: 110px;
    }
  }

  .board {
    width: 65%;
    height: 100px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    padding: 15px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    flex-wrap: wrap;

    .board-placeholder {
      color: rgba(255, 255, 255, 0.6);
      font-size: 16px;
      font-weight: 500;
      text-align: center;
    }
  }

  .deck-info {
    position: absolute;
    bottom: 20px;
    left: 20px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 600;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
  }

  .interface {
    position: fixed;
    bottom: 30px;
    right: 30px;
    display: flex;
    gap: 15px;
    z-index: 1000;
    align-items: center;

    .settings {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);

      label {
        color: white;
        font-weight: 600;
        font-size: 14px;
        min-width: 50px;
      }

      select {
        background: rgba(255, 255, 255, 0.9);
        border: none;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        min-width: 60px;

        &:hover:not(:disabled) {
          background: white;
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        option {
          background: white;
          color: #333;
        }
      }

      input[type="checkbox"] {
        width: 20px;
        height: 20px;
        cursor: pointer;
        accent-color: #667eea;

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
    }

    button {
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 6px rgba(0,0,0,0.2);

      &:first-child {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
        }
      }

      &:last-child {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(245, 87, 108, 0.4);
        }
      }

      &:active {
        transform: translateY(0);
      }
    }
  }

  .results {
    position: fixed;
    top: 30px;
    right: 30px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 25px;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    max-width: 320px;
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.2);

    h3 {
      margin: 0 0 15px 0;
      color: #1a1a2e;
      font-size: 18px;
      font-weight: 700;
      text-align: center;
      border-bottom: 2px solid #f0f0f0;
      padding-bottom: 10px;
    }

    .player-result {
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s ease;

      &:hover {
        background: rgba(0,0,0,0.02);
      }

      &:last-child {
        border-bottom: none;
      }

      &.winner-result {
        background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 152, 0, 0.1));
        border-left: 3px solid #ffd700;
        padding-left: 8px;
      }

      strong {
        color: #2c3e50;
        font-weight: 600;
      }

      .result-winner-badge {
        margin-left: 8px;
        font-size: 1.1em;
      }
    }
  }
}
</style>
