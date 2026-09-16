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
          <select id="cardCount" v-model.number="localCardCount" @change="saveSettings">
            <option value="2">2 (Hold'em)</option>
            <option value="4">4 (Omaha)</option>
            <option value="6">6</option>
            <option value="7">7</option>
          </select>
        </div>
        
        <div class="setting-item">
          <label for="playerCount">Количество игроков:</label>
          <select id="playerCount" v-model.number="localPlayerCount" @change="saveSettings">
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
            v-model="localLowRules" 
            @change="saveSettings"
            :disabled="localCardCount == 2"
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SettingsMenu',
  props: {
    cardCount: {
      type: Number,
      default: 4
    },
    playerCount: {
      type: Number,
      default: 8
    },
    lowRules: {
      type: Boolean,
      default: false
    },
    maxPlayers: {
      type: Number,
      default: 8
    }
  },
  data() {
    return {
      isOpen: false,
      localCardCount: this.cardCount,
      localPlayerCount: this.playerCount,
      localLowRules: this.lowRules
    }
  },
  computed: {
    availablePlayerCounts() {
      const counts = []
      for (let i = 2; i <= this.maxPlayers; i++) {
        counts.push(i)
      }
      return counts
    }
  },
  watch: {
    cardCount(newVal) {
      this.localCardCount = newVal
    },
    playerCount(newVal) {
      this.localPlayerCount = newVal
    },
    lowRules(newVal) {
      this.localLowRules = newVal
    }
  },
  mounted() {
    this.loadSettings()
  },
  methods: {
    toggleMenu() {
      this.isOpen = !this.isOpen
    },
    saveSettings() {
      const settings = {
        cardCount: this.localCardCount,
        playerCount: this.localPlayerCount,
        lowRules: this.localLowRules
      }
      localStorage.setItem('pokerGameSettings', JSON.stringify(settings))
      
      this.$emit('update:cardCount', this.localCardCount)
      this.$emit('update:playerCount', this.localPlayerCount)
      this.$emit('update:lowRules', this.localLowRules)
      
      console.log('Settings saved:', settings)
    },
    loadSettings() {
      const saved = localStorage.getItem('pokerGameSettings')
      if (saved) {
        try {
          const settings = JSON.parse(saved)
          this.localCardCount = settings.cardCount || 4
          this.localPlayerCount = settings.playerCount || 8
          this.localLowRules = settings.lowRules || false
          
          this.$emit('update:cardCount', this.localCardCount)
          this.$emit('update:playerCount', this.localPlayerCount)
          this.$emit('update:lowRules', this.localLowRules)
        } catch (error) {
          console.error('Error loading settings:', error)
        }
      }
    }
  }
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
</style>
