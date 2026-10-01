<template>
  <div class="table">
    <template v-for="(player, k) in players" :key="player.name">
      <Seat
        v-if="k < playerCount"
        :player="player"
        :playerIndex="k"
        :simulationMode="simulationMode"
        :isCurrentPlayer="simulationMode && k === currentPlayerIndex"
        :isDealer="k === dealerIndex"
        :style="seatStyle(k)"
        class="player-seat"
        @player-hover="onPlayerHover"
        @player-leave="onPlayerLeave"
        @hi-hover="onHiHover"
        @hi-leave="onHiLeave"
        @lo-hover="onLoHover"
        @lo-leave="onLoLeave"
      />
    </template>
    <div class="board">
      <div v-if="boardCards.length === 0" class="board-placeholder">
        {{ boardText }}
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
    <div v-if="step !== 'end'" class="pot-display-center">
      <div class="pot-stacks">
        <div v-for="(stack, i) in displayPots" :key="i" class="pot-stack">
          <PokerChips :amount="stack.amount" :compact="true" :show-amount="true" />
          <span v-if="displayPots.length > 1" class="pot-label">Пот {{ i + 1 }}</span>
        </div>
      </div>
    </div>
    <!-- Фишки ставок игроков на столе -->
    <template v-for="(player, k) in players" :key="`bet-${player.name}`">
      <div v-if="k < playerCount && step !== 'end' && player.currentBet > 0" class="player-bet-chips" :style="getPlayerBetPosition(k)">
        <PokerChips :amount="player.currentBet" :compact="true" :show-amount="true" />
      </div>
    </template>

    <!-- Выигрыши игроков отображаются как ставки -->
    <template v-for="(player, k) in players" :key="`win-${player.name}`">
      <div v-if="k < playerCount && step === 'end' && player.winnings > 0" class="player-bet-chips winnings" :style="getPlayerBetPosition(k)">
        <PokerChips :amount="player.winnings" :compact="true" :show-amount="true" />
      </div>
    </template>
    <div class="game-info">
      <span class="game-mode">{{ cardCount === 2 ? 'Hold\'em' : cardCount === 4 ? 'Omaha' : `${cardCount} карт` }}</span>
      <span v-if="lowRules" class="hi-lo-badge">Hi-Lo</span>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { getPlayerPosition } from '@/helpers/seatLayout'
import { buildPots } from '@/helpers/sidePots'
import Seat from './Seat'
import PokerCard from './PokerCard'
import PokerChips from './PokerChips'

const store = useGameStore()
const {
  players,
  playerCount,
  simulationMode,
  currentPlayerIndex,
  boardCards,
  boardText,
  cardDeck,
  pot,
  cardCount,
  lowRules,
  dealerIndex,
  step
} = storeToRefs(store)
const {
  onPlayerHover,
  onPlayerLeave,
  onHiHover,
  onHiLeave,
  onLoHover,
  onLoLeave,
  isBoardCardInBestHand,
  isBoardCardInLowHand,
  isBoardCardInBothHands
} = store

function seatStyle(k) {
  return getPlayerPosition(k, playerCount.value)
}

const displayPots = computed(() => {
  if (pot.value <= 0) {
    return []
  }
  const hasAllIn = players.value.some(p => !p.hasFolded && p.chips === 0 && (p.totalBet || 0) > 0)
  if (!hasAllIn) {
    return [{ amount: pot.value }]
  }
  const sweptPlayers = players.value.map(p => ({
    hasFolded: p.hasFolded,
    totalBet: Math.max(0, (p.totalBet || 0) - (p.currentBet || 0))
  }))
  const { pots, refund } = buildPots(sweptPlayers)
  if (pots.length <= 1) {
    return [{ amount: pot.value }]
  }
  const stacks = pots.map(p => ({ amount: p.amount }))
  if (refund && refund.amount > 0 && stacks.length > 0) {
    stacks[stacks.length - 1].amount += refund.amount
  }
  const formed = stacks.reduce((sum, stack) => sum + stack.amount, 0)
  if (stacks.length > 0 && formed !== pot.value) {
    stacks[stacks.length - 1].amount += pot.value - formed
  }
  return stacks
})

function getPlayerBetPosition(playerIndex) {
  const seatPos = getPlayerPosition(playerIndex, playerCount.value)
  // Вычисляем позицию для фишек на столе - между местом игрока и центром стола
  const seatLeft = parseFloat(seatPos.left)
  const seatTop = parseFloat(seatPos.top)

  // Вектор от центра к месту игрока
  const dx = seatLeft - 50
  const dy = seatTop - 50

  // Длина вектора
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Нормализуем и сдвигаем ближе к центру (на 70% расстояния)
  const factor = 0.7
  const betLeft = 50 + dx * factor
  const betTop = 50 + dy * factor

  return {
    left: `${betLeft}%`,
    top: `${betTop}%`
  }
}
</script>

<style lang="scss" scoped>
.table {
  width: 800px;
  min-height: 500px;
  background: radial-gradient(ellipse at center, #2d5a27 0%, #1e3d1a 100%);
  border-radius: 50%;
  border: 12px solid #8b4513;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.5),
    inset 0 0 50px rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;

  .player-seat {
    position: absolute;
    transform: translate(-50%, -50%);
    font-weight: 600;
    font-size: 14px;
    width: 90px;
    height: 90px;
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

.pot-display-center {
  position: absolute;
  top: 65%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}

.pot-stacks {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  justify-content: center;
}

.pot-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.pot-label {
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.35);
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.player-bet-chips {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 5;

  &.winnings {
    z-index: 6;
    animation: winningsPulse 0.5s ease-out;
  }
}

@keyframes winningsPulse {
  0% {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 0;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
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
</style>
