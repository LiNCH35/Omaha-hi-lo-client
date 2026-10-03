<template>
  <div class="settings-menu">
    <button
      class="settings-button"
      @click="toggleMenu"
      :class="{ 'active': isOpen }"
    >
      ⚙️
    </button>

    <div v-if="isOpen" class="settings-overlay" @click.self="closeMenu">
      <div class="settings-modal">
        <div class="settings-header">
          <h3>Настройки игры</h3>
          <button class="close-button" @click="closeMenu">✕</button>
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
            <label for="neuralBot">Нейро-боты (ML):</label>
            <input
              type="checkbox"
              id="neuralBot"
              v-model="neuralBotModel"
            >
          </div>

          <div v-if="neuralBotStatus" class="blind-info">{{ neuralBotStatus }}</div>

          <div class="setting-item">
            <label for="showCardsAtEnd">Открывать карты в конце раздачи:</label>
            <input
              type="checkbox"
              id="showCardsAtEnd"
              v-model="showCardsAtEndModel"
            >
          </div>

          <div class="setting-item">
            <label for="potLimit">Пот-лимит (рейз до колл + пот):</label>
            <input
              type="checkbox"
              id="potLimit"
              v-model="potLimitModel"
            >
          </div>

          <div class="setting-item">
            <label for="bigBlindBase">Большой блайнд:</label>
            <input
              type="number"
              id="bigBlindBase"
              class="number-input"
              min="2"
              step="2"
              v-model.number="bigBlindBaseModel"
            >
          </div>

          <div class="setting-item">
            <label for="blindPreset">Скорость блайндов:</label>
            <select id="blindPreset" v-model="blindPresetModel">
              <option v-for="(preset, key) in blindPresets" :key="key" :value="key">
                {{ preset.label }}
              </option>
            </select>
          </div>

          <div class="setting-item">
            <label for="handsPerLevel">Раздач на уровень (0 — без роста):</label>
            <input
              type="number"
              id="handsPerLevel"
              class="number-input"
              min="0"
              step="1"
              v-model.number="handsPerLevelModel"
            >
          </div>

          <div class="blind-info">
            Текущие блайнды: SB ${{ store.smallBlind }} / BB ${{ store.bigBlind }}
          </div>

          <div class="setting-actions">
            <button @click="resetFullGame" class="full-reset-button">Новая игра</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore, BLIND_PRESETS } from '@/stores/game'

const store = useGameStore()
const { availablePlayerCounts } = storeToRefs(store)

const isOpen = ref(false)
const blindPresets = BLIND_PRESETS

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

const neuralBotModel = computed({
  get: () => store.neuralBot,
  set: value => (value ? store.enableNeuralBot() : store.disableNeuralBot())
})

const neuralBotStatus = computed(() => store.neuralBotStatus)

const showCardsAtEndModel = computed({
  get: () => store.showCardsAtEnd,
  set: value => store.applySettings({ showCardsAtEnd: value }, 'SettingsMenu:showCardsAtEnd')
})

const potLimitModel = computed({
  get: () => store.potLimit,
  set: value => store.applySettings({ potLimit: value }, 'SettingsMenu:potLimit')
})

const bigBlindBaseModel = computed({
  get: () => store.bigBlindBase,
  set: value => store.applySettings({ bigBlindBase: value }, 'SettingsMenu:bigBlindBase')
})

const blindPresetModel = computed({
  get: () => store.blindPreset,
  set: value => store.applySettings({ blindPreset: value }, 'SettingsMenu:blindPreset')
})

const handsPerLevelModel = computed({
  get: () => store.handsPerLevel,
  set: value => store.applySettings({ handsPerLevel: value }, 'SettingsMenu:handsPerLevel')
})

function toggleMenu() {
  isOpen.value = !isOpen.value
}

function closeMenu() {
  isOpen.value = false
}

function resetFullGame() {
  store.resetFullGame()
  closeMenu()
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

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.settings-modal {
  width: 420px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  background: rgba(30, 30, 50, 0.97);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
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
    max-width: 220px;

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

  .number-input {
    width: 90px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.9);
    color: #333;

    &:focus {
      outline: 2px solid #667eea;
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

.blind-info {
  color: #ffd700;
  font-size: 13px;
  font-weight: 600;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
}

.setting-actions {
  margin-top: 10px;
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
