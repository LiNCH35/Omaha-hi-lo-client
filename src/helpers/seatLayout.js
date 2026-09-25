export function getPlayerPosition(index, totalPlayers) {
  const angle = (360 / totalPlayers) * index + 90
  let radius
  if (totalPlayers <= 3) {
    radius = 55
  } else if (totalPlayers <= 6) {
    radius = 58
  } else {
    radius = 62
  }
  const x = 50 + radius * Math.cos(angle * Math.PI / 180)
  const y = 50 + radius * Math.sin(angle * Math.PI / 180)
  return {
    left: `${x}%`,
    top: `${y}%`
  }
}
