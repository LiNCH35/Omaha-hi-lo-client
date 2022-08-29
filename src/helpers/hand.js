export default function getHandHash(array) {
  return array.sort(function (a, b) {
    const intA = parseInt(a)
    const intB = parseInt(b)
    if (intA > intB) {
      return 1;
    }
    if (intA < intB) {
      return -1;
    }
    // a должно быть равным b
    return 0
  }).join('')
}