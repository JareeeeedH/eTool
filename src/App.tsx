import { useEffect, useMemo, useRef, useState } from 'react'
import { loadPersistedAppState, savePersistedAppState } from './persistence'

type TransactionType = 'buy' | 'sell'
type EditingCategory = TransactionType | 'vn_twd'
type FiatCurrency = 'twd' | 'vn'

interface UsdtTransaction {
  id: string
  timestamp: Date
  category: 'usdt'
  type: TransactionType
  fiatCurrency: FiatCurrency
  usdtAmount: number
  fiatAmount: number
  /** 匯率 = 法幣金額 / USDT 金額 */
  rate: number
}

interface VnTwdTransaction {
  id: string
  timestamp: Date
  category: 'vn_twd'
  vnAmount: number
  twdAmount: number
  /** 匯率 = VN / TWD（每 1 台幣所需 VN） */
  rate: number
}

type Transaction = UsdtTransaction | VnTwdTransaction

function isUsdtTransaction(tx: Transaction): tx is UsdtTransaction {
  return tx.category === 'usdt'
}

function isVnTwdTransaction(tx: Transaction): tx is VnTwdTransaction {
  return tx.category === 'vn_twd'
}

interface DailySettlement {
  id: string
  settledAt: Date
  dateLabel: string
  twdBalance: number
  usdtBalance: number
  vnBalance: number
  /** 結算當下 USDT 總庫存加權成本均價 */
  usdtInventoryAvgTwd: number | null
  usdtInventoryAvgVn: number | null
  /** 當日買入加權均價 */
  dayBuyAvgTwd: number | null
  dayBuyAvgVn: number | null
  /** 結算當下帳面總資產（TWD 計價） */
  totalAssetsTwd: number
  totalAssetsTwdCash: number
  totalAssetsUsdtInTwd: number | null
  totalAssetsVnInTwd: number | null
  /** 當日 VN/TWD 均價（換算 VN 庫存用） */
  dayVnTwdRate: number | null
  totalAssetsComplete: boolean
  totalAssetsMissingNotes: string
  transactionCount: number
}

type PageTab = 'daily' | 'settlements'

const INITIAL_TWD = 5_000_000
const INITIAL_USDT = 0
const INITIAL_VN = 0

interface Balances {
  twd: number
  usdt: number
  vn: number
}

const INITIAL_BALANCES: Balances = {
  twd: INITIAL_TWD,
  usdt: INITIAL_USDT,
  vn: INITIAL_VN,
}

/** USDT 總庫存加權成本均價（分 TWD / VN 計價） */
interface UsdtInventoryCost {
  twd: number | null
  vn: number | null
}

const EMPTY_USDT_COST: UsdtInventoryCost = { twd: null, vn: null }

/** 帳面總資產（TWD 主帳）換算結果 */
interface TotalAssetsTwd {
  twdCash: number
  usdtInTwd: number | null
  vnInTwd: number | null
  dayVnTwdRate: number | null
  total: number
  isComplete: boolean
  missingNotes: string[]
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW', {
    maximumFractionDigits: 2,
  })
}

function calculateRate(fiatAmount: number, usdtAmount: number): number {
  if (usdtAmount <= 0) return 0
  return fiatAmount / usdtAmount
}

