<template>
  <div class="room">
    <SettingsMenu />
    <GameBoard />
    <ActionBar />
    <ChatLog />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useGameStore } from '@/stores/game'
import SettingsMenu from './SettingsMenu'
import GameBoard from './GameBoard'
import ActionBar from './ActionBar'
import ChatLog from './ChatLog'

const store = useGameStore()

onMounted(() => {
  store.loadSettings('Table.onMounted')
})
</script>

<style lang="scss" scoped>
.room {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}
</style>
