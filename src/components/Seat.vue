<template>
  <div
    class="seat"
    :class="{ 'winner': player.isWinner, 'low-winner': player.isLowWinner, 'hovered': isHovered }"
    @mouseenter="onHover"
    @mouseleave="onLeave"
  >
    <p>{{ player.name }} <span v-if="player.isWinner" class="winner-badge">🏆</span><span v-if="player.isLowWinner" class="low-winner-badge">🥈</span></p>
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
    <div v-if="player.combinations && (player.combinations.hi || player.combinations.lo)" class="combination-tooltip">
      <div
        v-if="player.combinations.hi"
        class="hi-combo"
        @mouseenter="onHiHover"
        @mouseleave="onHiLeave"
      >
        Hi: {{ player.combinations.hi }}
      </div>
      <div
        v-if="player.combinations.lo"
        class="lo-combo"
        @mouseenter="onLoHover"
        @mouseleave="onLoLeave"
      >
        Lo: {{ player.combinations.lo }}
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
      return this.player.bestHand.includes(card)
    },
    isCardInLowHand(card) {
      // Показываем карты из low руки при наведении на Lo или если игрок low победитель
      if (!this.showLoCards && !this.player.isLowWinner) {
        return false
      }
      if (!this.player.lowHand || !Array.isArray(this.player.lowHand)) {
        return false
      }
      return this.player.lowHand.includes(card)
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

  p {
    margin: 5px 0;
    color: white;
    font-weight: 500;
  }

  &.hovered {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4);
    transform: scale(1.05);
    z-index: 10;

    .combination-tooltip {
      opacity: 1;
      background: rgba(0, 0, 0, 1);
      transform: translateX(-50%) scale(1.1);
    }
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
    font-size: 1.2em;
    margin-left: 5px;
    animation: bounce 1s infinite;
  }

  .low-winner-badge {
    font-size: 1.2em;
    margin-left: 5px;
    animation: bounce 1s infinite;
  }

  .combination-tooltip {
    position: absolute;
    bottom: -45px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    z-index: 100;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    opacity: 0.8;
    transition: all 0.3s ease;
    min-width: 80px;
    text-align: center;

    &:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 1);
    }

    .hi-combo {
      color: #ffd700;
      margin-bottom: 2px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;

      &:hover {
        background: rgba(255, 215, 0, 0.2);
      }
    }

    .lo-combo {
      color: #9c27b0;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;

      &:hover {
        background: rgba(156, 39, 176, 0.2);
      }
    }
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

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