function parsePositive(value: string): number | null {
  const n = parseFloat(value)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

function formatFiatInput(value: number): string {
  return String(Math.round(value))
}

function formatRateCalc(value: number): string {
  return String(value)
}

/** 匯率 / 均價顯示：小數第三位（計算仍用完整精度） */
function formatRateDisplay(value: number): string {
  return value.toFixed(3)
}

interface ConfirmDialogState {
  title: string
  lines: string[]
  confirmLabel: string
  variant: 'danger' | 'primary'
  alertOnly?: boolean
  onConfirm: () => void
}

interface ConfirmModalProps {
  dialog: ConfirmDialogState | null
  onCancel: () => void
}

function ConfirmModal({ dialog, onCancel }: ConfirmModalProps) {
  if (!dialog) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">
          {dialog.title}
        </h2>
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          {dialog.lines.map((line, i) =>
            line === '' ? (
              <div key={i} className="h-1" />
            ) : (
              <p key={i}>{line}</p>
            ),
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {!dialog.alertOnly && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={dialog.onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
              dialog.variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditingBanner({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-medium">{label}</span>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        取消編輯
      </button>
    </div>
  )
}

function formatUsdtInput(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

interface VnTwdFormValues {
  vn: string
  twd: string
  rate: string
}

/** 三方互相計算：VN = TWD × 匯率；匯率 = VN / TWD */
function syncVnTwdFormFields(
  field: 'vn' | 'twd' | 'rate',
  value: string,
  current: VnTwdFormValues,
): VnTwdFormValues {
  const next: VnTwdFormValues = {
    vn: field === 'vn' ? value : current.vn,
    twd: field === 'twd' ? value : current.twd,
    rate: field === 'rate' ? value : current.rate,
  }

  const vn = parsePositive(next.vn)
  const twd = parsePositive(next.twd)
  const rate = parsePositive(next.rate)

  switch (field) {
    case 'vn':
      if (vn && rate) {
        next.twd = formatFiatInput(vn / rate)
      } else if (vn && twd) {
        next.rate = formatRateCalc(vn / twd)
      }
      break
    case 'rate':
      if (twd && rate) {
        next.vn = formatFiatInput(twd * rate)
      } else if (rate && vn) {
        next.twd = formatFiatInput(vn / rate)
      }
      break
    case 'twd':
      if (twd && rate) {
        next.vn = formatFiatInput(twd * rate)
      } else if (twd && vn) {
        next.rate = formatRateCalc(vn / twd)
      }
      break
  }

  return next
}

function calculateVnTwdRate(vnAmount: number, twdAmount: number): number {
  if (twdAmount <= 0) return 0
  return vnAmount / twdAmount
}

function calculateVnTwdDayAverageRate(transactions: VnTwdTransaction[]): number | null {
  const totalTwd = transactions.reduce((sum, tx) => sum + tx.twdAmount, 0)
  if (totalTwd <= 0) return null

  const totalVn = transactions.reduce((sum, tx) => sum + tx.vnAmount, 0)
  return totalVn / totalTwd
}

/**
 * 帳面總資產（TWD）= TWD 現金 + USDT×整池TWD成本 + VN÷當日V/T均價
 * VN 換算 strictly 使用當日 V 換 T 加權均價
 */
function computeTotalAssetsTwd(
  balances: Balances,
  inventoryCost: UsdtInventoryCost,
  vnTwdTransactions: VnTwdTransaction[],
): TotalAssetsTwd {
  const twdCash = balances.twd
  const missingNotes: string[] = []
  const dayVnTwdRate = calculateVnTwdDayAverageRate(vnTwdTransactions)

  let usdtInTwd: number | null = null
  if (balances.usdt <= 0) {
    usdtInTwd = 0
  } else if (inventoryCost.twd !== null) {
    usdtInTwd = balances.usdt * inventoryCost.twd
  } else if (inventoryCost.vn !== null && dayVnTwdRate !== null) {
    usdtInTwd = (balances.usdt * inventoryCost.vn) / dayVnTwdRate
  } else {
    missingNotes.push('USDT 無 TWD 成本')
  }

  let vnInTwd: number | null = null
  if (balances.vn <= 0) {
    vnInTwd = 0
  } else if (dayVnTwdRate !== null) {
    vnInTwd = balances.vn / dayVnTwdRate
  } else {
    missingNotes.push('VN 當日無 V/T 匯率')
  }

  const total = twdCash + (usdtInTwd ?? 0) + (vnInTwd ?? 0)
  const isComplete =
    (balances.usdt <= 0 || usdtInTwd !== null) &&
    (balances.vn <= 0 || vnInTwd !== null)

  return {
    twdCash,
    usdtInTwd,
    vnInTwd,
    dayVnTwdRate,
    total,
    isComplete,
    missingNotes,
  }
}

function settlementFromTotalAssets(assets: TotalAssetsTwd): Pick<
  DailySettlement,
  | 'totalAssetsTwd'
  | 'totalAssetsTwdCash'
  | 'totalAssetsUsdtInTwd'
  | 'totalAssetsVnInTwd'
  | 'dayVnTwdRate'
  | 'totalAssetsComplete'
  | 'totalAssetsMissingNotes'
> {
  return {
    totalAssetsTwd: assets.total,
    totalAssetsTwdCash: assets.twdCash,
    totalAssetsUsdtInTwd: assets.usdtInTwd,
    totalAssetsVnInTwd: assets.vnInTwd,
    dayVnTwdRate: assets.dayVnTwdRate,
    totalAssetsComplete: assets.isComplete,
    totalAssetsMissingNotes: assets.missingNotes.join('；'),
  }
}

function totalAssetsFromSettlement(item: DailySettlement): TotalAssetsTwd {
  return {
    twdCash: item.totalAssetsTwdCash,
    usdtInTwd: item.totalAssetsUsdtInTwd,
    vnInTwd: item.totalAssetsVnInTwd,
    dayVnTwdRate: item.dayVnTwdRate,
    total: item.totalAssetsTwd,
    isComplete: item.totalAssetsComplete,
    missingNotes: item.totalAssetsMissingNotes
      ? item.totalAssetsMissingNotes.split('；').filter(Boolean)
      : [],
  }
}

interface FormValues {
  usdt: string
  fiat: string
  rate: string
}

/** 三方互相計算：法幣 = USDT × 匯率 */
function syncFormFields(
  field: 'usdt' | 'fiat' | 'rate',
  value: string,
  current: FormValues,
): FormValues {
  const next: FormValues = {
    usdt: field === 'usdt' ? value : current.usdt,
    fiat: field === 'fiat' ? value : current.fiat,
    rate: field === 'rate' ? value : current.rate,
  }

  const usdt = parsePositive(next.usdt)
  const fiat = parsePositive(next.fiat)
  const rate = parsePositive(next.rate)

  switch (field) {
    case 'usdt':
      if (usdt && rate) {
        next.fiat = formatFiatInput(usdt * rate)
      } else if (usdt && fiat) {
        next.rate = formatRateCalc(fiat / usdt)
      }
      break
    case 'rate':
      if (usdt && rate) {
        next.fiat = formatFiatInput(usdt * rate)
      } else if (rate && fiat) {
        next.usdt = formatUsdtInput(fiat / rate)
      }
      break
    case 'fiat':
      if (usdt && fiat) {
        next.rate = formatRateCalc(fiat / usdt)
      } else if (rate && fiat) {
        next.usdt = formatUsdtInput(fiat / rate)
      }
      break
  }

  return next
}

function calculateAverageRate(
  transactions: UsdtTransaction[],
  currency: FiatCurrency,
): number | null {
  const filtered = transactions.filter((tx) => tx.fiatCurrency === currency)
  const totalUsdt = filtered.reduce((sum, tx) => sum + tx.usdtAmount, 0)
  if (totalUsdt <= 0) return null

  const totalFiat = filtered.reduce((sum, tx) => sum + tx.fiatAmount, 0)
  return totalFiat / totalUsdt
}

/** 當日買入紀錄均價 */
function calculateBuyDayAverageRate(
  transactions: UsdtTransaction[],
  currency: FiatCurrency,
): number | null {
  const filtered = transactions.filter(
    (tx) => tx.type === 'buy' && tx.fiatCurrency === currency,
  )
  const totalUsdt = filtered.reduce((sum, tx) => sum + tx.usdtAmount, 0)
  if (totalUsdt <= 0) return null

  const totalFiat = filtered.reduce((sum, tx) => sum + tx.fiatAmount, 0)
  return totalFiat / totalUsdt
}

/**
 * 計算 USDT 總庫存加權成本均價
 * 延續前次結算成本，並納入當日買入；賣出時依比例扣減成本
 */
function computeInventoryCost(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): UsdtInventoryCost {
  let usdtQty = openingBalances.usdt
  let twdCostTotal = (openingCost.twd ?? 0) * usdtQty
  let vnCostTotal = (openingCost.vn ?? 0) * usdtQty

  if (usdtQty <= 0) {
    twdCostTotal = 0
    vnCostTotal = 0
  }

  const sorted = transactions.filter(isUsdtTransaction).sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (tx.type === 'buy') {
      usdtQty += tx.usdtAmount
      if (tx.fiatCurrency === 'twd') {
        twdCostTotal += tx.fiatAmount
      } else {
        vnCostTotal += tx.fiatAmount
      }
    } else {
      if (usdtQty <= 0) continue

      const sellRatio = Math.min(tx.usdtAmount / usdtQty, 1)
      twdCostTotal *= 1 - sellRatio
      vnCostTotal *= 1 - sellRatio
      usdtQty -= tx.usdtAmount

      if (usdtQty <= 0) {
        usdtQty = 0
        twdCostTotal = 0
        vnCostTotal = 0
      }
    }
  }

  return {
    twd: usdtQty > 0 && twdCostTotal > 0 ? twdCostTotal / usdtQty : null,
    vn: usdtQty > 0 && vnCostTotal > 0 ? vnCostTotal / usdtQty : null,
  }
}

function formatSettlementDate(date: Date): string {
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
  })
}

function getBusinessDayLabel(transactions: Transaction[]): string {
  if (transactions.length > 0) {
    const earliest = [...transactions].reduce((min, tx) =>
      tx.timestamp.getTime() < min.timestamp.getTime() ? tx : min,
    )
    return formatSettlementDate(earliest.timestamp)
  }
  return formatSettlementDate(new Date())
}

function buildDeleteConfirmLines(tx: Transaction): string[] {
  if (isVnTwdTransaction(tx)) {
    return [
      '類型：VN 換 TWD',
      `VN：${formatNumber(tx.vnAmount)}`,
      `TWD：${formatNumber(tx.twdAmount)}`,
      `匯率 (VN/TWD)：${formatRateDisplay(tx.rate)}`,
    ]
  }

  const typeLabel = tx.type === 'buy' ? '買入' : '賣出'
  const currencyLabel = tx.fiatCurrency === 'twd' ? 'TWD' : 'VN'
  const rateUnit = tx.fiatCurrency === 'twd' ? 'TWD/USDT' : 'VN/USDT'
  return [
    `類型：${typeLabel}（${currencyLabel}）`,
    `USDT：${formatNumber(tx.usdtAmount)}`,
    `金額：${formatNumber(tx.fiatAmount)}`,
    `匯率 (${rateUnit})：${formatRateDisplay(tx.rate)}`,
  ]
}

function buildSettleConfirmLines(
  transactions: Transaction[],
  balances: Balances,
  inventoryCost: UsdtInventoryCost,
): string[] {
  const buyCount = transactions.filter((tx) => isUsdtTransaction(tx) && tx.type === 'buy').length
  const sellCount = transactions.filter((tx) => isUsdtTransaction(tx) && tx.type === 'sell').length
  const vnTwdCount = transactions.filter(isVnTwdTransaction).length
  const vnTwdTxs = transactions.filter(isVnTwdTransaction)
  const assets = computeTotalAssetsTwd(balances, inventoryCost, vnTwdTxs)
  return [
    `交易筆數：${transactions.length}（買 ${buyCount} / 賣 ${sellCount}${
      vnTwdCount > 0 ? ` / VN換TWD ${vnTwdCount}` : ''
    }）`,
    `台幣庫存：${formatNumber(balances.twd)}`,
    `USDT 庫存：${formatNumber(balances.usdt)}${
      balances.usdt > 0 && inventoryCost.twd !== null
        ? `（@${formatRateDisplay(inventoryCost.twd)}）`
        : ''
    }`,
    `VN 庫存：${formatNumber(balances.vn)}`,
    `帳面總資產：${formatNumber(assets.total)} TWD${
      assets.isComplete ? '' : '（部分換算）'
    }`,
    '',
    '結算後將封存紀錄並清空本頁明細。',
  ]
}

interface AppSnapshot {
  transactions: Transaction[]
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  settlements: DailySettlement[]
  activeTab: PageTab
}

interface UndoBannerProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

function UndoBanner({ message, onUndo, onDismiss }: UndoBannerProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span>{message}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onUndo}
          className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
        >
          復原
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-amber-800 hover:bg-amber-100"
        >
          關閉
        </button>
      </div>
    </div>
  )
}

function formatTableDateTime(date: Date): string {
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

type AccentColor = 'emerald' | 'rose' | 'violet'

function formCardClass(accent: AccentColor, isEditing: boolean): string {
  if (isEditing) {
    return 'shrink-0 rounded-xl border border-slate-200 border-l-4 border-l-amber-400 bg-white p-3 shadow-sm ring-1 ring-amber-100'
  }
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
  }[accent]
  return `shrink-0 rounded-xl border border-slate-200 border-l-4 ${accentBorder} bg-white p-3 shadow-sm`
}

function recordCardClass(accent: AccentColor): string {
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
  }[accent]
  return `flex min-h-[160px] flex-1 flex-col rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-3 shadow-sm lg:min-h-[200px]`
}

function AvailableHint({
  label,
  amount,
  spendAmount,
}: {
  label: string
  amount: number
  spendAmount?: number | null
}) {
  const insufficient =
    spendAmount != null && spendAmount > 0 && spendAmount > amount
  return (
    <p
      className={`mt-0.5 text-[10px] tabular-nums ${
        insufficient ? 'font-medium text-rose-600' : 'text-slate-400'
      }`}
    >
      可用 {label} {formatNumber(amount)}
    </p>
  )
}

function SubmitPreview({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <p
      className={`rounded-md px-2 py-1 text-[11px] tabular-nums ${
        warn ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
      }`}
    >
      {text}
    </p>
  )
}

function TotalAssetsSummary({
  assets,
  compact = false,
}: {
  assets: TotalAssetsTwd
  compact?: boolean
}) {
  return (
    <div
      className={`rounded border border-indigo-100 bg-indigo-50/60 ${
        compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
        <p className={`text-slate-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          帳面總資產（TWD）
          {!assets.isComplete && (
            <span className="ml-1 text-amber-600">部分</span>
          )}
        </p>
        <p
          className={`font-bold tabular-nums text-indigo-700 ${
            compact ? 'text-xs' : 'text-sm'
          }`}
        >
          {formatNumber(assets.total)}
        </p>
      </div>
      <p
        className={`leading-snug tabular-nums text-slate-500 ${
          compact ? 'mt-0.5 text-[9px]' : 'mt-0.5 text-[10px]'
        }`}
      >
        TWD {formatNumber(assets.twdCash)}
        {assets.usdtInTwd !== null
          ? ` · USDT→ ${formatNumber(assets.usdtInTwd)}`
          : ' · USDT→ —'}
        {assets.vnInTwd !== null
          ? ` · VN→ ${formatNumber(assets.vnInTwd)}`
          : ' · VN→ —'}
        {assets.dayVnTwdRate !== null && (
          <span className="text-slate-400">
            {' '}
            （V/T @{formatRateDisplay(assets.dayVnTwdRate)}）
          </span>
        )}
      </p>
      {assets.missingNotes.length > 0 && (
        <p className="mt-0.5 text-[9px] text-amber-700">
          {assets.missingNotes.join('；')}
        </p>
      )}
    </div>
  )
}

function applyTransaction(balances: Balances, tx: Transaction): Balances {
  const next = { ...balances }

  if (isVnTwdTransaction(tx)) {
    next.vn -= tx.vnAmount
    next.twd += tx.twdAmount
    return next
  }

  if (tx.type === 'buy') {
    if (tx.fiatCurrency === 'twd') next.twd -= tx.fiatAmount
    else next.vn -= tx.fiatAmount
    next.usdt += tx.usdtAmount
  } else {
    next.usdt -= tx.usdtAmount
    if (tx.fiatCurrency === 'twd') next.twd += tx.fiatAmount
    else next.vn += tx.fiatAmount
  }

  return next
}

function recalculateBalances(
  transactions: Transaction[],
  openingBalances: Balances = INITIAL_BALANCES,
): Balances {
  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  return sorted.reduce((balances, tx) => applyTransaction(balances, tx), {
    ...openingBalances,
  })
}

function validateTransactions(
  transactions: Transaction[],
  openingBalances: Balances = INITIAL_BALANCES,
): string | null {
  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  let balances = { ...openingBalances }

  for (const tx of sorted) {
    if (isVnTwdTransaction(tx)) {
      if (tx.vnAmount <= 0 || tx.twdAmount <= 0) {
        return '請輸入有效的正數金額'
      }
      if (tx.vnAmount > balances.vn) {
        return 'VN 庫存不足'
      }
      balances = applyTransaction(balances, tx)
      continue
    }

    if (tx.usdtAmount <= 0 || tx.fiatAmount <= 0) {
      return '請輸入有效的正數金額'
    }

    if (tx.type === 'buy') {
      if (tx.fiatCurrency === 'twd' && tx.fiatAmount > balances.twd) {
        return '台幣庫存不足'
      }
      if (tx.fiatCurrency === 'vn' && tx.fiatAmount > balances.vn) {
        return 'VN 庫存不足'
      }
    } else if (tx.usdtAmount > balances.usdt) {
      return 'USDT 庫存不足'
    }

    balances = applyTransaction(balances, tx)
  }

  return null
}

interface CurrencyToggleProps {
  value: FiatCurrency
  onChange: (currency: FiatCurrency) => void
  disabled?: boolean
  buySide?: boolean
}

function CurrencyToggle({ value, onChange, disabled, buySide }: CurrencyToggleProps) {
  return (
    <div className="inline-flex rounded-md bg-slate-100 p-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('twd')}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
          value === 'twd'
            ? 'bg-white text-emerald-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {buySide ? 'TWD 買' : '換 TWD'}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('vn')}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
          value === 'vn'
            ? 'bg-white text-amber-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {buySide ? 'VN 買' : '換 VN'}
      </button>
    </div>
  )
}

interface TransactionTableProps {
  transactions: UsdtTransaction[]
  editingId: string | null
  onEdit: (tx: UsdtTransaction) => void
  onDelete: (id: string) => void
  accent: 'buy' | 'sell'
  /** buy 顯示當日買入均價；sell 不顯示均價 */
  showDayAverage?: boolean
}

function CurrencyBadge({ currency }: { currency: FiatCurrency }) {
  if (currency === 'twd') {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        TWD
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      VN
    </span>
  )
}

function RowActionButtons({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        title="編輯"
        aria-label="編輯"
        className="shrink-0 rounded p-1 text-sky-600 transition hover:bg-sky-50"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="刪除"
        aria-label="刪除"
        className="shrink-0 rounded p-1 text-rose-600 transition hover:bg-rose-50"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      </button>
    </div>
  )
}

function TransactionTable({
  transactions,
  editingId,
  onEdit,
  onDelete,
  accent,
  showDayAverage = false,
}: TransactionTableProps) {
  const isBuy = accent === 'buy'
  const twdAvg = showDayAverage
    ? calculateBuyDayAverageRate(transactions, 'twd')
    : calculateAverageRate(transactions, 'twd')
  const vnAvg = showDayAverage
    ? calculateBuyDayAverageRate(transactions, 'vn')
    : calculateAverageRate(transactions, 'vn')
  const totalUsdt = transactions.reduce((sum, tx) => sum + tx.usdtAmount, 0)
  const totalTwd = transactions
    .filter((tx) => tx.fiatCurrency === 'twd')
    .reduce((sum, tx) => sum + tx.fiatAmount, 0)
  const totalVn = transactions
    .filter((tx) => tx.fiatCurrency === 'vn')
    .reduce((sum, tx) => sum + tx.fiatAmount, 0)

  if (transactions.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">尚無紀錄</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="w-[4.5rem] shrink-0 pb-3 pr-2 font-medium">時間</th>
            <th className="pb-3 pr-2 font-medium">幣別</th>
            <th className="pb-3 pr-2 font-medium text-right">USDT</th>
            <th className="pb-3 pr-2 font-medium text-right">金額</th>
            <th className="pb-3 pr-2 font-medium text-right">匯率</th>
            <th className="w-14 shrink-0 pb-3 pl-1 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr
              key={tx.id}
              className={`border-b border-slate-100 ${
                editingId === tx.id ? 'bg-amber-50/60' : ''
              }`}
            >
              <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-xs text-slate-600">
                {formatTableDateTime(tx.timestamp)}
              </td>
              <td className="py-2 pr-2">
                <CurrencyBadge currency={tx.fiatCurrency} />
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-slate-800">
                {formatNumber(tx.usdtAmount)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-slate-800">
                {formatNumber(tx.fiatAmount)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-slate-600">
                {formatRateDisplay(tx.rate)}
              </td>
              <td className="whitespace-nowrap py-2 pl-1 text-right">
                <RowActionButtons
                  onEdit={() => onEdit(tx)}
                  onDelete={() => onDelete(tx.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr
            className={`border-t-2 bg-slate-50 ${
              isBuy ? 'border-emerald-200' : 'border-rose-200'
            }`}
          >
            <td colSpan={2} className="py-3 pr-3 font-semibold text-slate-800">
              總結
              <span className="ml-1 text-xs font-normal text-slate-500">
                {transactions.length} 筆
              </span>
            </td>
            <td className="py-3 pr-3 text-right tabular-nums font-medium text-slate-800">
              {formatNumber(totalUsdt)}
            </td>
            <td className="py-3 pr-3 text-right text-xs leading-5 text-slate-700">
              {totalTwd > 0 && <p>TWD {formatNumber(totalTwd)}</p>}
              {totalVn > 0 && <p>VN {formatNumber(totalVn)}</p>}
              {totalTwd === 0 && totalVn === 0 && '—'}
            </td>
            <td className="py-3 pr-3 text-right text-xs leading-5">
              {showDayAverage ? (
                <>
                  {twdAvg !== null && (
                    <p className={`font-bold tabular-nums ${isBuy ? 'text-emerald-600' : 'text-rose-600'}`}>
                      TWD/USDT @{formatRateDisplay(twdAvg)}
                    </p>
                  )}
                  {vnAvg !== null && (
                    <p className={`font-bold tabular-nums ${isBuy ? 'text-amber-600' : 'text-rose-600'}`}>
                      VN/USDT @{formatRateDisplay(vnAvg)}
                    </p>
                  )}
                  {twdAvg === null && vnAvg === null && (
                    <p className="text-slate-400">—</p>
                  )}
                </>
              ) : (
                '—'
              )}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

interface TradeFormProps {
  type: TransactionType
  title: string
  editTitle: string
  currency: FiatCurrency
  onCurrencyChange: (currency: FiatCurrency) => void
  usdt: string
  fiat: string
  rate: string
  error: string
  isEditing: boolean
  disabled: boolean
  onFieldChange: (field: 'usdt' | 'fiat' | 'rate', value: string) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  accentClass: string
  buttonClass: string
  focusClass: string
  balances: Balances
}

function TradeForm({
  type,
  title,
  editTitle,
  currency,
  onCurrencyChange,
  usdt,
  fiat,
  rate,
  error,
  isEditing,
  disabled,
  onFieldChange,
  onSubmit,
  onCancel,
  accentClass,
  buttonClass,
  focusClass,
  balances,
}: TradeFormProps) {
  const prefix = type === 'buy' ? 'buy' : 'sell'
  const rateLabel = currency === 'twd' ? '匯率 (TWD/USDT)' : '匯率 (VN/USDT)'
  const inputClass = `w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none transition disabled:bg-slate-50 ${focusClass}`

  const usdtNum = parseFloat(usdt)
  const fiatNum = parseFloat(fiat)
  const usdtValid = !Number.isNaN(usdtNum) && usdtNum > 0
  const fiatValid = !Number.isNaN(fiatNum) && fiatNum > 0
  const fiatLabel = currency === 'twd' ? 'TWD' : 'VN'

  let previewText: string | null = null
  let previewWarn = false
  if (usdtValid && fiatValid) {
    if (type === 'buy') {
      previewText = `−${fiatLabel} ${formatNumber(fiatNum)} · +USDT ${formatNumber(usdtNum)}`
      previewWarn = currency === 'twd' ? fiatNum > balances.twd : fiatNum > balances.vn
    } else {
      previewText = `−USDT ${formatNumber(usdtNum)} · +${fiatLabel} ${formatNumber(fiatNum)}`
      previewWarn = usdtNum > balances.usdt
    }
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-sm font-semibold ${accentClass}`}>
          {isEditing ? editTitle : title}
        </h2>
        <CurrencyToggle
          value={currency}
          onChange={onCurrencyChange}
          disabled={disabled}
          buySide={type === 'buy'}
        />
      </div>

      <form onSubmit={onSubmit} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor={`${prefix}Usdt`} className="mb-0.5 block text-xs font-medium text-slate-600">
              USDT
            </label>
            <input
              id={`${prefix}Usdt`}
              type="number"
              min="0"
              step="any"
              value={usdt}
              onChange={(e) => onFieldChange('usdt', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={inputClass}
            />
            {type === 'sell' && (
              <AvailableHint
                label="USDT"
                amount={balances.usdt}
                spendAmount={usdtValid ? usdtNum : null}
              />
            )}
          </div>
          <div>
            <label htmlFor={`${prefix}Rate`} className="mb-0.5 block text-xs font-medium text-slate-600">
              {rateLabel}
            </label>
            <input
              id={`${prefix}Rate`}
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => onFieldChange('rate', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${prefix}Fiat`} className="mb-0.5 block text-xs font-medium text-slate-600">
              {currency === 'twd' ? '台幣' : 'VN'}
            </label>
            <input
              id={`${prefix}Fiat`}
              type="number"
              min="0"
              step="any"
              value={fiat}
              onChange={(e) => onFieldChange('fiat', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={inputClass}
            />
            {type === 'buy' && (
              <AvailableHint
                label={fiatLabel}
                amount={currency === 'twd' ? balances.twd : balances.vn}
                spendAmount={fiatValid ? fiatNum : null}
              />
            )}
          </div>
        </div>

        {previewText && <SubmitPreview text={previewText} warn={previewWarn} />}

        {error && (
          <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={disabled}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isEditing
                ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30'
                : buttonClass
            }`}
          >
            {isEditing ? '儲存' : type === 'buy' ? '新增買入' : '新增賣出'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              取消
            </button>
          )}
        </div>
      </form>
    </>
  )
}

interface VnTwdFormProps {
  vn: string
  twd: string
  rate: string
  error: string
  isEditing: boolean
  disabled: boolean
  onFieldChange: (field: 'vn' | 'twd' | 'rate', value: string) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  vnBalance: number
}

function VnTwdForm({
  vn,
  twd,
  rate,
  error,
  isEditing,
  disabled,
  onFieldChange,
  onSubmit,
  onCancel,
  vnBalance,
}: VnTwdFormProps) {
  const inputClass =
    'w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none transition disabled:bg-slate-50 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'

  const vnNum = parseFloat(vn)
  const twdNum = parseFloat(twd)
  const vnValid = !Number.isNaN(vnNum) && vnNum > 0
  const twdValid = !Number.isNaN(twdNum) && twdNum > 0

  let previewText: string | null = null
  let previewWarn = false
  if (vnValid && twdValid) {
    previewText = `−VN ${formatNumber(vnNum)} · +TWD ${formatNumber(twdNum)}`
    previewWarn = vnNum > vnBalance
  }

  return (
    <>
      <h2 className="mb-2 text-sm font-semibold text-violet-700">
        {isEditing ? '編輯 VN 換 TWD' : 'VN 換 TWD'}
      </h2>

      <form onSubmit={onSubmit} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="vnTwdVn" className="mb-0.5 block text-xs font-medium text-slate-600">
              VN
            </label>
            <input
              id="vnTwdVn"
              type="number"
              min="0"
              step="any"
              value={vn}
              onChange={(e) => onFieldChange('vn', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={inputClass}
            />
            <AvailableHint
              label="VN"
              amount={vnBalance}
              spendAmount={vnValid ? vnNum : null}
            />
          </div>
          <div>
            <label htmlFor="vnTwdRate" className="mb-0.5 block text-xs font-medium text-slate-600">
              匯率 (VN/TWD)
            </label>
            <input
              id="vnTwdRate"
              type="number"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => onFieldChange('rate', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="vnTwdTwd" className="mb-0.5 block text-xs font-medium text-slate-600">
              台幣
            </label>
            <input
              id="vnTwdTwd"
              type="number"
              min="0"
              step="any"
              value={twd}
              onChange={(e) => onFieldChange('twd', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={inputClass}
            />
          </div>
        </div>

        {previewText && <SubmitPreview text={previewText} warn={previewWarn} />}

        {error && (
          <p className="rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={disabled}
            className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isEditing
                ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30'
                : 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-600/30'
            }`}
          >
            {isEditing ? '儲存' : '新增兌換'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              取消
            </button>
          )}
        </div>
      </form>
    </>
  )
}

interface VnTwdTableProps {
  transactions: VnTwdTransaction[]
  editingId: string | null
  onEdit: (tx: VnTwdTransaction) => void
  onDelete: (id: string) => void
}

function VnTwdTable({ transactions, editingId, onEdit, onDelete }: VnTwdTableProps) {
  const totalVn = transactions.reduce((sum, tx) => sum + tx.vnAmount, 0)
  const totalTwd = transactions.reduce((sum, tx) => sum + tx.twdAmount, 0)
  const dayAvg = calculateVnTwdDayAverageRate(transactions)

  if (transactions.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">尚無紀錄</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="w-[4.5rem] shrink-0 pb-3 pr-2 font-medium">時間</th>
            <th className="pb-3 pr-2 font-medium text-right">VN</th>
            <th className="pb-3 pr-2 font-medium text-right">TWD</th>
            <th className="pb-3 pr-2 font-medium text-right">匯率</th>
            <th className="w-14 shrink-0 pb-3 pl-1 font-medium text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr
              key={tx.id}
              className={`border-b border-slate-100 ${
                editingId === tx.id ? 'bg-amber-50/60' : ''
              }`}
            >
              <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-xs text-slate-600">
                {formatTableDateTime(tx.timestamp)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-amber-700">
                {formatNumber(tx.vnAmount)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-emerald-700">
                {formatNumber(tx.twdAmount)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums text-slate-600">
                {formatRateDisplay(tx.rate)}
              </td>
              <td className="whitespace-nowrap py-2 pl-1 text-right">
                <RowActionButtons
                  onEdit={() => onEdit(tx)}
                  onDelete={() => onDelete(tx.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-violet-200 bg-slate-50">
            <td className="py-3 pr-3 font-semibold text-slate-800">
              總結
              <span className="ml-1 text-xs font-normal text-slate-500">
                {transactions.length} 筆
              </span>
            </td>
            <td className="py-3 pr-3 text-right tabular-nums font-medium text-amber-700">
              {formatNumber(totalVn)}
            </td>
            <td className="py-3 pr-3 text-right tabular-nums font-medium text-emerald-700">
              {formatNumber(totalTwd)}
            </td>
            <td className="py-3 pr-3 text-right text-xs">
              {dayAvg !== null ? (
                <p className="font-bold tabular-nums text-violet-600">
                  @{formatRateDisplay(dayAvg)}
                </p>
              ) : (
                <p className="text-slate-400">—</p>
              )}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

interface SettlementsPanelProps {
  settlements: DailySettlement[]
  currentBalances: Balances
  currentInventoryCost: UsdtInventoryCost
  currentDayBuyAvg: UsdtInventoryCost
  currentTotalAssets: TotalAssetsTwd
  /** 本營業日尚有未結算交易時，最新卡才用即時均價 */
  hasCurrentPeriodTransactions: boolean
}

function SettlementsPanel({
  settlements,
  currentBalances,
  currentInventoryCost,
  currentDayBuyAvg,
  currentTotalAssets,
  hasCurrentPeriodTransactions,
}: SettlementsPanelProps) {
  if (settlements.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
        尚無結算紀錄
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {settlements.map((item, index) => {
        const isLatest = index === 0
        const twdBalance = isLatest ? currentBalances.twd : item.twdBalance
        const usdtBalance = isLatest ? currentBalances.usdt : item.usdtBalance
        const vnBalance = isLatest ? currentBalances.vn : item.vnBalance
        const twdAvg = isLatest
          ? currentInventoryCost.twd
          : item.usdtInventoryAvgTwd
        const dayBuyTwd =
          isLatest && hasCurrentPeriodTransactions
            ? currentDayBuyAvg.twd
            : item.dayBuyAvgTwd
        const dayBuyVn =
          isLatest && hasCurrentPeriodTransactions
            ? currentDayBuyAvg.vn
            : item.dayBuyAvgVn
        const displayAssets =
          isLatest && hasCurrentPeriodTransactions
            ? currentTotalAssets
            : totalAssetsFromSettlement(item)

        return (
        <article
          key={item.id}
          className={`rounded-lg border bg-white p-3 shadow-sm ${
            isLatest ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'
          }`}
        >
          <header className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-slate-900">{item.dateLabel}</h3>
              {isLatest && (
                <span className="rounded-full bg-indigo-50 px-1.5 py-px text-[10px] font-medium text-indigo-700">
                  目前整池
                </span>
              )}
            </div>
            <span className="shrink-0 text-[10px] text-slate-400">
              {item.transactionCount} 筆 ·{' '}
              {item.settledAt.toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}{' '}
              結算
            </span>
          </header>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-slate-500">TWD</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600">
                {formatNumber(twdBalance)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">USDT</p>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-0">
                <p className="text-sm font-bold tabular-nums text-sky-600">
                  {formatNumber(usdtBalance)}
                </p>
                {usdtBalance > 0 && twdAvg !== null && (
                  <span className="text-[10px] tabular-nums text-slate-400">
                    @{formatRateDisplay(twdAvg)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500">VN</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-amber-600">
                {formatNumber(vnBalance)}
              </p>
            </div>
          </div>

          <div className="mt-1.5">
            <TotalAssetsSummary assets={displayAssets} compact />
          </div>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-[10px] text-slate-600">
            <span className="text-slate-400">當日買入均價</span>
            {dayBuyTwd !== null && (
              <span className="tabular-nums">
                T <span className="font-semibold">@{formatRateDisplay(dayBuyTwd)}</span>
              </span>
            )}
            {dayBuyVn !== null && (
              <span className="tabular-nums">
                VN <span className="font-semibold">@{formatRateDisplay(dayBuyVn)}</span>
              </span>
            )}
            {dayBuyTwd === null && dayBuyVn === null && (
              <span className="text-slate-400">—</span>
            )}
          </div>
        </article>
        )
      })}
    </div>
  )
}

function App() {
  const persistedRef = useRef(loadPersistedAppState())
  const persisted = persistedRef.current

  const [activeTab, setActiveTab] = useState<PageTab>(persisted?.activeTab ?? 'daily')
  const [openingBalances, setOpeningBalances] = useState<Balances>(
    persisted?.openingBalances ?? { ...INITIAL_BALANCES },
  )
  const [openingUsdtCost, setOpeningUsdtCost] = useState<UsdtInventoryCost>(
    persisted?.openingUsdtCost ?? { ...EMPTY_USDT_COST },
  )
  const [settlements, setSettlements] = useState<DailySettlement[]>(
    persisted?.settlements ?? [],
  )
  const [transactions, setTransactions] = useState<Transaction[]>(
    persisted?.transactions ?? [],
  )

  const [buyCurrency, setBuyCurrency] = useState<FiatCurrency>('twd')
  const [buyUsdtAmount, setBuyUsdtAmount] = useState('')
  const [buyFiatAmount, setBuyFiatAmount] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [buyError, setBuyError] = useState('')

  const [sellCurrency, setSellCurrency] = useState<FiatCurrency>('twd')
  const [sellUsdtAmount, setSellUsdtAmount] = useState('')
  const [sellFiatAmount, setSellFiatAmount] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [sellError, setSellError] = useState('')

  const [vnTwdVnAmount, setVnTwdVnAmount] = useState('')
  const [vnTwdTwdAmount, setVnTwdTwdAmount] = useState('')
  const [vnTwdRate, setVnTwdRate] = useState('')
  const [vnTwdError, setVnTwdError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<AppSnapshot | null>(null)
  const [undoMessage, setUndoMessage] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  useEffect(() => {
    savePersistedAppState({
      activeTab,
      openingBalances,
      openingUsdtCost,
      transactions,
      settlements,
    })
  }, [activeTab, openingBalances, openingUsdtCost, transactions, settlements])

  const balances = useMemo(
    () => recalculateBalances(transactions, openingBalances),
    [transactions, openingBalances],
  )

  const inventoryCost = useMemo(
    () => computeInventoryCost(openingBalances, openingUsdtCost, transactions),
    [openingBalances, openingUsdtCost, transactions],
  )

  const dayBuyAvg = useMemo((): UsdtInventoryCost => {
    const usdtTxs = transactions.filter(isUsdtTransaction)
    return {
      twd: calculateBuyDayAverageRate(usdtTxs, 'twd'),
      vn: calculateBuyDayAverageRate(usdtTxs, 'vn'),
    }
  }, [transactions])

  const businessDayLabel = useMemo(
    () => getBusinessDayLabel(transactions),
    [transactions],
  )

  const createSnapshot = (): AppSnapshot => ({
    transactions,
    openingBalances,
    openingUsdtCost,
    settlements,
    activeTab,
  })

  const restoreSnapshot = (snapshot: AppSnapshot) => {
    setTransactions(snapshot.transactions)
    setOpeningBalances(snapshot.openingBalances)
    setOpeningUsdtCost(snapshot.openingUsdtCost)
    setSettlements(snapshot.settlements)
    setActiveTab(snapshot.activeTab)
  }

  const buyTransactions = useMemo(
    () =>
      transactions.filter(
        (tx): tx is UsdtTransaction => isUsdtTransaction(tx) && tx.type === 'buy',
      ),
    [transactions],
  )
  const sellTransactions = useMemo(
    () =>
      transactions.filter(
        (tx): tx is UsdtTransaction => isUsdtTransaction(tx) && tx.type === 'sell',
      ),
    [transactions],
  )
  const vnTwdTransactions = useMemo(
    () => transactions.filter(isVnTwdTransaction),
    [transactions],
  )

  const totalAssets = useMemo(
    () => computeTotalAssetsTwd(balances, inventoryCost, vnTwdTransactions),
    [balances, inventoryCost, vnTwdTransactions],
  )

  const resetBuyForm = () => {
    setBuyUsdtAmount('')
    setBuyFiatAmount('')
    setBuyRate('')
    setBuyError('')
    setBuyCurrency('twd')
    if (editingCategory === 'buy') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetSellForm = () => {
    setSellUsdtAmount('')
    setSellFiatAmount('')
    setSellRate('')
    setSellError('')
    setSellCurrency('twd')
    if (editingCategory === 'sell') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetVnTwdForm = () => {
    setVnTwdVnAmount('')
    setVnTwdTwdAmount('')
    setVnTwdRate('')
    setVnTwdError('')
    if (editingCategory === 'vn_twd') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const updateBuyForm = (field: 'usdt' | 'fiat' | 'rate', value: string) => {
    const next = syncFormFields(field, value, {
      usdt: buyUsdtAmount,
      fiat: buyFiatAmount,
      rate: buyRate,
    })
    setBuyUsdtAmount(next.usdt)
    setBuyFiatAmount(next.fiat)
    setBuyRate(next.rate)
  }

  const updateSellForm = (field: 'usdt' | 'fiat' | 'rate', value: string) => {
    const next = syncFormFields(field, value, {
      usdt: sellUsdtAmount,
      fiat: sellFiatAmount,
      rate: sellRate,
    })
    setSellUsdtAmount(next.usdt)
    setSellFiatAmount(next.fiat)
    setSellRate(next.rate)
  }

  const updateVnTwdForm = (field: 'vn' | 'twd' | 'rate', value: string) => {
    const next = syncVnTwdFormFields(field, value, {
      vn: vnTwdVnAmount,
      twd: vnTwdTwdAmount,
      rate: vnTwdRate,
    })
    setVnTwdVnAmount(next.vn)
    setVnTwdTwdAmount(next.twd)
    setVnTwdRate(next.rate)
  }

  const handleSubmit = (type: TransactionType, e: React.FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const usdtStr = isBuy ? buyUsdtAmount : sellUsdtAmount
    const fiatStr = isBuy ? buyFiatAmount : sellFiatAmount
    const currency = isBuy ? buyCurrency : sellCurrency
    const setError = isBuy ? setBuyError : setSellError
    const otherSetError = isBuy ? setSellError : setBuyError

    setError('')
    otherSetError('')
    setVnTwdError('')

    const usdt = parseFloat(usdtStr)
    const fiat = parseFloat(fiatStr)

    if (Number.isNaN(usdt) || Number.isNaN(fiat) || usdt <= 0 || fiat <= 0) {
      setError('請輸入有效的正數金額')
      return
    }

    const rate = calculateRate(fiat, usdt)
    const isEditing = editingId !== null && editingCategory === type

    const buildUpdatedList = (list: Transaction[]) => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isUsdtTransaction(tx)
            ? { ...tx, type, fiatCurrency: currency, usdtAmount: usdt, fiatAmount: fiat, rate }
            : tx,
        )
      }
      const newTransaction: UsdtTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'usdt',
        type,
        fiatCurrency: currency,
        usdtAmount: usdt,
        fiatAmount: fiat,
        rate,
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(updatedTransactions, openingBalances)
    if (validationError) {
      setError(validationError)
      return
    }

    setTransactions(updatedTransactions)
    if (isBuy) resetBuyForm()
    else resetSellForm()
  }

  const handleVnTwdSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    setVnTwdError('')
    setBuyError('')
    setSellError('')

    const vn = parseFloat(vnTwdVnAmount)
    const twd = parseFloat(vnTwdTwdAmount)

    if (Number.isNaN(vn) || Number.isNaN(twd) || vn <= 0 || twd <= 0) {
      setVnTwdError('請輸入有效的正數金額')
      return
    }

    const rate = calculateVnTwdRate(vn, twd)
    const isEditing = editingId !== null && editingCategory === 'vn_twd'

    const buildUpdatedList = (list: Transaction[]) => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isVnTwdTransaction(tx)
            ? { ...tx, vnAmount: vn, twdAmount: twd, rate }
            : tx,
        )
      }
      const newTransaction: VnTwdTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'vn_twd',
        vnAmount: vn,
        twdAmount: twd,
        rate,
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(updatedTransactions, openingBalances)
    if (validationError) {
      setVnTwdError(validationError)
      return
    }

    setTransactions(updatedTransactions)
    resetVnTwdForm()
  }

  const handleEdit = (tx: UsdtTransaction) => {
    setEditingId(tx.id)
    setEditingCategory(tx.type)
    setBuyError('')
    setSellError('')
    setVnTwdError('')

    if (tx.type === 'buy') {
      setBuyCurrency(tx.fiatCurrency)
      setBuyUsdtAmount(String(tx.usdtAmount))
      setBuyFiatAmount(String(tx.fiatAmount))
      setBuyRate(formatRateCalc(tx.rate))
    } else {
      setSellCurrency(tx.fiatCurrency)
      setSellUsdtAmount(String(tx.usdtAmount))
      setSellFiatAmount(String(tx.fiatAmount))
      setSellRate(formatRateCalc(tx.rate))
    }
  }

  const handleEditVnTwd = (tx: VnTwdTransaction) => {
    setEditingId(tx.id)
    setEditingCategory('vn_twd')
    setBuyError('')
    setSellError('')
    setVnTwdError('')
    setVnTwdVnAmount(String(tx.vnAmount))
    setVnTwdTwdAmount(String(tx.twdAmount))
    setVnTwdRate(formatRateCalc(tx.rate))
  }

  const executeDelete = (id: string) => {
    const snapshot = createSnapshot()
    setTransactions((prev) => prev.filter((item) => item.id !== id))

    if (editingId === id) {
      resetBuyForm()
      resetSellForm()
      resetVnTwdForm()
      setEditingId(null)
      setEditingCategory(null)
    }

    setUndoSnapshot(snapshot)
    setUndoMessage('已刪除一筆交易')
  }

  const handleDelete = (id: string) => {
    const tx = transactions.find((item) => item.id === id)
    if (!tx) return

    setConfirmDialog({
      title: '確定刪除以下交易？',
      lines: buildDeleteConfirmLines(tx),
      confirmLabel: '刪除',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        executeDelete(id)
      },
    })
  }

  const cancelEditing = () => {
    if (editingCategory === 'buy') resetBuyForm()
    else if (editingCategory === 'sell') resetSellForm()
    else if (editingCategory === 'vn_twd') resetVnTwdForm()
  }

  const editingBannerLabel =
    editingCategory === 'buy'
      ? '正在編輯買入交易'
      : editingCategory === 'sell'
        ? '正在編輯賣出交易'
        : editingCategory === 'vn_twd'
          ? '正在編輯 VN 換 TWD 交易'
          : null

  const isEditingBuy = editingCategory === 'buy'
  const isEditingSell = editingCategory === 'sell'
  const isEditingVnTwd = editingCategory === 'vn_twd'

  const executeSettle = () => {
    const snapshot = createSnapshot()

    const inventoryAtSettle = computeInventoryCost(
      openingBalances,
      openingUsdtCost,
      transactions,
    )

    const usdtTxs = transactions.filter(isUsdtTransaction)
    const vnTwdTxs = transactions.filter(isVnTwdTransaction)
    const assetsAtSettle = computeTotalAssetsTwd(balances, inventoryAtSettle, vnTwdTxs)

    const settlement: DailySettlement = {
      id: crypto.randomUUID(),
      settledAt: new Date(),
      dateLabel: formatSettlementDate(new Date()),
      twdBalance: balances.twd,
      usdtBalance: balances.usdt,
      vnBalance: balances.vn,
      usdtInventoryAvgTwd: inventoryAtSettle.twd,
      usdtInventoryAvgVn: inventoryAtSettle.vn,
      dayBuyAvgTwd: calculateBuyDayAverageRate(usdtTxs, 'twd'),
      dayBuyAvgVn: calculateBuyDayAverageRate(usdtTxs, 'vn'),
      ...settlementFromTotalAssets(assetsAtSettle),
      transactionCount: transactions.length,
    }

    setSettlements((prev) => [settlement, ...prev])
    setOpeningBalances(balances)
    setOpeningUsdtCost(inventoryAtSettle)
    setTransactions([])
    resetBuyForm()
    resetSellForm()
    resetVnTwdForm()
    setEditingId(null)
    setEditingCategory(null)
    setActiveTab('settlements')

    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成 ${businessDayLabel} 結算`)
  }

  const handleSettle = () => {
    if (transactions.length === 0) {
      setConfirmDialog({
        title: '無法結算',
        lines: ['尚無交易紀錄，無法結算。'],
        confirmLabel: '知道了',
        variant: 'primary',
        alertOnly: true,
        onConfirm: () => setConfirmDialog(null),
      })
      return
    }

    setConfirmDialog({
      title: '確定結算今日明細？',
      lines: buildSettleConfirmLines(transactions, balances, inventoryCost),
      confirmLabel: '確認結算',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeSettle()
      },
    })
  }

  const handleUndo = () => {
    if (!undoSnapshot) return
    restoreSnapshot(undoSnapshot)
    setUndoSnapshot(null)
    setUndoMessage('')
  }

  const dismissUndo = () => {
    setUndoSnapshot(null)
    setUndoMessage('')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ConfirmModal dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} />
      <div className="flex min-h-screen w-full">
        {/* 左側頁籤 */}
        <aside className="w-[5.5rem] shrink-0 border-r border-slate-200 bg-white px-1.5 py-3">
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => setActiveTab('daily')}
              className={`w-full rounded-md px-1.5 py-2 text-center text-xs font-medium leading-snug transition ${
                activeTab === 'daily'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              每日明細
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settlements')}
              className={`w-full rounded-md px-1.5 py-2 text-center text-xs font-medium leading-snug transition ${
                activeTab === 'settlements'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              每日結算
              {settlements.length > 0 && (
                <span className="block text-[10px] opacity-70">({settlements.length})</span>
              )}
            </button>
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-2 sm:px-4">
          {undoSnapshot && undoMessage && (
            <UndoBanner message={undoMessage} onUndo={handleUndo} onDismiss={dismissUndo} />
          )}

          {activeTab === 'daily' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={cancelEditing} />
              )}
              <div className="mb-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-[11px] text-slate-500">
                    營業日：{businessDayLabel}
                  </p>
                  <button
                    type="button"
                    onClick={handleSettle}
                    className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
                  >
                    結算
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <div className="rounded bg-slate-50 px-1.5 py-1 text-center">
                    <p className="text-[9px] text-slate-500">TWD</p>
                    <p className="text-xs font-bold tabular-nums text-emerald-600">
                      {formatNumber(balances.twd)}
                    </p>
                  </div>
                  <div className="rounded bg-slate-50 px-1.5 py-1 text-center">
                    <p className="text-[9px] text-slate-500">USDT</p>
                    <p className="text-xs font-bold tabular-nums text-sky-600">
                      {formatNumber(balances.usdt)}
                    </p>
                    {balances.usdt > 0 && inventoryCost.twd !== null && (
                      <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                        @{formatRateDisplay(inventoryCost.twd)}
                      </p>
                    )}
                    {balances.usdt > 0 && inventoryCost.vn !== null && (
                      <p className="text-[10px] tabular-nums text-amber-600">
                        VN @{formatRateDisplay(inventoryCost.vn)}
                      </p>
                    )}
                  </div>
                  <div className="rounded bg-slate-50 px-1.5 py-1 text-center">
                    <p className="text-[9px] text-slate-500">VN</p>
                    <p className="text-xs font-bold tabular-nums text-amber-600">
                      {formatNumber(balances.vn)}
                    </p>
                  </div>
                </div>
                <div className="mt-1.5">
                  <TotalAssetsSummary assets={totalAssets} compact />
                </div>
              </div>

        <section className="grid min-h-0 flex-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
          <div className="flex min-h-0 flex-col gap-2">
            <div className={formCardClass('emerald', isEditingBuy)}>
              <TradeForm
                type="buy"
                title="買入 USDT"
                editTitle="編輯買入"
                currency={buyCurrency}
                onCurrencyChange={(c) => {
                  setBuyCurrency(c)
                  setBuyError('')
                }}
                usdt={buyUsdtAmount}
                fiat={buyFiatAmount}
                rate={buyRate}
                error={buyError}
                isEditing={isEditingBuy}
                disabled={isEditingSell || isEditingVnTwd}
                onFieldChange={updateBuyForm}
                onSubmit={(e) => handleSubmit('buy', e)}
                onCancel={resetBuyForm}
                accentClass="text-emerald-700"
                buttonClass="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600/30"
                focusClass="focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                balances={balances}
              />
            </div>
            <div className={recordCardClass('emerald')}>
              <h2 className="mb-2 shrink-0 text-xs font-semibold text-emerald-700">買入紀錄</h2>
              <div className="min-h-0 flex-1 overflow-auto">
                <TransactionTable
                  transactions={buyTransactions}
                  editingId={editingId}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  accent="buy"
                  showDayAverage
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <div className={formCardClass('rose', isEditingSell)}>
              <TradeForm
                type="sell"
                title="賣出 USDT"
                editTitle="編輯賣出"
                currency={sellCurrency}
                onCurrencyChange={(c) => {
                  setSellCurrency(c)
                  setSellError('')
                }}
                usdt={sellUsdtAmount}
                fiat={sellFiatAmount}
                rate={sellRate}
                error={sellError}
                isEditing={isEditingSell}
                disabled={isEditingBuy || isEditingVnTwd}
                onFieldChange={updateSellForm}
                onSubmit={(e) => handleSubmit('sell', e)}
                onCancel={resetSellForm}
                accentClass="text-rose-700"
                buttonClass="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600/30"
                focusClass="focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                balances={balances}
              />
            </div>
            <div className={recordCardClass('rose')}>
              <h2 className="mb-2 shrink-0 text-xs font-semibold text-rose-700">賣出紀錄</h2>
              <div className="min-h-0 flex-1 overflow-auto">
                <TransactionTable
                  transactions={sellTransactions}
                  editingId={editingId}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  accent="sell"
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-2 lg:col-span-2 2xl:col-span-1">
            <div className={formCardClass('violet', isEditingVnTwd)}>
              <VnTwdForm
                vn={vnTwdVnAmount}
                twd={vnTwdTwdAmount}
                rate={vnTwdRate}
                error={vnTwdError}
                isEditing={isEditingVnTwd}
                disabled={isEditingBuy || isEditingSell}
                onFieldChange={updateVnTwdForm}
                onSubmit={handleVnTwdSubmit}
                onCancel={resetVnTwdForm}
                vnBalance={balances.vn}
              />
            </div>
            <div className={recordCardClass('violet')}>
              <h2 className="mb-2 shrink-0 text-xs font-semibold text-violet-700">VN 換 TWD 紀錄</h2>
              <div className="min-h-0 flex-1 overflow-auto">
                <VnTwdTable
                  transactions={vnTwdTransactions}
                  editingId={editingId}
                  onEdit={handleEditVnTwd}
                  onDelete={handleDelete}
                />
              </div>
            </div>
          </div>
        </section>
            </div>
          ) : (
            <>
              <h1 className="mb-2 text-sm font-semibold text-slate-800">每日結算</h1>
              <SettlementsPanel
                settlements={settlements}
                currentBalances={balances}
                currentInventoryCost={inventoryCost}
                currentDayBuyAvg={dayBuyAvg}
                currentTotalAssets={totalAssets}
                hasCurrentPeriodTransactions={transactions.length > 0}
              />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
