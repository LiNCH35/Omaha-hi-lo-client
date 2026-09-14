<template>
  <span class="poker-card" :class="{ 'in-best-hand': isInBestHand, 'in-low-hand': isInLowHand, 'in-both-hands': isInBothHands, 'board-card': isBoardCard }">
    <span v-if="show" v-html="text" :style="{color}" />
    <span v-else v-html="`&#10720;`" />
  </span>
</template>

<script>

export default {
  name: 'PokerCard',
  props: {
    card: {
      default: 'd'
    },
    show: {
      default: false
    },
    isInBestHand: {
      default: false
    },
    isInLowHand: {
      default: false
    },
    isInBothHands: {
      default: false
    },
    isBoardCard: {
      default: false
    }
  },
  computed: {
    text() {
      return this.card
        .replace('10', 'T')
        .replace('11', 'J')
        .replace('12', 'Q')
        .replace('13', 'K')
        .replace('14', 'A')
        .replace('s', '&#9824;')
        .replace('h', '&#9829;')
        .replace('c', '&#9827;')
        .replace('d', '&#9830;')
    },
    color() {
      return this.card?.includes('h') || this.card?.includes('d') ? 'red' : 'black'
    },
  },
}
</script>

<style lang="scss" scoped>
.poker-card {
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
  text-align: center;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }

  &.in-best-hand {
    background: linear-gradient(135deg, #4caf50, #8bc34a);
    padding: 6px 8px;
    box-shadow: 
      0 0 12px rgba(76, 175, 80, 0.6),
      0 4px 8px rgba(0,0,0,0.2);
    font-weight: bold;
    border: 2px solid #388e3c;
    animation: cardHighlight 2s infinite;
  }

  &.board-card.in-best-hand {
    background: linear-gradient(135deg, #2196f3, #64b5f6);
    box-shadow:
      0 0 12px rgba(33, 150, 243, 0.6),
      0 4px 8px rgba(0,0,0,0.2);
    border: 2px solid #1976d2;
    animation: boardCardHighlight 2s infinite;
  }

  &.in-low-hand {
    background: linear-gradient(135deg, #9c27b0, #ba68c8);
    padding: 6px 8px;
    box-shadow:
      0 0 12px rgba(156, 39, 176, 0.6),
      0 4px 8px rgba(0,0,0,0.2);
    font-weight: bold;
    border: 2px solid #7b1fa2;
    animation: lowCardHighlight 2s infinite;
  }

  &.in-both-hands {
    background: linear-gradient(135deg, #ff9800, #ff5722);
    padding: 6px 8px;
    box-shadow:
      0 0 12px rgba(255, 152, 0, 0.6),
      0 4px 8px rgba(0,0,0,0.2);
    font-weight: bold;
    border: 2px solid #f57c00;
    animation: bothHandsHighlight 2s infinite;
  }

  &.board-card.in-low-hand {
    background: linear-gradient(135deg, #7b1fa2, #9c27b0);
    box-shadow:
      0 0 12px rgba(123, 31, 162, 0.6),
      0 4px 8px rgba(0,0,0,0.2);
    border: 2px solid #6a1b9a;
    animation: lowBoardCardHighlight 2s infinite;
  }

  &.board-card.in-both-hands {
    background: linear-gradient(135deg, #e65100, #ff5722);
    box-shadow:
      0 0 12px rgba(230, 81, 0, 0.6),
      0 4px 8px rgba(0,0,0,0.2);
    border: 2px solid #bf360c;
    animation: bothBoardCardHighlight 2s infinite;
  }
}

@keyframes cardHighlight {
  0%, 100% {
    box-shadow: 0 0 12px rgba(76, 175, 80, 0.6);
  }
  50% {
    box-shadow: 0 0 18px rgba(76, 175, 80, 0.8);
  }
}

@keyframes boardCardHighlight {
  0%, 100% {
    box-shadow: 0 0 12px rgba(33, 150, 243, 0.6);
  }
  50% {
    box-shadow: 0 0 18px rgba(33, 150, 243, 0.8);
  }
}

@keyframes lowCardHighlight {
  0%, 100% {
    box-shadow: 0 0 12px rgba(156, 39, 176, 0.6);
  }
  50% {
    box-shadow: 0 0 18px rgba(156, 39, 176, 0.8);
  }
}

@keyframes lowBoardCardHighlight {
  0%, 100% {
    box-shadow: 0 0 12px rgba(123, 31, 162, 0.6);
  }
  50% {
    box-shadow: 0 0 18px rgba(123, 31, 162, 0.8);
  }
}

@keyframes bothHandsHighlight {
  0%, 100% {
    box-shadow: 0 0 12px rgba(255, 152, 0, 0.6);
  }
  50% {
    box-shadow: 0 0 18px rgba(255, 152, 0, 0.8);
  }
}

@keyframes bothBoardCardHighlight {
  0%, 100% {
    box-shadow: 0 0 12px rgba(230, 81, 0, 0.6);
  }
  50% {
    box-shadow: 0 0 18px rgba(230, 81, 0, 0.8);
  }
}
</style>
