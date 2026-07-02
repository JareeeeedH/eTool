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

export function assetCode(currency: 'twd' | 'usdt'): 'T' | 'P' {
  return currency === 'usdt' ? 'P' : 'T'
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

/** T 欄縮寫（總覽／交易明細）：以萬為單位，四捨五入至小數第二位 */
export function roundTwdTableCompact(value: number): number {
  return Math.round((value / 10_000) * 100) / 100
}

export function formatTwdTableCompact(value: number): string {
  return roundTwdTableCompact(value).toFixed(2)
}

/** VN 欄縮寫（總覽／交易明細）：以億為單位，四捨五入至小數第四位 */
export function roundVnTableCompact(value: number): number {
  return Math.round((value / 100_000_000) * 10_000) / 10_000
}

export function formatVnTableCompact(value: number): string {
  const rounded = roundVnTableCompact(value)
  return rounded.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
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

/** 交易明細日期：英文月/日（如 Jul 2） */
export function formatTransactionTableDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** HTML date input（YYYY-MM-DD），本地時區 */
export function todayDateInputValue(): string {
  return dateInputValueFromDate(new Date())
}

export function dateInputValueFromDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isValidDateInputValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return dateInputValueFromDate(timestampFromDateInput(value)) === value
}

/** 將 date input 與既有時間（或現在）合併為 timestamp */
export function timestampFromDateInput(dateStr: string, timeSource: Date = new Date()): Date {
  const [y, m, d] = dateStr.split('-').map((part) => Number(part))
  if (!y || !m || !d) return new Date(timeSource)
  return new Date(
    y,
    m - 1,
    d,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds(),
  )
}

export function formatArchiveDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  const startLabel = formatSettlementDate(start)
  const endLabel = formatSettlementDate(end)
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
}
