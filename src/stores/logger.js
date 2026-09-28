import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useLoggerStore = defineStore('logger', () => {
  const messages = ref([])
  const maxMessages = 100

  function addMessage(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
    
    messages.value.push({
      id: Date.now() + Math.random(),
      text: message,
      type,
      timestamp
    })

    // Keep only the last maxMessages
    if (messages.value.length > maxMessages) {
      messages.value = messages.value.slice(-maxMessages)
    }
  }

  function info(message) {
    addMessage(message, 'info')
  }

  function success(message) {
    addMessage(message, 'success')
  }

  function warning(message) {
    addMessage(message, 'warning')
  }

  function error(message) {
    addMessage(message, 'error')
  }

  function debug(message) {
    addMessage(message, 'debug')
  }

  function clear() {
    messages.value = []
  }

  return {
    messages,
    addMessage,
    info,
    success,
    warning,
    error,
    debug,
    clear
  }
})
