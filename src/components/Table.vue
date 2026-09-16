<template>
  <div class="room">
    <SettingsMenu
      :cardCount="cardCount"
      :playerCount="playerCount"
      :lowRules="lowRules"
      :maxPlayers="maxPlayers"
      @update:cardCount="cardCount = $event"
      @update:playerCount="playerCount = $event"
      @update:lowRules="lowRules = $event"
    />
    
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
      <div class="game-info">
        <span class="game-mode">{{ cardCount === 2 ? 'Hold\'em' : cardCount === 4 ? 'Omaha' : `${cardCount} карт` }}</span>
        <span v-if="lowRules" class="hi-lo-badge">Hi-Lo</span>
      </div>
    </div>
    <div class="interface">
      <button v-if="step === ''" @click="start" class="start-button">Новая игра</button>
      <button v-if="step !== ''" @click="next" :disabled="step === 'end'">next</button>
      <button v-if="step === 'river'" @click="calc">calc</button>
      <button v-if="step !== ''" @click="resetGame" class="reset-button">Новая игра</button>
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
import SettingsMenu from "./SettingsMenu";
import { determineWinner, translateHandDescription } from "@/helpers/pokerEvaluator";
import { evaluateStartingHand } from "@/helpers/evaluateStartingHand";

export default {
  name: 'Table',
  components: {PokerCard, Seat, SettingsMenu},
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
        }, 100)
      }
    },
    playerCount(newVal, oldVal) {
      // Если значение действительно изменилось
      if (newVal !== oldVal) {
        // Сначала сбрасываем всё
        this.resetGame()
      }
    },
    lowRules(newVal, oldVal) {
      // Если значение действительно изменилось
      if (newVal !== oldVal) {
        console.log('lowRules changed from', oldVal, 'to', newVal)
        // Сначала сбрасываем всё
        this.resetGame()
      }
    },
    mounted() {
      // Загружаем настройки из localStorage при монтировании
      this.loadSettings()
      // Убеждаемся, что lowRules не сбрасывается
      console.log('Mounted with lowRules:', this.lowRules)
    },
  },
  mounted() {
    // Загружаем настройки из localStorage при монтировании
    this.loadSettings()
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
      // Полный сброс игроков через родительский компонент
      this.resetAllPlayers()
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
            player.startingHandEvaluation = null

            for (let i = 0; i < this.cardCount; i++) {
              player.cards.push(this.cardDeck.pop())
            }

            // Вычисляем оценку стартовой руки для Omaha (4+ карт)
            if (this.cardCount >= 4) {
              try {
                const handEvaluation = evaluateStartingHand(player.cards)
                player.startingHandEvaluation = handEvaluation.overall
              } catch (error) {
                console.error('Error evaluating starting hand:', error)
                player.startingHandEvaluation = null
              }
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
            player.startingHandEvaluation = null
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
      // Force reactivity update
      this.$forceUpdate()
    },
    resetAllPlayers() {
      this.$emit('reset-players')
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
      return this.hoveredPlayer.bestHand.some(c => 
        (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
        (typeof c === 'string' && c === `${card.rank}${card.suit}`)
      )
    },

    isBoardCardInLowHand(card) {
      if (!this.hoveredPlayer || !this.hoveredPlayer.lowHand) {
        return false
      }
      // Показываем только если активирован showLoCards (наведение на "Lo:")
      if (!this.showLoCards) {
        return false
      }
      return this.hoveredPlayer.lowHand.some(c => 
        (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
        (typeof c === 'string' && c === `${card.rank}${card.suit}`)
      )
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

      console.log('Calculating with lowRules:', this.lowRules)
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
        const hiWinnersCount = result.winners.length
        const lowWinnersCount = this.lowRules ? result.lowWinners.length : 0
        
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
            
            // Рассчитываем проценты от банка
            if (player.isWinner) {
              player.winPercentage = Math.round((1 / hiWinnersCount) * 100)
            } else {
              player.winPercentage = 0
            }
            
            if (player.isLowWinner) {
              player.lowWinPercentage = Math.round((1 / lowWinnersCount) * 100)
            } else {
              player.lowWinPercentage = 0
            }
          } else {
            player.isWinner = false
            player.bestHand = []
            player.isLowWinner = false
            player.winPercentage = 0
            player.lowWinPercentage = 0
          }
        })

        this.updatePlayers({...this.players})
      } else {
        console.log('Не удалось определить победителя')
      }
    },

    bestCombo(cards) {
      const values = cards.map(c => c[0])
      const _suits = cards.map(c => c[1])
      const valuesSet = new Set(values)
      const _suitsSet = new Set(_suits)
      let isStreet = valuesSet.size === 5 && values[4] - values[0] === 4
      let isFlush = _suitsSet.size === 1

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
    },
    loadSettings() {
      const saved = localStorage.getItem('pokerGameSettings')
      if (saved) {
        try {
          const settings = JSON.parse(saved)
          console.log('Loading settings from localStorage:', settings)
          if (settings.cardCount) this.cardCount = settings.cardCount
          if (settings.playerCount) this.playerCount = settings.playerCount
          if (typeof settings.lowRules === 'boolean') {
            this.lowRules = settings.lowRules
            console.log('Set lowRules to:', this.lowRules)
          }
        } catch (error) {
          console.error('Error loading settings:', error)
        }
      } else {
        console.log('No saved settings found')
      }
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

  .game-info {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
    align-items: center;

    .game-mode {
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      font-weight: 600;
      background: rgba(0, 0, 0, 0.3);
      padding: 6px 12px;
      border-radius: 6px;
    }

    .hi-lo-badge {
      color: #9c27b0;
      font-size: 12px;
      font-weight: 700;
      background: rgba(156, 39, 176, 0.2);
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid rgba(156, 39, 176, 0.4);
    }
  }

  .interface {
    position: fixed;
    bottom: 30px;
    right: 30px;
    display: flex;
    gap: 15px;
    z-index: 1000;
    align-items: center;

    button {
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 6px rgba(0,0,0,0.2);

      &:hover:not(:disabled) {
        transform: translateY(-2px);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &.start-button {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;

        &:hover:not(:disabled) {
          box-shadow: 0 6px 12px rgba(102, 126, 234, 0.4);
        }
      }

      &:not(.start-button):not(.reset-button) {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;

        &:hover:not(:disabled) {
          box-shadow: 0 6px 12px rgba(245, 87, 108, 0.4);
        }
      }

      &.reset-button {
        background: linear-gradient(135deg, #4caf50 0%, #8bc34a 100%);
        color: white;

        &:hover:not(:disabled) {
          box-shadow: 0 6px 12px rgba(76, 175, 80, 0.4);
        }
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
