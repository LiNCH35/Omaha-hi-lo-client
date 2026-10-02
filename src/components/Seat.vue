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
        <template v-if="player.outs && (!simulationMode || playerIndex === 0)">
          <p class="outs-info" title="Клик — список аутов в консоли" @click="logOuts('hi')">Хи ауты: {{ formatOut(player.outs.hi) }}</p>
          <p v-if="lowRules" class="outs-info" title="Клик — список аутов в консоли" @click="logOuts('low')">Ло ауты: {{ formatOut(player.outs.low) }}</p>
        </template>
        <div v-if="player.combinations && (player.combinations.hi || player.combinations.lo)" class="combinations">
          <div
            v-if="player.combinations.hi"
            class="combo hi-combo"
            @mouseenter="onComboEnter('hi')"
            @mouseleave="onComboLeave('hi')"
            @click="onComboClick('hi')"
          >
            Hi: {{ player.combinations.hi }} <span v-if="player.winPercentage" class="win-percent">{{ player.winPercentage }}%</span>
          </div>
          <div
            v-if="player.combinations.lo"
            class="combo lo-combo"
            @mouseenter="onComboEnter('lo')"
            @mouseleave="onComboLeave('lo')"
            @click="onComboClick('lo')"
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
            :show="shouldShowCards"
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
import { isCardInHand } from '@/helpers/cards'

export default {
  name: 'Seat',
  components: {PokerCard},
  props: {
    player: {
      type: Object,
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
  },
  lowRules: {
    type: Boolean,
    default: false
  }
  },
  data() {
    return {
      isHovered: false,
      shownCombos: {
        hi: false,
        lo: false
      }
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
    formatOut(value) {
      return value < 0 ? `натс (${value})` : `${value}`
    },
    logOuts(kind) {
      const outs = this.player.outs
      if (!outs) {
        return
      }
      const label = kind === 'hi' ? 'Хи' : 'Ло'
      const value = outs[kind]
      const isNuts = value < 0
      const cards = (kind === 'hi' ? outs.hiCards : outs.lowCards) || []
      const cardList = cards.length > 0 ? cards.join(' ') : '—'
      const note = isNuts ? ' (рука уже натс, карты держат лучший результат)' : ' (карты дают натс на следующей улице)'
      console.log(`[POKER-OUTS] ${this.player.name} — ${label} ауты на натс: ${value}${note}; карты: ${cardList}`)
    },
    comboHand(type) {
      return type === 'hi' ? this.player.bestHand : this.player.lowHand
    },
    comboWon(type) {
      return type === 'hi' ? this.player.isWinner : this.player.isLowWinner
    },
    isComboCard(card, type) {
      if (!this.shownCombos[type] && !this.comboWon(type)) {
        return false
      }
      return isCardInHand(card, this.comboHand(type))
    },
    isCardInBestHand(card) {
      return this.isComboCard(card, 'hi')
    },
    isCardInLowHand(card) {
      return this.isComboCard(card, 'lo')
    },
    isCardInBothHands(card) {
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
    onComboEnter(type) {
      this.shownCombos[type] = true
      this.$emit('player-hover', this.player)
      this.$emit(`${type}-hover`, this.player)
    },
    onComboLeave(type) {
      this.shownCombos[type] = false
      this.$emit('player-leave')
      this.$emit(`${type}-leave`)
    },
    onComboClick(type) {
      if (this.shownCombos[type]) {
        this.onComboLeave(type)
      } else {
        this.onComboEnter(type)
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
    font-size: 8px;
    color: #4caf50;
    font-weight: 600;
    background: rgba(76, 175, 80, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    margin-top: 2px;
  }

  .outs-info {
    font-size: 8px;
    color: #00bcd4;
    font-weight: 600;
    background: rgba(0, 188, 212, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    margin-top: 2px;
    white-space: nowrap;
  }

  .combinations {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 8px;
    font-weight: 600;
    text-align: center;

    .combo {
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.2s ease;
      background: rgba(var(--combo-rgb), 0.1);
      color: var(--combo-color);
      user-select: none;

      &:hover {
        background: rgba(var(--combo-rgb), 0.3);
      }

      &:active {
        background: rgba(var(--combo-rgb), 0.5);
      }
    }

    .hi-combo {
      --combo-rgb: 255, 215, 0;
      --combo-color: #ffd700;
    }

    .lo-combo {
      --combo-rgb: 0, 188, 212;
      --combo-color: #00bcd4;
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

  &.winner,
  &.low-winner {
    border-radius: 12px;
    padding: 10px;
    box-shadow:
      0 0 20px rgba(var(--glow-rgb), 0.6),
      inset 0 0 10px rgba(var(--glow-rgb), 0.2);
    animation: seatGlow 2s infinite;
  }

  &.winner {
    --glow-rgb: 255, 215, 0;
    border: 3px solid #ffd700;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 152, 0, 0.3));
  }

  &.low-winner {
    --glow-rgb: 156, 39, 176;
    border: 3px solid #9c27b0;
    background: linear-gradient(135deg, rgba(156, 39, 176, 0.3), rgba(103, 58, 183, 0.3));
  }

  &.winner.low-winner {
    --glow-rgb: 255, 152, 0;
    border: 3px solid #ff9800;
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(156, 39, 176, 0.3));
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
    --glow-rgb: 0, 188, 212;
    border: 3px solid #00bcd4;
    animation: seatGlow 1.5s infinite;
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

@keyframes seatGlow {
  0%, 100% {
    box-shadow:
      0 0 15px rgba(var(--glow-rgb), 0.5),
      inset 0 0 10px rgba(var(--glow-rgb), 0.2);
  }
  50% {
    box-shadow:
      0 0 30px rgba(var(--glow-rgb), 0.8),
      inset 0 0 10px rgba(var(--glow-rgb), 0.2);
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
