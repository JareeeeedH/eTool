import { RATE_DEVIATION_LIMIT_RATIO } from '../constants'
import {
  formatUsdtCostRateDisplay,
  formatVnTradeRateDisplay,
} from './format'

export type RateDeviationLevel = 'ok' | 'confirm'

export interface RateDeviationAssessment {
  level: RateDeviationLevel
  deviationRatio: number
  referenceRate: number
  rate: number
}

export function assessRateDeviation(
  rate: number,
  referenceRate: number | null | undefined,
): RateDeviationAssessment | null {
  if (referenceRate == null || referenceRate <= 0) return null
  if (!Number.isFinite(rate) || rate <= 0) return null

  const deviationRatio = Math.abs(rate - referenceRate) / referenceRate
  if (deviationRatio <= RATE_DEVIATION_LIMIT_RATIO) {
    return { level: 'ok', deviationRatio, referenceRate, rate }
  }
  return { level: 'confirm', deviationRatio, referenceRate, rate }
}

function formatDeviationPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function formatRateForSanity(rate: number, kind: 'usdt' | 'vn'): string {
  return kind === 'usdt' ? formatUsdtCostRateDisplay(rate) : formatVnTradeRateDisplay(rate)
}

export function formatRateDeviationConfirmTitle(kind: 'usdt' | 'vn'): string {
  return kind === 'usdt' ? 'USDT 匯率偏離參考' : 'VN 匯率偏離參考'
}

export function formatRateDeviationConfirmLines(
  assessment: RateDeviationAssessment,
  kind: 'usdt' | 'vn',
): string[] {
  const rateText = formatRateForSanity(assessment.rate, kind)
  const refText = formatRateForSanity(assessment.referenceRate, kind)
  const pct = formatDeviationPercent(assessment.deviationRatio)
  const limitPct = formatDeviationPercent(RATE_DEVIATION_LIMIT_RATIO)
  return [
    `此筆匯率 @${rateText} 偏離參考 @${refText} 約 ${pct}。`,
    `已超過 ±${limitPct}，請確認是否仍要儲存。`,
  ]
}
