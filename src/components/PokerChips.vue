<template>
  <div class="poker-chips" :class="{ 'compact': compact }">
    <div class="chip-stack">
      <div 
        v-for="(chip, index) in chipDisplay" 
        :key="index"
        class="chip"
        :class="`chip-${chip.name}`"
        :style="{ backgroundColor: chip.color }"
        :title="`$${chip.value}`"
      >
      </div>
    </div>
    <div v-if="showAmount" class="chips-amount">${{ amount }}</div>
  </div>
</template>

<script setup>
import { computed, defineProps } from 'vue'
import { getCompactChipDisplay } from '@/helpers/chips'

const props = defineProps({
  amount: {
    type: Number,
    default: 0
  },
  compact: {
    type: Boolean,
    default: true
  },
  showAmount: {
    type: Boolean,
    default: true
  },
  maxChips: {
    type: Number,
    default: 6
  }
})

const chipDisplay = computed(() => {
  if (props.amount <= 0) return []
  return getCompactChipDisplay(props.amount).slice(0, props.maxChips)
})
</script>

<style lang="scss" scoped>
.poker-chips {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  &.compact {
    gap: 1px;
  }
}

.chip-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px dashed rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  margin-top: -35px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.7);
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.5);
  transition: transform 0.2s ease;

  &:first-child {
    margin-top: 0;
  }

  // Chip colors
  &.chip-white {
    background: linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%);
    border-color: #bdbdbd;
  }

  &.chip-red {
    background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
    border-color: #ffcdd2;
  }

  &.chip-green {
    background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
    border-color: #c8e6c9;
  }

  &.chip-blue {
    background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
    border-color: #bbdefb;
  }

  &.chip-black {
    background: linear-gradient(135deg, #424242 0%, #212121 100%);
    border-color: #9e9e9e;
    color: rgba(255, 255, 255, 0.9);
  }

  &.chip-purple {
    background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
    border-color: #e1bee7;
  }

  &.chip-orange {
    background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    border-color: #ffe0b2;
  }
}

.poker-chips.compact .chip {
  width: 24px;
  height: 24px;
  font-size: 8px;
  border-width: 2px;
  margin-top: -27px;
}

.chips-amount {
  color: white;
  font-size: 14px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 8px;
  border-radius: 4px;
}

.poker-chips.compact .chips-amount {
  font-size: 11px;
  padding: 1px 6px;
}
</style>
