<template>
  <div class="chat-log" :class="{ 'minimized': isMinimized }">
    <div class="chat-header" @click="toggleMinimize">
      <span class="chat-title">📋 Лог событий</span>
      <button @click="clearMessages" class="clear-button">Очистить</button>
      <button class="toggle-button">{{ isMinimized ? '▲' : '▼' }}</button>
    </div>
    
    <div v-if="!isMinimized" class="chat-content">
      
      <div class="messages-container" ref="messagesContainer">
        <div 
          v-for="message in messages" 
          :key="message.id" 
          class="message"
          :class="`message-${message.type}`"
        >
          <span class="message-time">{{ message.timestamp }}</span>
          <span class="message-text">{{ message.text }}</span>
        </div>
        
        <div v-if="messages.length === 0" class="empty-message">
          Нет сообщений
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useLoggerStore } from '@/stores/logger'

const loggerStore = useLoggerStore()
const { messages } = storeToRefs(loggerStore)

const isMinimized = ref(false)
const messagesContainer = ref(null)

function toggleMinimize() {
  isMinimized.value = !isMinimized.value
}

function clearMessages() {
  loggerStore.clear()
}

// Auto-scroll to bottom when new messages arrive
watch(messages, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}, { deep: true })
</script>

<style lang="scss" scoped>
.chat-log {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 350px;
  max-height: 200px;
  background: rgba(30, 30, 50, 0.95);
  backdrop-filter: blur(20px);
  border-top-right-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;

  &.minimized {
    max-height: 50px;
  }
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(102, 126, 234, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  border-radius: 0 12px 0 0;

  &:hover {
    background: rgba(102, 126, 234, 0.3);
  }
}

.chat-title {
  color: white;
  font-weight: 600;
  font-size: 14px;
}

.toggle-button {
  background: none;
  border: none;
  color: white;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.chat-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.clear-button {
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.4);
  color: #f44336;
  padding: 4px 8px;
  margin-left: auto;
  margin-right: 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(244, 67, 54, 0.3);
  }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  max-height: 300px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

.message {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  animation: slideIn 0.2s ease;

  &.message-info {
    background: rgba(33, 150, 243, 0.1);
    border-left: 3px solid #2196f3;
  }

  &.message-success {
    background: rgba(76, 175, 80, 0.1);
    border-left: 3px solid #4caf50;
  }

  &.message-warning {
    background: rgba(255, 152, 0, 0.1);
    border-left: 3px solid #ff9800;
  }

  &.message-error {
    background: rgba(244, 67, 54, 0.1);
    border-left: 3px solid #f44336;
  }

  &.message-debug {
    background: rgba(158, 158, 158, 0.1);
    border-left: 3px solid #9e9e9e;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.message-time {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  white-space: nowrap;
  min-width: 60px;
}

.message-text {
  color: rgba(255, 255, 255, 0.9);
  word-break: break-word;
}

.empty-message {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  padding: 20px;
  font-style: italic;
}
</style>
