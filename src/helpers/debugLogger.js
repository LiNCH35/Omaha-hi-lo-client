import { useLoggerStore } from '@/stores/logger'

let loggerStore = null

function getLoggerStore() {
  if (!loggerStore) {
    try {
      loggerStore = useLoggerStore()
    } catch (error) {
      // Store might not be initialized yet
      console.warn('Logger store not available yet:', error)
    }
  }
  return loggerStore
}

export function debugLog(event, details = {}) {
  // Debug events stay in the console only - the chat log shows info and above
  console.log(`[POKER-DEBUG] ${event}`, details)
  return { event, details, timestamp: new Date().toISOString() }
}

export function infoLog(message, details = {}) {
  const logger = getLoggerStore()
  
  const formattedMessage = `${message}${Object.keys(details).length > 0 ? ': ' + JSON.stringify(details) : ''}`
  
  console.log(`[POKER-INFO] ${message}`, details)
  
  if (logger) {
    logger.info(formattedMessage)
  }
  
  return { message, details, timestamp: new Date().toISOString() }
}

export function successLog(message, details = {}) {
  const logger = getLoggerStore()
  
  const formattedMessage = `${message}${Object.keys(details).length > 0 ? ': ' + JSON.stringify(details) : ''}`
  
  console.log(`[POKER-SUCCESS] ${message}`, details)
  
  if (logger) {
    logger.success(formattedMessage)
  }
  
  return { message, details, timestamp: new Date().toISOString() }
}

export function warningLog(message, details = {}) {
  const logger = getLoggerStore()
  
  const formattedMessage = `${message}${Object.keys(details).length > 0 ? ': ' + JSON.stringify(details) : ''}`
  
  console.warn(`[POKER-WARNING] ${message}`, details)
  
  if (logger) {
    logger.warning(formattedMessage)
  }
  
  return { message, details, timestamp: new Date().toISOString() }
}

export function errorLog(message, details = {}) {
  const logger = getLoggerStore()
  
  const formattedMessage = `${message}${Object.keys(details).length > 0 ? ': ' + JSON.stringify(details) : ''}`
  
  console.error(`[POKER-ERROR] ${message}`, details)
  
  if (logger) {
    logger.error(formattedMessage)
  }
  
  return { message, details, timestamp: new Date().toISOString() }
}

// Export legacy functions for backward compatibility
export function getDebugLog() {
  const logger = getLoggerStore()
  return logger ? logger.messages : []
}

export function clearDebugLog() {
  const logger = getLoggerStore()
  if (logger) {
    logger.clear()
  }
}

if (typeof window !== 'undefined') {
  window.__pokerDebug = {
    debugLog,
    infoLog,
    successLog,
    warningLog,
    errorLog,
    getDebugLog,
    clearDebugLog
  }
}
