<template>
  <div
    class="seat"
    :class="{ 
      'winner': player.isWinner, 
      'low-winner': player.isLowWinner, 
      'hovered': isHovered, 
      'folded': player.hasFolded, 
      'current-player': isCurrentPlayer, 
      'dealer': isDealer,
      'active': !player.hasFolded && player.chips > 0
    }"
    @mouseenter="onHover"
    @mouseleave="onLeave"
  >
    <div class="seat-indicator">
      <div v-if="isCurrentPlayer" class="current-turn-indicator"></div>
      <div v-if="isDealer" class="dealer-indicator">D</div>
      <div v-if="player.hasFolded" class="folded-indicator">✕</div>
    </div>
    <div class="seat-content">
      <div class="player-info">
        <p>{{ player.name }} <span v-if="player.isWinner || player.isLowWinner" class="winner-badge">🏆</span></p>
        <p v-if="player.chips !== undefined" class="chips-info">
          ${{ player.chips }}
        </p>
        <p v-if="!simulationMode && player.startingHandEvaluation !== null && player.startingHandEvaluation !== undefined" class="hand-evaluation">
          Оценка: {{ player.startingHandEvaluation.toFixed(1) }}
        </p>
        <div v-if="player.combinations && (player.combinations.hi || player.combinations.lo)" class="combinations">
          <div
            v-if="player.combinations.hi"
            class="hi-combo"
            @mouseenter="onHiHover"
            @mouseleave="onHiLeave"
            @click="onHiClick"
          >
            Hi: {{ player.combinations.hi }} <span v-if="player.winPercentage" class="win-percent">{{ player.winPercentage }}%</span>
          </div>
          <div
            v-if="player.combinations.lo"
            class="lo-combo"
            @mouseenter="onLoHover"
            @mouseleave="onLoLeave"
            @click="onLoClick"
          >
            Lo: {{ player.combinations.lo }} <span v-if="player.lowWinPercentage" class="win-percent">{{ player.lowWinPercentage }}%</span>
          </div>
        </div>
        <!-- Отображение выигрыша -->
        <div v-if="player.winnings && player.winnings > 0" class="winnings-display">
          +${{ player.winnings }}
        </div>
      </div>
      <div class="cards-container">
        <p>
          <PokerCard
            v-for="(card, key) in player.cards"
            :key="key"
            :card="card"
            :show="true"
            :isInBestHand="isCardInBestHand(card)"
            :isInLowHand="isCardInLowHand(card)"
            :isInBothHands="isCardInBothHands(card)"
          />
        </p>
      </div>
    </div>
  </div>
</template>

<script>

