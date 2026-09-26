<template>
  <span class="poker-card" :class="{ 'in-best-hand': isInBestHand, 'in-low-hand': isInLowHand, 'in-both-hands': isInBothHands, 'board-card': isBoardCard, 'hidden-card': !show }">
    <span v-if="show" class="card-face" :class="{ red: isRed }">
      <span class="card-rank">{{ card?.rank }}</span><span class="card-suit">{{ suitSymbol }}</span>
    </span>
    <span v-else class="card-back">
      <div class="card-back-pattern"></div>
    </span>
  </span>
</template>

<script>
import { SUIT_SYMBOLS, isRedSuit } from '@/helpers/cards'

export default {
  name: 'PokerCard',
  props: {
    card: {
      type: Object,
      default: null
    },
    show: {
      type: Boolean,
      default: false
    },
    isInBestHand: {
      type: Boolean,
      default: false
    },
    isInLowHand: {
      type: Boolean,
      default: false
    },
    isInBothHands: {
      type: Boolean,
      default: false
    },
    isBoardCard: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    suitSymbol() {
      return SUIT_SYMBOLS[this.card?.suit] || ''
    },
    isRed() {
      return isRedSuit(this.card?.suit)
    }
  }
}
</script>

<style lang="scss" scoped>
.poker-card {
  --glow-color: rgba(76, 175, 80, 0.6);
  display: inline-block;
  margin: 2px;
  padding: 4px 6px;
  border-radius: 6px;
  transition: all 0.3s ease;
  background: white;
  border: 1px solid #ddd;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  min-width: 24px;
  min-height: 32px;
  text-align: center;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }

  .card-face {
    color: black;

    &.red {
      color: red;
    }
  }

  &.hidden-card {
    background: linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%);
    border: 2px solid #fff;
    padding: 4px 6px;
  }

  .card-back {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    min-height: 32px;
  }

  .card-back-pattern {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.1),
      rgba(255, 255, 255, 0.1) 2px,
      transparent 2px,
      transparent 4px
    );
    border-radius: 4px;
  }

  &.in-best-hand,
  &.in-low-hand,
  &.in-both-hands {
    padding: 6px 8px;
    box-shadow:
      0 0 12px var(--glow-color),
      0 4px 8px rgba(0,0,0,0.2);
    font-weight: bold;
    animation: cardGlow 2s infinite;
  }

  &.in-best-hand {
    --glow-color: rgba(76, 175, 80, 0.6);
    background: linear-gradient(135deg, #4caf50, #8bc34a);
    border: 2px solid #388e3c;
  }

  &.board-card.in-best-hand {
    --glow-color: rgba(33, 150, 243, 0.6);
    background: linear-gradient(135deg, #2196f3, #64b5f6);
    border: 2px solid #1976d2;
  }

  &.in-low-hand {
    --glow-color: rgba(156, 39, 176, 0.6);
    background: linear-gradient(135deg, #9c27b0, #ba68c8);
    border: 2px solid #7b1fa2;
  }

  &.board-card.in-low-hand {
    --glow-color: rgba(123, 31, 162, 0.6);
    background: linear-gradient(135deg, #7b1fa2, #9c27b0);
    border: 2px solid #6a1b9a;
  }

  &.in-both-hands {
    --glow-color: rgba(255, 152, 0, 0.6);
    background: linear-gradient(135deg, #ff9800, #ff5722);
    border: 2px solid #f57c00;
  }

  &.board-card.in-both-hands {
    --glow-color: rgba(230, 81, 0, 0.6);
    background: linear-gradient(135deg, #e65100, #ff5722);
    border: 2px solid #bf360c;
  }
}

@keyframes cardGlow {
  0%, 100% {
    box-shadow:
      0 0 12px var(--glow-color),
      0 4px 8px rgba(0,0,0,0.2);
  }
  50% {
    box-shadow:
      0 0 18px var(--glow-color),
      0 4px 8px rgba(0,0,0,0.2);
  }
}
</style>
