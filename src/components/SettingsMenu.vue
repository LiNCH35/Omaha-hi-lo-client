<template>
  <div class="settings-menu">
    <button
      class="settings-button"
      @click="toggleMenu"
      :class="{ 'active': isOpen }"
    >
      ⚙️
    </button>

    <div class="settings-panel" :class="{ 'open': isOpen }">
      <div class="settings-header">
        <h3>Настройки игры</h3>
        <button class="close-button" @click="toggleMenu">✕</button>
      </div>

      <div class="settings-content">
        <div class="setting-item">
          <label for="cardCount">Карт на руки:</label>
          <select id="cardCount" v-model.number="cardCountModel">
            <option value="2">2 (Hold'em)</option>
            <option value="4">4 (Omaha)</option>
            <option value="6">6</option>
            <option value="7">7</option>
          </select>
        </div>

        <div class="setting-item">
          <label for="playerCount">Количество игроков:</label>
          <select id="playerCount" v-model.number="playerCountModel">
            <option v-for="count in availablePlayerCounts" :key="count" :value="count">
              {{ count }}
            </option>
          </select>
        </div>

        <div class="setting-item">
          <label for="lowRules">Hi-Lo правила:</label>
          <input
            type="checkbox"
            id="lowRules"
            v-model="lowRulesModel"
            :disabled="cardCountModel == 2"
          >
        </div>

        <div class="setting-item">
          <label for="simulationMode">Симуляция игры:</label>
          <input
            type="checkbox"
            id="simulationMode"
            v-model="simulationModeModel"
          >
        </div>

        <div class="setting-item">
          <label for="showCardsAtEnd">Открывать карты в конце раздачи:</label>
          <input
            type="checkbox"
            id="showCardsAtEnd"
            v-model="showCardsAtEndModel"
          >
        </div>

        <div class="setting-actions">
          <button @click="resetFullGame" class="full-reset-button">Новая игра</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const { availablePlayerCounts } = storeToRefs(store)

const isOpen = ref(false)

const cardCountModel = computed({
  get: () => store.cardCount,
  set: value => store.applySettings({ cardCount: value }, 'SettingsMenu:cardCount')
})

const playerCountModel = computed({
  get: () => store.playerCount,
  set: value => store.applySettings({ playerCount: value }, 'SettingsMenu:playerCount')
})

const lowRulesModel = computed({
  get: () => store.lowRules,
  set: value => store.applySettings({ lowRules: value }, 'SettingsMenu:lowRules')
})

const simulationModeModel = computed({
  get: () => store.simulationMode,
  set: value => store.applySettings({ simulationMode: value }, 'SettingsMenu:simulationMode')
})

const showCardsAtEndModel = computed({
  get: () => store.showCardsAtEnd,
  set: value => store.applySettings({ showCardsAtEnd: value }, 'SettingsMenu:showCardsAtEnd')
})

function toggleMenu() {
  isOpen.value = !isOpen.value
}

function resetFullGame() {
  store.resetFullGame()
  toggleMenu()
}
</script>

<style lang="scss" scoped>
.settings-menu {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;
}

.settings-button {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  color: white;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: rotate(90deg);
  }

  &.active {
    background: rgba(102, 126, 234, 0.3);
    border-color: rgba(102, 126, 234, 0.5);
  }
}

.settings-panel {
  position: absolute;
  top: 60px;
  left: 0;
  width: 280px;
  background: rgba(30, 30, 50, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-10px);
  transition: all 0.3s ease;

  &.open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);

  h3 {
    margin: 0;
    color: white;
    font-size: 18px;
    font-weight: 600;
  }

  .close-button {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-size: 20px;
    cursor: pointer;
    transition: color 0.2s ease;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      color: white;
    }
  }
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  label {
    color: white;
    font-weight: 500;
    font-size: 14px;
    flex: 1;
  }

  select {
    background: rgba(255, 255, 255, 0.9);
    border: none;
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    min-width: 80px;

    &:hover:not(:disabled) {
      background: white;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    option {
      background: white;
      color: #333;
    }
  }

  input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: #667eea;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

.setting-actions {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);

  .full-reset-button {
    width: 100%;
    padding: 12px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.3s ease;
    background: linear-gradient(135deg, #f44336 0%, #e53935 100%);
    color: white;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(244, 67, 54, 0.4);
    }

    &:active {
      transform: translateY(0);
    }
  }
}
</style>
