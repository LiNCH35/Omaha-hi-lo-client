// Chip denominations with colors
export const CHIP_DENOMINATIONS = [
  { value: 1000, color: '#ff9800', name: 'orange' },
  { value: 500, color: '#9c27b0', name: 'purple' },
  { value: 100, color: '#212121', name: 'black' },
  { value: 50, color: '#2196f3', name: 'blue' },
  { value: 25, color: '#4caf50', name: 'green' },
  { value: 5, color: '#f44336', name: 'red' },
  { value: 1, color: '#ffffff', name: 'white' }
]

/**
 * Calculate optimal chip distribution for a given amount
 * Uses greedy algorithm to minimize number of chips
 */
export function calculateChipDistribution(amount) {
  if (amount <= 0) return []
  
  const distribution = []
  let remaining = amount
  
  for (const chip of CHIP_DENOMINATIONS) {
    while (remaining >= chip.value) {
      const count = Math.floor(remaining / chip.value)
      if (count > 0) {
        distribution.push({
          value: chip.value,
          color: chip.color,
          name: chip.name,
          count: Math.min(count, 5) // Limit max 5 chips of same denomination for display
        })
        remaining -= chip.value * Math.min(count, 5)
      }
      if (remaining < chip.value) break
    }
  }
  
  return distribution
}

/**
 * Get simplified chip representation for compact display
 * Returns array of chips to display (max 5-6 chips total)
 */
export function getCompactChipDisplay(amount) {
  if (amount <= 0) return []
  
  const distribution = []
  let remaining = amount
  let totalChips = 0
  const maxChips = 6
  
  for (const chip of CHIP_DENOMINATIONS) {
    while (remaining >= chip.value && totalChips < maxChips) {
      distribution.push({
        value: chip.value,
        color: chip.color,
        name: chip.name
      })
      remaining -= chip.value
      totalChips++
    }
    if (totalChips >= maxChips) break
  }
  
  return distribution
}

/**
 * Get chip color by value
 */
export function getChipColor(value) {
  const chip = CHIP_DENOMINATIONS.find(c => c.value === value)
  return chip ? chip.color : '#ffd700'
}
