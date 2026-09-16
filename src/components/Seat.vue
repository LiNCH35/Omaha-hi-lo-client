<template>
  <div
    class="seat"
    :class="{ 'winner': player.isWinner, 'low-winner': player.isLowWinner, 'hovered': isHovered }"
    @mouseenter="onHover"
    @mouseleave="onLeave"
  >
    <div class="seat-content">
      <div class="player-info">
        <p>{{ player.name }} <span v-if="player.isWinner || player.isLowWinner" class="winner-badge">🏆</span></p>
        <p v-if="player.startingHandEvaluation !== null && player.startingHandEvaluation !== undefined" class="hand-evaluation">
          Оценка: {{ player.startingHandEvaluation.toFixed(1) }}
        </p>
        <div v-if="player.combinations && (player.combinations.hi || player.combinations.lo)" class="combinations">
          <div
            v-if="player.combinations.hi"
            class="hi-combo"
            @mouseenter="onHiHover"
            @mouseleave="onHiLeave"
          >
            Hi: {{ player.combinations.hi }} <span v-if="player.winPercentage" class="win-percent">{{ player.winPercentage }}%</span>
          </div>
          <div
            v-if="player.combinations.lo"
            class="lo-combo"
            @mouseenter="onLoHover"
            @mouseleave="onLoLeave"
          >
            Lo: {{ player.combinations.lo }} <span v-if="player.lowWinPercentage" class="win-percent">{{ player.lowWinPercentage }}%</span>
          </div>
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
  },
  data() {
    return {
      isHovered: false,
      showHiCards: false,
      showLoCards: false
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
      return this.player.bestHand.some(c => 
        (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
        (typeof c === 'string' && c === `${card.rank}${card.suit}`)
      )
    },
    isCardInLowHand(card) {
      // Показываем карты из low руки при наведении на Lo или если игрок low победитель
      if (!this.showLoCards && !this.player.isLowWinner) {
        return false
      }
      if (!this.player.lowHand || !Array.isArray(this.player.lowHand)) {
        return false
      }
      return this.player.lowHand.some(c => 
        (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
        (typeof c === 'string' && c === `${card.rank}${card.suit}`)
      )
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
    onLoHover() {
      this.showLoCards = true
      this.$emit('player-hover', this.player)
      this.$emit('lo-hover', this.player)
    },
    onLoLeave() {
      this.showLoCards = false
      this.$emit('player-leave')
      this.$emit('lo-leave')
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
  border-radius: 12px;
  padding: 10px;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  position: relative;

  .seat-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .player-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .cards-container {
    display: flex;
    justify-content: center;
  }

  p {
    margin: 2px 0;
    color: white;
    font-weight: 500;
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
    gap: 2px;
    font-size: 10px;
    font-weight: 600;
    text-align: center;

    .hi-combo {
      color: #ffd700;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;
      background: rgba(255, 215, 0, 0.1);

      &:hover {
        background: rgba(255, 215, 0, 0.3);
      }
    }

    .lo-combo {
      color: #00bcd4;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;
      background: rgba(0, 188, 212, 0.1);

      &:hover {
        background: rgba(0, 188, 212, 0.3);
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
    font-size: 0.9em;
    margin-left: 3px;
    animation: bounce 1s infinite;
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
