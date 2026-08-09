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

/** 開銷金額輸入：USDT 正數 */
export function parseExpenseUsdtInput(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** 開銷金額編輯欄顯示：USDT */
export function formatExpenseUsdtInput(value: number): string {
  return (Math.round(value * 100) / 100).toString()
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
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (Number.isNaN(n) || n < 0 || (!allowZero && n <= 0)) return null
  const compact = Math.round(n * 100) / 100
  return Math.round(compact * TWD_TABLE_COMPACT_UNIT)
}

/** 開銷台幣輸入：萬位縮寫 → 台幣（與交易 T 相同） */
export function parseExpenseTwdInput(value: string): number | null {
  return parseTwdTableCompactInput(value)
}

/** 開銷台幣編輯欄顯示：萬位縮寫 */
export function formatExpenseTwdInput(value: number): string {
  return formatTwdTableCompact(value)
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

/**
 * 畫面顯示為 0 的微小負數視為 0。
 * 避免期初 T/VN 因浮點或結算殘值顯示 0.00、實際卻 < 0，進而擋住其他幣別調整。
 */
export function coerceDisplayZeroBalance(
  value: number,
  kind: 'twd' | 'vn' | 'usdt',
): number {
  if (!Number.isFinite(value) || value >= 0) return value >= 0 && Number.isFinite(value) ? value : 0
  if (kind === 'twd' && roundTwdTableCompact(value) === 0) return 0
  if (kind === 'vn' && roundVnTableCompact(value) === 0) return 0
  if (kind === 'usdt' && Math.round(value * 100) / 100 === 0) return 0
  return value
}

/** 產生可把目前 T 現金歸零的期初調整字串（精確萬位，不四捨五入到小數第二位） */
export function formatTwdAdjustToZero(liveTwd: number): string {
  const value = coerceDisplayZeroBalance(liveTwd, 'twd')
  if (value <= 0) return ''
  // 1 元 = 0.0001 萬；保留到小數第四位，儲存後可還原成精確台幣
  const wan = (value / TWD_TABLE_COMPACT_UNIT).toFixed(4).replace(/\.?0+$/, '')
  return `-${wan}`
}

/** 期初 T 增減幅度：萬位 → 台幣（保留輸入精度，供歸零精確扣盡） */
function parseTwdAdjustMagnitude(raw: string, allowZero: boolean): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (Number.isNaN(n) || n < 0 || (!allowZero && n <= 0)) return null
  return Math.round(n * TWD_TABLE_COMPACT_UNIT)
}

/** 期初 T 增減：支援 +20（萬）格式 */
export function parseTwdAdjustInput(value: string): ParseAdjustResult {
  return parseSignedCompactAdjust(value, parseTwdAdjustMagnitude)
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

/** VN 成交匯率：四捨五入至小數第二位 */
export function roundVnTradeRate(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatVnTradeRateDisplay(value: number): string {
  return roundVnTradeRate(value).toFixed(2)
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

/** VN 池成本：四捨五入至小數第二位（1 NTD = ? VN／1 USDT = ? VN） */
export function roundVnPoolCostRate(value: number): number {
  return Math.round(value * 100) / 100
}

/** VN 池成本 @ 顯示：四捨五入至小數第二位 */
export function formatVnPoolCostRateDisplay(value: number): string {
  return roundVnPoolCostRate(value).toFixed(2)
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

/**
 * 分項先各自萬位四捨五入再加總（已是萬位小數）。
 * 避免畫面「P +0.64、VN +5.34，合計卻 +5.97」這類各自 round 不一致。
 */
export function sumRoundedProfitParts(
  ...parts: Array<number | null | undefined>
): number {
  let sum = 0
  for (const part of parts) {
    if (part == null || !Number.isFinite(part)) continue
    sum += roundTwdTableCompact(part)
  }
  return Math.round(sum * 100) / 100
}

/** 合計顯示用：與畫面上已顯示的分項加總一致 */
export function formatProfitFromParts(
  ...parts: Array<number | null | undefined>
): string {
  const sum = sumRoundedProfitParts(...parts)
  if (sum === 0) return '0'
  const prefix = sum > 0 ? '+' : '−'
  return `${prefix}${Math.abs(sum).toFixed(2)}`
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
  const day = String(date.getDate())
  const time = date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${day} ${time}`
}

/** SET 日結列表：只顯示結帳「日」（如 3），不顯示時間 */
export function formatSettlementDayLabel(
  dateLabel: string,
  settledAt?: Date,
): string {
  const match = /^(\d{1,2})\b/.exec(dateLabel.trim())
  if (match) return match[1]
  if (settledAt) return String(settledAt.getDate())
  return dateLabel.trim() || '—'
}

/** 日結標籤：帳務日的「日」+ 當下時間 */
export function formatSettlementDateTimeForBusinessDate(
  businessDate: string,
  now: Date = new Date(),
): string {
  const dayDate = isValidDateInputValue(businessDate)
    ? timestampFromDateInput(businessDate, now)
    : now
  return formatSettlementDateTime(dayDate)
}

export function formatTableDateTime(date: Date): string {
  return formatSettlementDate(date)
}

/** 交易明細日期：僅顯示日（如 11） */
export function formatTransactionTableDate(date: Date): string {
  return String(date.getDate())
}

/** 列表用交易日：優先 tradeDate，舊資料回退 timestamp */
export function resolveTradeDate(
  tx: { tradeDate?: string; timestamp: Date },
): string {
  if (tx.tradeDate && isValidDateInputValue(tx.tradeDate)) return tx.tradeDate
  return dateInputValueFromDate(tx.timestamp)
}

/** 交易明細列表顯示日（依 tradeDate） */
export function formatTradeListDate(tx: {
  tradeDate?: string
  timestamp: Date
}): string {
  return formatTradeMetaDateDisplay(resolveTradeDate(tx))
}

/** 列表排序：交易日新→舊，同日再依 timestamp 新→舊 */
export function compareTradeListOrder(
  a: { tradeDate?: string; timestamp: Date },
  b: { tradeDate?: string; timestamp: Date },
): number {
  const byDate = resolveTradeDate(b).localeCompare(resolveTradeDate(a))
  if (byDate !== 0) return byDate
  return b.timestamp.getTime() - a.timestamp.getTime()
}

/** HTML date input（YYYY-MM-DD），本地時區 */
export function todayDateInputValue(): string {
  return dateInputValueFromDate(new Date())
}

/** 交易表單預設日期：今天（本地） */
export function defaultTradeDateInputValue(base: Date = new Date()): string {
  return dateInputValueFromDate(base)
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

/** 表單第四格日期顯示：僅日（如 11） */
export function formatTradeMetaDateDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return String(Number(match[3]))
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

/**
 * 新增交易時間戳（庫存／結帳計算用）：
 * - 盡量用所選日 + 當下時刻
 * - 但必須晚於所有既有流水，避免補登舊日掉到結帳線之前、水位不算進去
 * 畫面日期請另存 tradeDate。
 */
export function timestampForNewTrade(
  dateStr: string,
  existingTimestamps: Iterable<Date>,
  timeSource: Date = new Date(),
): Date {
  const base = timestampFromDateInput(dateStr, timeSource)
  let latestOverall = Number.NEGATIVE_INFINITY
  for (const ts of existingTimestamps) {
    const t = ts.getTime()
    if (t > latestOverall) latestOverall = t
  }
  if (!Number.isFinite(latestOverall)) return base
  if (base.getTime() > latestOverall) return base
  return new Date(latestOverall + 1)
}

/**
 * 編輯交易日：在不早於結帳線的前提下，盡量把 timestamp 也改到所選日。
 * 若所選日早於結帳，保留原 timestamp（靠 tradeDate 顯示），避免水位被踢出。
 */
export function timestampForEditedTrade(
  dateStr: string,
  previousTimestamp: Date,
  lastTradeSettledAt: Date | null,
): Date {
  const base = timestampFromDateInput(dateStr, previousTimestamp)
  if (!lastTradeSettledAt) return base
  if (base.getTime() > lastTradeSettledAt.getTime()) return base
  return previousTimestamp.getTime() > lastTradeSettledAt.getTime()
    ? previousTimestamp
    : new Date(lastTradeSettledAt.getTime() + 1)
}

/**
 * 日結封存用日期：優先 dateLabel 的帳務「日」，再對齊 settledAt 的年月。
 * 例：實際結算 8/1、標籤「31 14:12」→ 7/31。
 */
export function resolveSettlementArchiveDate(item: {
  settledAt: Date
  dateLabel: string
}): Date {
  const settled = item.settledAt
  const match = /^(\d{1,2})\s+\d{1,2}:\d{2}/.exec(item.dateLabel.trim())
  if (!match) return new Date(settled)
  const day = Number(match[1])
  if (!Number.isFinite(day) || day < 1 || day > 31) return new Date(settled)

  let y = settled.getFullYear()
  let m = settled.getMonth()
  if (day > settled.getDate()) {
    m -= 1
    if (m < 0) {
      m = 11
      y -= 1
    }
  }
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  if (day > daysInMonth) return new Date(settled)
  return new Date(
    y,
    m,
    day,
    settled.getHours(),
    settled.getMinutes(),
    settled.getSeconds(),
    settled.getMilliseconds(),
  )
}

export function formatArchiveDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  const startLabel = formatSettlementDate(start)
  const endLabel = formatSettlementDate(end)
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
}
