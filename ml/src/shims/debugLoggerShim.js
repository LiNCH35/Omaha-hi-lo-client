const verbose = process.env.POKER_ML_VERBOSE === '1'

export function debugLog(event, details = {}) {
  if (verbose) {
    console.log(`[POKER-DEBUG] ${event}`, details)
  }
  return { event, details, timestamp: new Date().toISOString() }
}

export function infoLog(message, details = {}) {
  if (verbose) {
    console.log(`[POKER-INFO] ${message}`, details)
  }
  return { message, details, timestamp: new Date().toISOString() }
}

export function successLog(message, details = {}) {
  if (verbose) {
    console.log(`[POKER-SUCCESS] ${message}`, details)
  }
  return { message, details, timestamp: new Date().toISOString() }
}

export function warningLog(message, details = {}) {
  if (verbose) {
    console.warn(`[POKER-WARNING] ${message}`, details)
  }
  return { message, details, timestamp: new Date().toISOString() }
}

export function errorLog(message, details = {}) {
  console.error(`[POKER-ERROR] ${message}`, details)
  return { message, details, timestamp: new Date().toISOString() }
}

export function getDebugLog() {
  return []
}

export function clearDebugLog() {}
