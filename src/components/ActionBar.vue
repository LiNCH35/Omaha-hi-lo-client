<template>
  <div class="interface">
    <div class="action-buttons">
      <button v-if="step === ''" @click="newHand" class="start-button">Новая раздача</button>

      <template v-if="!simulationMode">
        <button v-if="step !== ''" @click="next" :disabled="step === 'end'">next</button>
        <button v-if="step === 'river'" @click="calc">calc</button>
      </template>

      <template v-if="simulationMode && step !== '' && step !== 'end'">
        <button @click="playerAction('fold')" class="action-button fold-button">Fold</button>
        <button @click="handleCheckCall" class="action-button check-call-button">{{ checkCallText }}</button>
        <div class="raise-container">
          <input
            type="number"
            v-model.number="raiseAmountModel"
            class="raise-input"
            min="20"
            :max="pot"
            @input="() => store.validateRaiseAmount()"
          />
          <button @click="playerAction('raise')" class="action-button raise-button">Raise</button>
        </div>
      </template>

      <button v-if="step === 'end'" @click="newHand" class="reset-button">Новая раздача</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const { step, simulationMode, currentBet, pot } = storeToRefs(store)
const { newHand, next, calc, playerAction } = store

const raiseAmountModel = computed({
  get: () => store.raiseAmount,
  set: value => {
    store.raiseAmount = value
  }
})

const checkCallText = computed(() => {
  return currentBet.value > 0 ? 'Call' : 'Check'
})

function handleCheckCall() {
  if (currentBet.value > 0) {
    playerAction('call')
  } else {
    playerAction('check')
  }
}
</script>

<style lang="scss" scoped>
.interface {
  position: fixed;
  bottom: 30px;
  right: 30px;
  display: flex;
  gap: 15px;
  z-index: 1000;
  align-items: center;

  .action-buttons {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;

    .raise-container {
      display: flex;
      gap: 5px;
      align-items: center;

      .raise-input {
        width: 80px;
        padding: 10px;
        font-size: 14px;
        font-weight: 600;
        border: none;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.9);
        color: #333;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);

        &:focus {
          outline: 2px solid #667eea;
        }
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
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);

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

    &.action-button {
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);

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

      &.fold-button {
        background: linear-gradient(135deg, #f44336 0%, #e53935 100%);
        color: white;

        &:hover:not(:disabled) {
          box-shadow: 0 6px 12px rgba(244, 67, 54, 0.4);
        }
      }

      &.check-call-button {
        background: linear-gradient(135deg, #2196f3 0%, #4caf50 100%);
        color: white;

        &:hover:not(:disabled) {
          box-shadow: 0 6px 12px rgba(33, 150, 243, 0.4);
        }
      }

      &.raise-button {
        background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
        color: white;

        &:hover:not(:disabled) {
          box-shadow: 0 6px 12px rgba(255, 152, 0, 0.4);
        }
      }
    }
  }
}
</style>
