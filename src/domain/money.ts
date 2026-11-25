const wholePesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const decimalSeparator =
  new Intl.NumberFormat('en-PH')
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value ?? '.'

export function formatPHP(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new RangeError('Money amounts must be safe integer centavos.')
  }

  const absoluteCentavos = Math.abs(centavos)
  const pesos = Math.floor(absoluteCentavos / 100)
  const fraction = String(absoluteCentavos % 100).padStart(2, '0')
  const parts = wholePesoFormatter.formatToParts(centavos < 0 ? -pesos : pesos)
  const lastIntegerPart = parts.findLastIndex((part) => part.type === 'integer')

  parts.splice(
    lastIntegerPart + 1,
    0,
    { type: 'decimal', value: decimalSeparator },
    { type: 'fraction', value: fraction },
  )

  return parts.map((part) => part.value).join('')
}

export function parsePesoToCentavos(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim())
  if (!match) return null

  const pesos = Number(match[1])
  const centavos = Number((match[2] ?? '').padEnd(2, '0'))
  const amount = pesos * 100 + centavos

  return Number.isSafeInteger(amount) ? amount : null
}

export function sumCentavos(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    const sum = total + amount
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(sum)) {
      throw new RangeError('The total exceeds the safe integer range for centavos.')
    }
    return sum
  }, 0)
}
