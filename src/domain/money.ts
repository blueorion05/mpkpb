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
  const text = value.trim()
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text.startsWith('.') && text.length > 1 ? '0' + text : text)
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

export function balanceAdjustment(recordedCentavos: number, actualCentavos: number) {
  return sumCentavos([actualCentavos, -recordedCentavos])
}

export function netMoneyCentavos(walletTotalCentavos: number, outstandingCentavos: number) {
  return sumCentavos([walletTotalCentavos, -outstandingCentavos])
}

export function isMoneyInputDraft(value: string, allowNegative = false): boolean {
  const magnitude = allowNegative && value.startsWith('-') ? value.slice(1) : value
  if (!magnitude) return value === '' || (allowNegative && value === '-')
  return magnitude === '.' ||
    (/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(magnitude) && parsePesoToCentavos(magnitude) !== null)
}

export function moneyPasteText(value: string): string {
  const text = value.trim()
  if (/^-?\s*₱?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{0,2})?$/.test(text)) {
    return text.replace(/[\s₱,]/g, '')
  }
  return text
}