import PokerCard from "./PokerCard";
export default {
  name: 'Seat',
  components: {PokerCard},
  props: {
    player: {
      default() {
        return {
          name: 'empty',
          cards: [],
          combinations: {
            hi: null,
            lo: null
          }
        }
      }
    },
    playerIndex: {
      type: Number,
      default: 0
    },
    simulationMode: {
      type: Boolean,
      default: false
    },
    isCurrentPlayer: {
      type: Boolean,
      default: false
    },
    isDealer: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      isHovered: false,
      showHiCards: false,
      showLoCards: false
    }
  },
  computed: {
    shouldShowCards() {
      // В режиме симуляции показываем карты только игроку 1 или если showCards = true (конец игры)
      if (this.simulationMode) {
        return this.playerIndex === 0 || this.player.showCards
      }
      return true
    }
  },
  methods: {
    isCardInBestHand(card) {
      // Показываем карты из лучшей руки при наведении на Hi или если игрок победитель
      if (!this.showHiCards && !this.player.isWinner) {
        return false
      }
      if (!this.player.bestHand || !Array.isArray(this.player.bestHand)) {
        return false
      }
      // Улучшенная проверка карты в лучшей руке
      return this.player.bestHand.some(c => {
        if (typeof c === 'object' && c.rank && c.suit) {
          return c.rank === card.rank && c.suit === card.suit
        }
        if (typeof c === 'string') {
          return c === `${card.rank}${card.suit}` || c === card
        }
        return false
      })
    },
    isCardInLowHand(card) {
      // Показываем карты из low руки при наведении на Lo или если игрок low победитель
      if (!this.showLoCards && !this.player.isLowWinner) {
        return false
      }
      if (!this.player.lowHand || !Array.isArray(this.player.lowHand)) {
        return false
      }
      // Улучшенная проверка карты в low руке
      return this.player.lowHand.some(c => {
        if (typeof c === 'object' && c.rank && c.suit) {
          return c.rank === card.rank && c.suit === card.suit
        }
        if (typeof c === 'string') {
          return c === `${card.rank}${card.suit}` || c === card
        }
        return false
      })
    },
    isCardInBothHands(card) {
      // Показываем карты, которые входят в обе комбинацию
      return this.isCardInBestHand(card) && this.isCardInLowHand(card)
    },
    onHover() {
      this.isHovered = true
      this.$emit('player-hover', this.player)
    },
    onLeave() {
      this.isHovered = false
      this.$emit('player-leave')
    },
    onHiHover() {
      this.showHiCards = true
      this.$emit('player-hover', this.player)
      this.$emit('hi-hover', this.player)
    },
    onHiLeave() {
      this.showHiCards = false
      this.$emit('player-leave')
      this.$emit('hi-leave')
    },
    onHiClick() {
      this.showHiCards = !this.showHiCards
      this.$emit('player-hover', this.player)
      if (this.showHiCards) {
        this.$emit('hi-hover', this.player)
      } else {
        this.$emit('hi-leave')
      }
    },
    onLoHover() {
      this.showLoCards = true
      this.$emit('player-hover', this.player)
      this.$emit('lo-hover', this.player)
    },
    onLoLeave() {
      this.showLoCards = false
      this.$emit('player-leave')
      this.$emit('lo-leave')
    },
    onLoClick() {
      this.showLoCards = !this.showLoCards
      this.$emit('player-hover', this.player)
      if (this.showLoCards) {
        this.$emit('lo-hover', this.player)
      } else {
        this.$emit('lo-leave')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.seat {
  text-align: center;
  box-sizing: border-box;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  padding: 10px;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  position: relative;
  width: 70px;
  height: 70px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .seat-indicator {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 3px;
  }

  .current-turn-indicator {
    width: 10px;
    height: 10px;
    background: #00bcd4;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(0, 188, 212, 0.8);
    animation: pulse 1.5s infinite;
  }

  .dealer-indicator {
    width: 16px;
    height: 16px;
    background: #ff5722;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    box-shadow: 0 0 8px rgba(255, 87, 34, 0.6);
  }

  .folded-indicator {
    width: 16px;
    height: 16px;
    background: rgba(255, 0, 0, 0.3);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
  }

  .seat-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .player-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .cards-container {
    display: flex;
    justify-content: center;
    margin-top: 2px;
  }

  .mini-card {
    transform: scale(0.5);
    margin: -8px -4px;
  }

  p {
    margin: 1px 0;
    color: white;
    font-weight: 500;
    font-size: 10px;
  }

  .hand-evaluation {
    font-size: 12px;
    color: #4caf50;
    font-weight: 600;
    background: rgba(76, 175, 80, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }

  .combinations {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 8px;
    font-weight: 600;
    text-align: center;

    .hi-combo {
      color: #ffd700;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;
      background: rgba(255, 215, 0, 0.1);
      user-select: none;

      &:hover {
        background: rgba(255, 215, 0, 0.3);
      }

      &:active {
        background: rgba(255, 215, 0, 0.5);
      }
    }

    .lo-combo {
      color: #00bcd4;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;
      background: rgba(0, 188, 212, 0.1);
      user-select: none;

      &:hover {
        background: rgba(0, 188, 212, 0.3);
      }

      &:active {
        background: rgba(0, 188, 212, 0.5);
      }
    }

    .win-percent {
      font-size: 9px;
      color: #4caf50;
      font-weight: 700;
      margin-left: 4px;
    }
  }

  &.hovered {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4);
    transform: scale(1.05);
    z-index: 10;
  }

  &.winner {
    border: 3px solid #ffd700;
    border-radius: 12px;
    padding: 10px;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 152, 0, 0.3));
    box-shadow:
      0 0 20px rgba(255, 215, 0, 0.6),
      inset 0 0 10px rgba(255, 215, 0, 0.2);
    animation: pulse 2s infinite;
  }

  &.low-winner {
    border: 3px solid #9c27b0;
    border-radius: 12px;
    padding: 10px;
    background: linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(103, 58, 183, 0.3));
    box-shadow:
      0 0 20px rgba(156, 39, 176, 0.6),
      inset 0 0 10px rgba(156, 39, 176, 0.2);
    animation: pulseLow 2s infinite;
  }

  &.winner.low-winner {
    border: 3px solid #ff9800;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(156, 39, 176, 0.3));
    box-shadow:
      0 0 20px rgba(255, 152, 0, 0.6),
      inset 0 0 10px rgba(156, 39, 176, 0.2);
  }

  .winner-badge {
    font-size: 0.7em;
    margin-left: 2px;
    animation: bounce 1s infinite;
  }

  .chips-info {
    font-size: 9px;
    color: #ffd700;
    font-weight: 600;
    background: rgba(255, 215, 0, 0.2);
    padding: 1px 4px;
    border-radius: 4px;
    display: inline-block;
  }

  .current-bet-info {
    font-size: 9px;
    color: #4caf50;
    font-weight: 600;
    background: rgba(76, 175, 80, 0.2);
    padding: 1px 4px;
    border-radius: 4px;
    display: inline-block;
  }

  .hand-evaluation {
    margin-top: 2px;
    display: flex;
    justify-content: center;
    font-size: 8px;
  }

  .winnings-display {
    margin-top: 2px;
    font-size: 9px;
    color: #4caf50;
    font-weight: 700;
    background: rgba(76, 175, 80, 0.2);
    padding: 1px 4px;
    border-radius: 4px;
    display: inline-block;
    animation: winningsPulse 1s ease-out;
  }

  @keyframes winningsPulse {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  &.folded {
    opacity: 0.5;
    border-color: rgba(255, 0, 0, 0.3);
    background: rgba(255, 0, 0, 0.1);
  }

  &.current-player {
    border: 3px solid #00bcd4;
    box-shadow: 0 0 15px rgba(0, 188, 212, 0.5);
    animation: pulseCurrent 1.5s infinite;
  }

  &.dealer {
    border: 2px solid #ff5722;
    box-shadow: 0 0 10px rgba(255, 87, 34, 0.3);
  }

  &.active {
    border: 2px solid rgba(76, 175, 80, 0.5);
    box-shadow: 0 0 8px rgba(76, 175, 80, 0.3);
  }
}

@keyframes pulseCurrent {
  0%, 100% {
    box-shadow: 0 0 15px rgba(0, 188, 212, 0.5);
  }
  50% {
    box-shadow: 0 0 25px rgba(0, 188, 212, 0.8);
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
  }
  50% {
    box-shadow: 0 0 30px rgba(255, 215, 0, 0.8);
  }
}

@keyframes pulseLow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(156, 39, 176, 0.6);
  }
  50% {
    box-shadow: 0 0 30px rgba(156, 39, 176, 0.8);
  }
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
</style>
