import type { ExpenseType } from '../types'
import { EXPENSE_TYPE_OPTIONS } from '../constants'

export function expenseTypeLabel(type: ExpenseType): string {
  return EXPENSE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type
}

export function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW', {
    maximumFractionDigits: 2,
  })
}

export function assetCode(currency: 'twd' | 'usdt'): 'T' | 'E' {
  return currency === 'usdt' ? 'E' : 'T'
}

/** 大數字緊湊顯示（如 VN 庫存）：億 / 萬 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  const n = Math.abs(value)

  if (abs >= 100_000_000) {
    const yi = n / 100_000_000
    return `${sign}${yi.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}億`
  }
  if (abs >= 10_000) {
    const wan = n / 10_000
    return `${sign}${wan.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}萬`
  }
  return formatNumber(value)
}

export function floorTwd(value: number): number {
  return Math.trunc(value)
}

export function roundTwd(value: number): number {
  return Math.round(value)
}

export function formatTwd(value: number): string {
  return floorTwd(value).toLocaleString('zh-TW', {
    maximumFractionDigits: 0,
  })
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatRateDisplay(value: number): string {
  return roundMoney(value).toFixed(2)
}

/** VN 成交匯率：四捨五入至小數第一位 */
export function roundVnTradeRate(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatVnTradeRateDisplay(value: number): string {
  return roundVnTradeRate(value).toFixed(1)
}

/** USDT 匯率（TWD/USDT）：四捨五入至小數第三位 */
export function roundUsdtCostRate(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** USDT 成交匯率（TWD/USDT）顯示：四捨五入至小數第三位 */
export function formatUsdtTradeRateDisplay(value: number): string {
  return roundUsdtCostRate(value).toFixed(3)
}

/** USDT 成本均價（TWD/USDT）顯示：四捨五入至小數第三位 */
export function formatUsdtCostRateDisplay(value: number): string {
  return formatUsdtTradeRateDisplay(value)
}

export function formatVnNtdCostRate(rate: number): string {
  return `1 NTD = ${formatVnTradeRateDisplay(rate)} VN`
}

/** VN 池成本：四捨五入至小數第一位（1 NTD = ? VN） */
export function roundVnPoolCostRate(value: number): number {
  return Math.round(value * 10) / 10
}

/** VN 池成本 @ 顯示：四捨五入至小數第一位 */
export function formatVnPoolCostRateDisplay(value: number): string {
  return roundVnPoolCostRate(value).toFixed(1)
}

export function formatVnNtdCostRateCompact(rate: number): string {
  return `@${formatVnPoolCostRateDisplay(rate)}`
}

export function formatVnUsdtCostRate(rate: number): string {
  return `1 U = ${formatVnTradeRateDisplay(rate)} VN`
}

export function formatVnUsdtCostRateCompact(rate: number): string {
  return `@${formatVnPoolCostRateDisplay(rate)}`
}

export function formatProfit(value: number): string {
  const rounded = roundTwd(value)
  const prefix = rounded > 0 ? '+' : ''
  return `${prefix}${rounded.toLocaleString('zh-TW', {
    maximumFractionDigits: 0,
  })}`
}

/** 利潤率（相對成本），四捨五入至小數第 2 位 */
export function formatProfitMarginPercent(profit: number, costBasis: number): string | null {
  if (!Number.isFinite(costBasis) || costBasis <= 0) return null
  const pct = Math.round((profit / costBasis) * 10000) / 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function profitColorClass(value: number): string {
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-500'
}

export function formatSettlementDate(date: Date): string {
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatSettlementDateTime(date: Date): string {
  return `${formatSettlementDate(date)} ${date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} 結算`
}

export function formatTableDateTime(date: Date): string {
  return formatSettlementDate(date)
}

export function formatArchiveDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  const startLabel = formatSettlementDate(start)
  const endLabel = formatSettlementDate(end)
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
}
