import { isDateOnly } from './recurrence.ts'
import type { ForecastScenario } from './forecast.ts'

export interface ForecastPreferences {
  endOn?: string
  startOn?: string
  walletId?: string
  budgetId?: string
  scenario: ForecastScenario
}

export const defaultForecastPreferences: ForecastPreferences = { scenario: 'expected' }

export function readForecastPreferences(value?: string): ForecastPreferences {
  if (!value) return defaultForecastPreferences
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object') throw new Error('Hindi mabasa ang forecast settings.')
  const input = parsed as Partial<ForecastPreferences>
  return {
    endOn: isDateOnly(input.endOn) ? input.endOn : undefined,
    startOn: isDateOnly(input.startOn) ? input.startOn : undefined,
    walletId: typeof input.walletId === 'string' ? input.walletId : undefined,
    budgetId: typeof input.budgetId === 'string' ? input.budgetId : undefined,
    scenario: input.scenario === 'conservative' || input.scenario === 'optimistic' ? input.scenario : 'expected',
  }
}
