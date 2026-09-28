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
    <div class="pot-display-center">
      <div class="pot-chips">
        <div class="pot-chip-stack">
          <div class="pot-chip" v-for="i in Math.min(Math.ceil(pot / 50), 8)" :key="i"></div>
        </div>
        <div class="pot-amount">${{ pot }}</div>
      </div>
    </div>
    <!-- Фишки ставок игроков на столе -->
    <template v-for="(player, k) in players" :key="`bet-${player.name}`">
      <div v-if="k < playerCount && player.currentBet > 0" class="player-bet-chips" :style="getPlayerBetPosition(k)">
        <div class="bet-chip-stack">
          <div class="bet-chip" v-for="i in Math.min(Math.ceil(player.currentBet / 20), 3)" :key="i"></div>
        </div>
        <div class="bet-amount">${{ player.currentBet }}</div>
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
import { useGameStore } from '@/stores/game'
import { getPlayerPosition } from '@/helpers/seatLayout'
import Seat from './Seat'
import PokerCard from './PokerCard'

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
  dealerIndex
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

.pot-chips {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.pot-chip-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: -10px;
}

.pot-chip {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
  border: 4px dashed #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  margin-top: -15px;
}

.pot-chip:first-child {
  margin-top: 0;
}

.pot-amount {
  color: white;
  font-size: 24px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 12px;
  border-radius: 6px;
}

.player-bet-chips {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 5;
}

.bet-chip-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: -6px;
}

.bet-chip {
  width: 25px;
  height: 25px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700 0%, #ff8c00 100%);
  border: 2px dashed #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  margin-top: -10px;
}

.bet-chip:first-child {
  margin-top: 0;
}

.bet-amount {
  color: white;
  font-size: 11px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 6px;
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
</style>
