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

/** 開銷金額輸入：完整台幣（非萬位縮寫） */
export function parseExpenseTwdInput(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

/** 開銷金額編輯欄顯示：完整台幣 */
export function formatExpenseTwdInput(value: number): string {
  return String(Math.trunc(value))
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

const TWD_TABLE_COMPACT_UNIT = 10_000
const VN_TABLE_COMPACT_UNIT = 100_000_000

/** 表單 T 輸入：萬位縮寫 → 台幣 */
export function parseTwdTableCompactInput(value: string, allowZero = false): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (Number.isNaN(n) || n < 0 || (!allowZero && n <= 0)) return null
  const compact = Math.round(n * 100) / 100
  return Math.round(compact * TWD_TABLE_COMPACT_UNIT)
}

/** 表單 VN 輸入：億位縮寫 → VN 數量 */
export function parseVnTableCompactInput(value: string, allowZero = false): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (Number.isNaN(n) || n < 0 || (!allowZero && n <= 0)) return null
  const compact = Math.round(n * 10_000) / 10_000
  return Math.round(compact * VN_TABLE_COMPACT_UNIT)
}

export function formatTwdCompactInput(value: number): string {
  return formatTwdTableCompact(value)
}

/** 表單 VN 輸入顯示（不含千分位） */
export function formatVnCompactInput(value: number): string {
  const rounded = roundVnTableCompact(value)
  return rounded.toFixed(4).replace(/\.?0+$/, '')
}

export type ParseAdjustResult = number | 'invalid'

function parseSignedCompactAdjust(
  value: string,
  parseMagnitude: (raw: string, allowZero: boolean) => number | null,
): ParseAdjustResult {
  const trimmed = value.trim()
  if (!trimmed) return 0

  let sign = 1
  let raw = trimmed
  if (raw.startsWith('+')) {
    raw = raw.slice(1).trim()
  } else if (raw.startsWith('-')) {
    sign = -1
    raw = raw.slice(1).trim()
  }
  if (!raw) return 'invalid'

  const magnitude = parseMagnitude(raw, true)
  if (magnitude === null) return 'invalid'
  return sign * magnitude
}

/** 期初 T 增減：支援 +20（萬）格式 */
export function parseTwdAdjustInput(value: string): ParseAdjustResult {
  return parseSignedCompactAdjust(value, parseTwdTableCompactInput)
}

/** 期初 VN 增減：支援 +1.2（億）格式 */
export function parseVnAdjustInput(value: string): ParseAdjustResult {
  return parseSignedCompactAdjust(value, parseVnTableCompactInput)
}

/** 期初 USDT 增減：支援 +1000 格式 */
export function parseUsdtAdjustInput(value: string): ParseAdjustResult {
  const trimmed = value.trim()
  if (!trimmed) return 0

  let sign = 1
  let raw = trimmed
  if (raw.startsWith('+')) {
    raw = raw.slice(1).trim()
  } else if (raw.startsWith('-')) {
    sign = -1
    raw = raw.slice(1).trim()
  }
  if (!raw) return 'invalid'

  const magnitude = Number(raw)
  if (!Number.isFinite(magnitude) || magnitude < 0) return 'invalid'
  return sign * magnitude
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
  return `1 T = ${formatVnTradeRateDisplay(rate)} VN`
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
  return `1 P = ${formatVnTradeRateDisplay(rate)} VN`
}

export function formatVnUsdtCostRateCompact(rate: number): string {
  return `@${formatVnPoolCostRateDisplay(rate)}`
}

export function formatProfit(value: number): string {
  const rounded = roundTwdTableCompact(value)
  if (rounded === 0) return '0'
  const prefix = rounded > 0 ? '+' : '−'
  return `${prefix}${Math.abs(rounded).toFixed(2)}`
}

/** @deprecated 與 formatProfit 相同（萬位縮寫，四捨五入至小數第二位） */
export function formatProfitCompact(value: number): string {
  return formatProfit(value)
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
  })}`
}

export function formatTableDateTime(date: Date): string {
  return formatSettlementDate(date)
}

/** 交易明細日期：僅顯示日（如 7） */
export function formatTransactionTableDate(date: Date): string {
  return String(date.getDate())
}

/** HTML date input（YYYY-MM-DD），本地時區 */
export function todayDateInputValue(): string {
  return dateInputValueFromDate(new Date())
}

/** 交易表單預設日期：當日往前 9 年又 6 個月 */
export function defaultTradeDateInputValue(base: Date = new Date()): string {
  const date = new Date(base)
  date.setFullYear(date.getFullYear() - 9)
  date.setMonth(date.getMonth() - 6)
  return dateInputValueFromDate(date)
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

/** 表單第四格日期顯示：26/07/03 */
export function formatTradeMetaDateDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${match[1].slice(-2)}/${match[2]}/${match[3]}`
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
