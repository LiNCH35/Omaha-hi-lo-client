const LOG_PREFIX = '[POKER-DEBUG]'
const LOG_STORAGE_KEY = 'pokerDebugLog'
const ENABLED_KEY = 'pokerDebugEnabled'
const MAX_LOG_ENTRIES = 300

function isDebugEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'false'
  } catch (error) {
    return false
  }
}

export function debugLog(event, details = {}) {
  if (!isDebugEnabled()) {
    return null
  }
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
    stack: new Error().stack
  }
  try {
    console.log(`${LOG_PREFIX} ${event}`, details)
    // console.log(entry.stack)
  } catch (error) {
    void error
  }
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY)
    const log = raw ? JSON.parse(raw) : []
    log.push(entry)
    while (log.length > MAX_LOG_ENTRIES) {
      log.shift()
    }
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(log))
  } catch (error) {
    void error
  }
  return entry
}

export function getDebugLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_STORAGE_KEY) || '[]')
  } catch (error) {
    return []
  }
}

export function clearDebugLog() {
  try {
    localStorage.removeItem(LOG_STORAGE_KEY)
  } catch (error) {
    void error
  }
}

export function setDebugEnabled(enabled) {
  try {
    localStorage.setItem(ENABLED_KEY, String(enabled))
  } catch (error) {
    void error
  }
}

if (typeof window !== 'undefined') {
  window.__pokerDebug = {
    debugLog,
    getDebugLog,
    clearDebugLog,
    setDebugEnabled
  }
}
