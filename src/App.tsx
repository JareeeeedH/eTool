import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { loadPersistedAppState, savePersistedAppState } from './persistence'

type TransactionType = 'buy' | 'sell'
type EditingCategory = TransactionType
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

function isVnTwdTransaction(tx: Transaction): tx is VnTwdTransaction {
  return tx.category === 'vn_twd'
}

function filterActiveTransactions(transactions: Transaction[]): UsdtTransaction[] {
  return transactions.filter(
    (tx): tx is UsdtTransaction =>
      !isVnTwdTransaction(tx) && tx.fiatCurrency === 'twd',
  )
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
  /** 當日賣出總利潤（TWD） */
  dayTotalProfit: number
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

/** 台幣顯示：無條件捨去小數至整數 */
function floorTwd(value: number): number {
  return Math.trunc(value)
}

function formatTwd(value: number): string {
  return floorTwd(value).toLocaleString('zh-TW', {
    maximumFractionDigits: 0,
  })
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** 匯率 / 均價顯示：四捨五入至小數第二位（計算仍用完整精度） */
function formatRateDisplay(value: number): string {
  return roundMoney(value).toFixed(2)
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

/** 帳面總資產（TWD）= TWD 現金 + USDT×整池 TWD 成本 */
function computeTotalAssetsTwd(
  balances: Balances,
  inventoryCost: UsdtInventoryCost,
): TotalAssetsTwd {
  const twdCash = balances.twd
  const missingNotes: string[] = []

  let usdtInTwd: number | null = null
  if (balances.usdt <= 0) {
    usdtInTwd = 0
  } else if (inventoryCost.twd !== null) {
    usdtInTwd = floorTwd(balances.usdt * inventoryCost.twd)
  } else {
    missingNotes.push('USDT 無 TWD 成本')
  }

  const total = twdCash + (usdtInTwd ?? 0)
  const isComplete = balances.usdt <= 0 || usdtInTwd !== null

  return {
    twdCash,
    usdtInTwd,
    vnInTwd: null,
    dayVnTwdRate: null,
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
  transactions: UsdtTransaction[],
): UsdtInventoryCost {
  let usdtQty = openingBalances.usdt
  let twdCostTotal = (openingCost.twd ?? 0) * usdtQty
  let vnCostTotal = (openingCost.vn ?? 0) * usdtQty

  if (usdtQty <= 0) {
    twdCostTotal = 0
    vnCostTotal = 0
  }

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (tx.type === 'buy') {
      usdtQty += tx.usdtAmount
      twdCostTotal += tx.fiatAmount
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

/** 單筆賣出的成本與利潤（依整池加權均價） */
interface SellProfitInfo {
  unitCost: number | null
  costBasis: number
  profit: number
}

function computeSellProfitById(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: UsdtTransaction[],
): Map<string, SellProfitInfo> {
  let usdtQty = openingBalances.usdt
  let twdCostTotal = (openingCost.twd ?? 0) * usdtQty

  if (usdtQty <= 0) twdCostTotal = 0

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )
  const result = new Map<string, SellProfitInfo>()

  for (const tx of sorted) {
    if (tx.type === 'buy') {
      usdtQty += tx.usdtAmount
      twdCostTotal += tx.fiatAmount
      continue
    }

    const unitCost =
      usdtQty > 0 && twdCostTotal > 0 ? twdCostTotal / usdtQty : null
    const costBasis = unitCost !== null ? tx.usdtAmount * unitCost : 0
    result.set(tx.id, {
      unitCost,
      costBasis,
      profit: tx.fiatAmount - costBasis,
    })

    if (usdtQty <= 0) continue

    const sellRatio = Math.min(tx.usdtAmount / usdtQty, 1)
    twdCostTotal *= 1 - sellRatio
    usdtQty -= tx.usdtAmount

    if (usdtQty <= 0) {
      usdtQty = 0
      twdCostTotal = 0
    }
  }

  return result
}

function computeDayTotalProfit(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: UsdtTransaction[],
): number {
  const profitById = computeSellProfitById(openingBalances, openingCost, transactions)
  return transactions
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + (profitById.get(tx.id)?.profit ?? 0), 0)
}

function formatProfit(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '' : ''
  return `${prefix}${formatTwd(value)}`
}

function profitColorClass(value: number): string {
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-500'
}

function formatSettlementDate(date: Date): string {
  return date.toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
  })
}

function formatSettlementDateTime(date: Date): string {
  return `${formatSettlementDate(date)} ${date.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} 結算`
}

function getBusinessDayLabel(transactions: UsdtTransaction[]): string {
  if (transactions.length > 0) {
    const earliest = [...transactions].reduce((min, tx) =>
      tx.timestamp.getTime() < min.timestamp.getTime() ? tx : min,
    )
    return formatSettlementDate(earliest.timestamp)
  }
  return formatSettlementDate(new Date())
}

function buildDeleteConfirmLines(tx: UsdtTransaction): string[] {
  const typeLabel = tx.type === 'buy' ? '買入' : '賣出'
  return [
    `類型：${typeLabel}（TWD）`,
    `USDT：${formatNumber(tx.usdtAmount)}`,
    `金額：${formatTwd(tx.fiatAmount)}`,
    `匯率 (TWD/USDT)：${formatRateDisplay(tx.rate)}`,
  ]
}

function buildSettleConfirmLines(
  transactions: UsdtTransaction[],
  balances: Balances,
  inventoryCost: UsdtInventoryCost,
  openingBalances: Balances,
  openingUsdtCost: UsdtInventoryCost,
): string[] {
  const buyCount = transactions.filter((tx) => tx.type === 'buy').length
  const sellCount = transactions.filter((tx) => tx.type === 'sell').length
  const assets = computeTotalAssetsTwd(balances, inventoryCost)
  const dayTotalProfit = computeDayTotalProfit(
    openingBalances,
    openingUsdtCost,
    transactions,
  )
  return [
    `交易筆數：${transactions.length}（買 ${buyCount} / 賣 ${sellCount}）`,
    `台幣庫存：${formatTwd(balances.twd)}`,
    `USDT 庫存：${formatNumber(balances.usdt)}${
      balances.usdt > 0 && inventoryCost.twd !== null
        ? `（@${formatRateDisplay(inventoryCost.twd)}）`
        : ''
    }`,
    sellCount > 0
      ? `當日總利潤：${formatProfit(dayTotalProfit)} TWD`
      : '當日總利潤：—（無賣出）',
    `帳面總資產：${formatTwd(assets.total)} TWD${
      assets.isComplete ? '' : '（部分換算）'
    }`,
    '',
    '結算後將封存紀錄並清空本頁明細。',
  ]
}

interface AppSnapshot {
  transactions: UsdtTransaction[]
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
    return 'shrink-0 rounded-lg border border-slate-200 border-l-4 border-l-amber-400 bg-white p-2 shadow-sm ring-1 ring-amber-100'
  }
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
  }[accent]
  return `shrink-0 rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-2 shadow-sm`
}

function recordCardClass(accent: AccentColor): string {
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
  }[accent]
  return `flex flex-col rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-1.5 shadow-sm`
}

function SubmitPreview({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <p
      className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
        warn ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
      }`}
    >
      {text}
    </p>
  )
}

function TotalAssetsColumn({ assets }: { assets: TotalAssetsTwd }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-indigo-50/40 px-1.5 py-0.5 shadow-sm ring-1 ring-indigo-100/80">
      <p className="text-[9px] font-semibold leading-tight text-indigo-800/90">
        帳面總資產
        <span className="ml-0.5 font-normal text-indigo-600/80">TWD</span>
        {!assets.isComplete && (
          <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[8px] font-medium text-amber-700">
            部分
          </span>
        )}
      </p>
      <p className="text-sm font-extrabold tabular-nums leading-tight tracking-tight text-indigo-700">
        {formatTwd(assets.total)}
      </p>
      {assets.missingNotes.length > 0 && (
        <p className="mt-0.5 text-[9px] text-amber-700">
          {assets.missingNotes.join('；')}
        </p>
      )}
    </div>
  )
}

function applyTransaction(balances: Balances, tx: UsdtTransaction): Balances {
  const next = { ...balances }

  if (tx.type === 'buy') {
    next.twd -= tx.fiatAmount
    next.usdt += tx.usdtAmount
  } else {
    next.usdt -= tx.usdtAmount
    next.twd += tx.fiatAmount
  }

  return next
}

function recalculateBalances(
  transactions: UsdtTransaction[],
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
  transactions: UsdtTransaction[],
  openingBalances: Balances = INITIAL_BALANCES,
): string | null {
  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  let balances = { ...openingBalances }

  for (const tx of sorted) {
    if (tx.usdtAmount <= 0 || tx.fiatAmount <= 0) {
      return '請輸入有效的正數金額'
    }

    if (tx.type === 'buy') {
      if (tx.fiatAmount > balances.twd) {
        return '台幣庫存不足'
      }
    } else if (tx.usdtAmount > balances.usdt) {
      return 'USDT 庫存不足'
    }

    balances = applyTransaction(balances, tx)
  }

  return null
}

interface TransactionTableProps {
  transactions: UsdtTransaction[]
  editingId: string | null
  onEdit: (tx: UsdtTransaction) => void
  onDelete: (id: string) => void
  accent: 'buy' | 'sell'
  /** buy 顯示當日買入均價；sell 顯示每筆利潤 */
  showDayAverage?: boolean
  sellProfitById?: Map<string, SellProfitInfo>
  /** 明細 tbody 預設顯示列數，超出捲動 */
  visibleRows?: number
  bodyScrollRef?: RefObject<HTMLDivElement | null>
  onBodyScroll?: (scrollTop: number) => void
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

const TRANSACTION_VISIBLE_ROWS_MOBILE = 8
const TRANSACTION_VISIBLE_ROWS_DESKTOP = 12

function useTransactionVisibleRows(): number {
  const [visibleRows, setVisibleRows] = useState(TRANSACTION_VISIBLE_ROWS_DESKTOP)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => {
      setVisibleRows(media.matches ? TRANSACTION_VISIBLE_ROWS_DESKTOP : TRANSACTION_VISIBLE_ROWS_MOBILE)
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return visibleRows
}

const TRANSACTION_ROW_HEIGHT_REM = 2.25
const TRANSACTION_HEAD_REM = 2
const TRANSACTION_FOOT_REM = 2.5
const TRANSACTION_TABLE_CLASS = 'w-full min-w-[260px] table-fixed text-left text-xs'
const TRANSACTION_DATA_ROW_STYLE = { height: `${TRANSACTION_ROW_HEIGHT_REM}rem` } as const
const TRANSACTION_CELL_CLASS = 'align-middle px-1.5 leading-none'

function transactionBodyMaxHeight(visibleRows: number): string {
  return `calc(${TRANSACTION_ROW_HEIGHT_REM}rem * ${visibleRows})`
}

function transactionTableStackHeight(visibleRows: number): string {
  return `calc(${TRANSACTION_HEAD_REM}rem + ${TRANSACTION_ROW_HEIGHT_REM}rem * ${visibleRows} + ${TRANSACTION_FOOT_REM}rem)`
}

function TransactionTableHeader({
  isBuy,
}: {
  isBuy: boolean
}) {
  return (
    <thead>
      <tr
        className="border-b border-slate-200 text-[11px] text-slate-500"
        style={{ height: `${TRANSACTION_HEAD_REM}rem` }}
      >
        <th className={`w-[4.5rem] ${TRANSACTION_CELL_CLASS} font-medium`}>時間</th>
        <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>USDT</th>
        <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>TWD</th>
        <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>匯率</th>
        {!isBuy && (
          <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>利潤</th>
        )}
        <th className={`w-12 ${TRANSACTION_CELL_CLASS} text-right font-medium`}>操作</th>
      </tr>
    </thead>
  )
}

function TransactionTableFooter({
  isBuy,
  transactions,
  totalUsdt,
  totalTwd,
  twdAvg,
  showDayAverage,
  totalProfit,
  hasProfitData,
}: {
  isBuy: boolean
  transactions: UsdtTransaction[]
  totalUsdt: number
  totalTwd: number
  twdAvg: number | null
  showDayAverage: boolean
  totalProfit: number
  hasProfitData: boolean
}) {
  return (
    <tfoot>
      <tr
        className={`border-t-2 bg-slate-50 ${
          isBuy ? 'border-emerald-200' : 'border-rose-200'
        }`}
        style={{ height: `${TRANSACTION_FOOT_REM}rem` }}
      >
        <td colSpan={1} className={`${TRANSACTION_CELL_CLASS} font-semibold text-slate-800`}>
          總結
          <span className="ml-1 text-[10px] font-normal text-slate-500">
            {transactions.length} 筆
          </span>
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums font-medium text-slate-800`}>
          {formatNumber(totalUsdt)}
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums font-medium text-slate-800`}>
          {totalTwd > 0 ? formatTwd(totalTwd) : '—'}
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right text-[10px]`}>
          {showDayAverage ? (
            twdAvg !== null ? (
              <span className={`font-bold tabular-nums ${isBuy ? 'text-emerald-600' : 'text-rose-600'}`}>
                TWD/USDT @{formatRateDisplay(twdAvg)}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )
          ) : (
            '—'
          )}
        </td>
        {!isBuy && (
          <td
            className={`${TRANSACTION_CELL_CLASS} text-right text-[10px] font-bold tabular-nums ${
              hasProfitData ? profitColorClass(totalProfit) : 'text-slate-400'
            }`}
          >
            {hasProfitData ? formatProfit(totalProfit) : '—'}
          </td>
        )}
        <td className={TRANSACTION_CELL_CLASS} />
      </tr>
    </tfoot>
  )
}

function TransactionTable({
  transactions,
  editingId,
  onEdit,
  onDelete,
  accent,
  showDayAverage = false,
  sellProfitById,
  visibleRows = 8,
  bodyScrollRef,
  onBodyScroll,
}: TransactionTableProps) {
  const isBuy = accent === 'buy'
  const twdAvg = showDayAverage
    ? calculateBuyDayAverageRate(transactions, 'twd')
    : calculateAverageRate(transactions, 'twd')
  const totalUsdt = transactions.reduce((sum, tx) => sum + tx.usdtAmount, 0)
  const totalTwd = transactions.reduce((sum, tx) => sum + tx.fiatAmount, 0)
  const totalProfit = !isBuy
    ? transactions.reduce((sum, tx) => sum + (sellProfitById?.get(tx.id)?.profit ?? 0), 0)
    : 0
  const hasProfitData = !isBuy && sellProfitById !== undefined

  const bodyHeight = transactionBodyMaxHeight(visibleRows)
  const stackHeight = transactionTableStackHeight(visibleRows)
  const footerProps = {
    isBuy,
    transactions,
    totalUsdt,
    totalTwd,
    twdAvg,
    showDayAverage,
    totalProfit,
    hasProfitData,
  }

  const tableStack = (
    <div
      className="flex shrink-0 flex-col overflow-x-auto"
      style={{ height: stackHeight, minHeight: stackHeight }}
    >
      <table className={`${TRANSACTION_TABLE_CLASS} shrink-0`}>
        <TransactionTableHeader isBuy={isBuy} />
      </table>
      <div
        ref={bodyScrollRef}
        className="shrink-0 overflow-y-auto overflow-x-auto"
        style={{ height: bodyHeight, minHeight: bodyHeight, maxHeight: bodyHeight }}
        onScroll={(event) => onBodyScroll?.(event.currentTarget.scrollTop)}
      >
        {transactions.length === 0 ? (
          <div className="flex h-full min-h-full items-center justify-center text-sm text-slate-400">
            尚無紀錄
          </div>
        ) : (
          <table className={TRANSACTION_TABLE_CLASS}>
            <tbody>
              {transactions.map((tx) => {
                const profitInfo = sellProfitById?.get(tx.id)
                return (
                  <tr
                    key={tx.id}
                    style={TRANSACTION_DATA_ROW_STYLE}
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-100/70 ${
                      editingId === tx.id ? 'bg-amber-50/60 hover:bg-amber-50/80' : ''
                    }`}
                  >
                    <td className={`w-[4.5rem] whitespace-nowrap ${TRANSACTION_CELL_CLASS} tabular-nums text-[11px] text-slate-600`}>
                      {formatTableDateTime(tx.timestamp)}
                    </td>
                    <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums text-slate-800`}>
                      {formatNumber(tx.usdtAmount)}
                    </td>
                    <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums text-slate-800`}>
                      {formatTwd(tx.fiatAmount)}
                    </td>
                    <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums text-slate-600`}>
                      {formatRateDisplay(tx.rate)}
                    </td>
                    {!isBuy && (
                      <td
                        className={`${TRANSACTION_CELL_CLASS} text-right text-[10px] font-semibold tabular-nums ${
                          profitInfo !== undefined
                            ? profitColorClass(profitInfo.profit)
                            : 'text-slate-400'
                        }`}
                      >
                        {profitInfo?.unitCost !== null && profitInfo !== undefined
                          ? formatProfit(profitInfo.profit)
                          : '—'}
                      </td>
                    )}
                    <td className={`w-12 whitespace-nowrap ${TRANSACTION_CELL_CLASS} text-right`}>
                      <RowActionButtons
                        onEdit={() => onEdit(tx)}
                        onDelete={() => onDelete(tx.id)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <table className={`${TRANSACTION_TABLE_CLASS} shrink-0`}>
        <TransactionTableFooter {...footerProps} />
      </table>
    </div>
  )

  return tableStack
}

interface TradeFormProps {
  type: TransactionType
  title: string
  editTitle: string
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
  /** 整池 USDT 加權成本（TWD/USDT）；買入顯示成本、賣出算利潤 */
  inventoryUnitCost?: number | null
}

function TradeForm({
  type,
  title,
  editTitle,
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
  inventoryUnitCost = null,
}: TradeFormProps) {
  const prefix = type === 'buy' ? 'buy' : 'sell'
  const inputClass = `w-full rounded border border-slate-300 px-1.5 py-1 text-xs outline-none transition disabled:bg-slate-50 ${focusClass}`

  const usdtNum = parseFloat(usdt)
  const fiatNum = parseFloat(fiat)
  const usdtValid = !Number.isNaN(usdtNum) && usdtNum > 0
  const fiatValid = !Number.isNaN(fiatNum) && fiatNum > 0
  const twdInsufficient = type === 'buy' && fiatValid && fiatNum > balances.twd
  const usdtInsufficient = type === 'sell' && usdtValid && usdtNum > balances.usdt

  let previewText: string | null = null
  let previewWarn = false
  let profitPreview: { text: string; value: number } | null = null

  if (usdtValid && fiatValid) {
    if (type === 'buy') {
      previewText = `−TWD ${formatTwd(fiatNum)} · +USDT ${formatNumber(usdtNum)}`
      previewWarn = fiatNum > balances.twd
    } else {
      previewText = `−USDT ${formatNumber(usdtNum)} · +TWD ${formatTwd(fiatNum)}`
      previewWarn = usdtNum > balances.usdt
      if (inventoryUnitCost !== null) {
        const costBasis = usdtNum * inventoryUnitCost
        const profit = fiatNum - costBasis
        profitPreview = {
          text: `成本 ${formatTwd(costBasis)}（@${formatRateDisplay(inventoryUnitCost)}）· 利潤 ${formatProfit(profit)}`,
          value: profit,
        }
      }
    }
  }

  return (
    <>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
        <h2 className={`text-xs font-semibold ${accentClass}`}>
          {isEditing ? editTitle : title}
        </h2>
        {inventoryUnitCost !== null && (
          <p className="text-[9px] tabular-nums text-slate-500">
            @{formatRateDisplay(inventoryUnitCost)}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-1">
        <div className="grid grid-cols-3 gap-1">
          <div>
            <label
              htmlFor={`${prefix}Usdt`}
              className={`mb-0 block text-[10px] font-medium leading-tight ${
                usdtInsufficient ? 'text-rose-600' : 'text-slate-600'
              }`}
            >
              USDT
              {type === 'sell' && (
                <span className="ml-0.5 font-normal text-slate-400">
                  ({formatNumber(balances.usdt)})
                </span>
              )}
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
          </div>
          <div>
            <label htmlFor={`${prefix}Rate`} className="mb-0 block text-[10px] font-medium leading-tight text-slate-600">
              匯率
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
            <label
              htmlFor={`${prefix}Fiat`}
              className={`mb-0 block text-[10px] font-medium leading-tight ${
                twdInsufficient ? 'text-rose-600' : 'text-slate-600'
              }`}
            >
              台幣
              {type === 'buy' && (
                <span className="ml-0.5 font-normal text-slate-400">
                  ({formatTwd(balances.twd)})
                </span>
              )}
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
          </div>
        </div>

        {previewText && <SubmitPreview text={previewText} warn={previewWarn} />}

        {profitPreview && (
          <p
            className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
              profitPreview.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {profitPreview.text}
          </p>
        )}

        {error && (
          <p className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="submit"
            disabled={disabled}
            className={`rounded px-2.5 py-1 text-[11px] font-medium text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
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
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
            >
              取消
            </button>
          )}
        </div>
      </form>
    </>
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
  currentDayTotalProfit: number
}

function CollapsibleSection({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

function SettlementsPanel({
  settlements,
  currentBalances,
  currentInventoryCost,
  currentDayBuyAvg,
  currentTotalAssets,
  hasCurrentPeriodTransactions,
  currentDayTotalProfit,
}: SettlementsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cumulativeTotalProfit =
    settlements.reduce((sum, item) => sum + item.dayTotalProfit, 0) +
    (hasCurrentPeriodTransactions ? currentDayTotalProfit : 0)

  if (settlements.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
        尚無結算紀錄
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
          <p className="text-xs font-medium text-indigo-900">累計總利潤</p>
          <p
            className={`text-base font-bold tabular-nums ${
              cumulativeTotalProfit > 0
                ? 'text-emerald-600'
                : cumulativeTotalProfit < 0
                  ? 'text-rose-600'
                  : 'text-slate-500'
            }`}
          >
            {formatProfit(cumulativeTotalProfit)} TWD
          </p>
        </div>
        <p className="mt-0.5 text-[10px] text-indigo-700/70">
          共 {settlements.length} 次結算
          {hasCurrentPeriodTransactions ? ' · 含本營業日未結算' : ''}
        </p>
      </div>

      {settlements.map((item, index) => {
        const isLatest = index === 0
        const twdBalance = isLatest ? currentBalances.twd : item.twdBalance
        const usdtBalance = isLatest ? currentBalances.usdt : item.usdtBalance
        const twdAvg = isLatest
          ? currentInventoryCost.twd
          : item.usdtInventoryAvgTwd
        const dayBuyTwd =
          isLatest && hasCurrentPeriodTransactions
            ? currentDayBuyAvg.twd
            : item.dayBuyAvgTwd
        const displayAssets =
          isLatest && hasCurrentPeriodTransactions
            ? currentTotalAssets
            : totalAssetsFromSettlement(item)
        const dayTotalProfit =
          isLatest && hasCurrentPeriodTransactions
            ? currentDayTotalProfit
            : item.dayTotalProfit
        const isExpanded = expandedIds.has(item.id)
        const settledLabel = formatSettlementDateTime(item.settledAt)

        return (
        <article
          key={item.id}
          className={`rounded-lg border bg-white shadow-sm ${
            isLatest ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={() => toggleExpanded(item.id)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
                <h3 className="text-sm font-semibold tabular-nums text-slate-800">
                  {settledLabel}
                </h3>
                {isLatest && (
                  <span className="rounded-full bg-indigo-50 px-1.5 py-px text-[10px] font-medium text-indigo-700">
                    目前整池
                  </span>
                )}
                <span className="text-[10px] text-slate-400">{item.transactionCount} 筆</span>
              </div>
              <p
                className={`overflow-hidden text-[10px] tabular-nums text-slate-500 transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                  isExpanded ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
                }`}
              >
                總資產 {formatTwd(displayAssets.total)} TWD
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p
                className={`text-xs font-bold tabular-nums ${
                  dayTotalProfit > 0
                    ? 'text-emerald-600'
                    : dayTotalProfit < 0
                      ? 'text-rose-600'
                      : 'text-slate-500'
                }`}
              >
                {formatProfit(dayTotalProfit)}
              </p>
              <svg
                className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </button>

          <CollapsibleSection open={isExpanded}>
            <div className="border-t border-slate-100 px-3 pb-3 pt-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-slate-500">TWD</p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600">
                    {formatTwd(twdBalance)}
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
                    {usdtBalance > 0 && displayAssets.usdtInTwd !== null && (
                      <span className="text-[10px] tabular-nums text-sky-600/80">
                        估值 {formatTwd(displayAssets.usdtInTwd)}
                      </span>
                    )}
                  </div>
                </div>
                <TotalAssetsColumn assets={displayAssets} />
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0 text-[10px] text-slate-600">
                <span className="text-slate-400">當日買入均價</span>
                {dayBuyTwd !== null ? (
                  <span className="tabular-nums">
                    TWD/USDT <span className="font-semibold">@{formatRateDisplay(dayBuyTwd)}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
            </div>
          </CollapsibleSection>
        </article>
        )
      })}
    </div>
  )
}

interface AppNavProps {
  activeTab: PageTab
  settlementsCount: number
  onSelect: (tab: PageTab) => void
  layout: 'sidebar' | 'drawer'
  onNavigate?: () => void
}

function AppNav({ activeTab, settlementsCount, onSelect, layout, onNavigate }: AppNavProps) {
  const isDrawer = layout === 'drawer'
  const navClass = isDrawer ? 'space-y-1 p-3' : 'space-y-1'
  const buttonClass = (tab: PageTab) =>
    `w-full rounded-md font-medium leading-snug transition ${
      isDrawer ? 'px-3 py-2.5 text-left text-sm' : 'px-1.5 py-2 text-center text-xs'
    } ${
      activeTab === tab
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-100'
    }`

  const selectTab = (tab: PageTab) => {
    onSelect(tab)
    onNavigate?.()
  }

  return (
    <nav className={navClass}>
      <button type="button" onClick={() => selectTab('daily')} className={buttonClass('daily')}>
        每日明細
      </button>
      <button
        type="button"
        onClick={() => selectTab('settlements')}
        className={buttonClass('settlements')}
      >
        每日結算
        {settlementsCount > 0 && (
          <span className={isDrawer ? 'ml-1 text-xs opacity-70' : 'block text-[10px] opacity-70'}>
            ({settlementsCount})
          </span>
        )}
      </button>
    </nav>
  )
}

function MobileNavCloseIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function MobileNavMenuIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function App() {
  const tableVisibleRows = useTransactionVisibleRows()
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
  const [transactions, setTransactions] = useState<UsdtTransaction[]>(
    filterActiveTransactions(persisted?.transactions ?? []),
  )

  const [buyUsdtAmount, setBuyUsdtAmount] = useState('')
  const [buyFiatAmount, setBuyFiatAmount] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [buyError, setBuyError] = useState('')

  const [sellUsdtAmount, setSellUsdtAmount] = useState('')
  const [sellFiatAmount, setSellFiatAmount] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [sellError, setSellError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<AppSnapshot | null>(null)
  const [undoMessage, setUndoMessage] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const buyBodyScrollRef = useRef<HTMLDivElement>(null)
  const sellBodyScrollRef = useRef<HTMLDivElement>(null)
  const syncBodyScrollLock = useRef(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [activeTab])

  const closeMobileNav = () => setMobileNavOpen(false)

  const syncTransactionBodyScroll = (source: 'buy' | 'sell', scrollTop: number) => {
    if (syncBodyScrollLock.current) return
    syncBodyScrollLock.current = true
    const target = source === 'buy' ? sellBodyScrollRef.current : buyBodyScrollRef.current
    if (target && target.scrollTop !== scrollTop) {
      target.scrollTop = scrollTop
    }
    syncBodyScrollLock.current = false
  }

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
    return {
      twd: calculateBuyDayAverageRate(transactions, 'twd'),
      vn: null,
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
    () => transactions.filter((tx) => tx.type === 'buy'),
    [transactions],
  )
  const sellTransactions = useMemo(
    () => transactions.filter((tx) => tx.type === 'sell'),
    [transactions],
  )
  const sellProfitById = useMemo(
    () => computeSellProfitById(openingBalances, openingUsdtCost, transactions),
    [openingBalances, openingUsdtCost, transactions],
  )

  const dayTotalProfit = useMemo(
    () => computeDayTotalProfit(openingBalances, openingUsdtCost, transactions),
    [openingBalances, openingUsdtCost, transactions],
  )

  const totalAssets = useMemo(
    () => computeTotalAssetsTwd(balances, inventoryCost),
    [balances, inventoryCost],
  )

  const resetBuyForm = () => {
    setBuyUsdtAmount('')
    setBuyFiatAmount('')
    setBuyRate('')
    setBuyError('')
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
    if (editingCategory === 'sell') {
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

  const handleSubmit = (type: TransactionType, e: React.FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const usdtStr = isBuy ? buyUsdtAmount : sellUsdtAmount
    const fiatStr = isBuy ? buyFiatAmount : sellFiatAmount
    const setError = isBuy ? setBuyError : setSellError
    const otherSetError = isBuy ? setSellError : setBuyError

    setError('')
    otherSetError('')

    const usdt = parseFloat(usdtStr)
    const fiat = parseFloat(fiatStr)

    if (Number.isNaN(usdt) || Number.isNaN(fiat) || usdt <= 0 || fiat <= 0) {
      setError('請輸入有效的正數金額')
      return
    }

    const rate = calculateRate(fiat, usdt)
    const isEditing = editingId !== null && editingCategory === type

    const buildUpdatedList = (list: UsdtTransaction[]) => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId
            ? { ...tx, type, fiatCurrency: 'twd' as const, usdtAmount: usdt, fiatAmount: fiat, rate }
            : tx,
        )
      }
      const newTransaction: UsdtTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'usdt',
        type,
        fiatCurrency: 'twd',
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

  const handleEdit = (tx: UsdtTransaction) => {
    setEditingId(tx.id)
    setEditingCategory(tx.type)
    setBuyError('')
    setSellError('')

    if (tx.type === 'buy') {
      setBuyUsdtAmount(String(tx.usdtAmount))
      setBuyFiatAmount(String(tx.fiatAmount))
      setBuyRate(formatRateCalc(tx.rate))
    } else {
      setSellUsdtAmount(String(tx.usdtAmount))
      setSellFiatAmount(String(tx.fiatAmount))
      setSellRate(formatRateCalc(tx.rate))
    }
  }

  const executeDelete = (id: string) => {
    const snapshot = createSnapshot()
    setTransactions((prev) => prev.filter((item) => item.id !== id))

    if (editingId === id) {
      resetBuyForm()
      resetSellForm()
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
  }

  const editingBannerLabel =
    editingCategory === 'buy'
      ? '正在編輯買入交易'
      : editingCategory === 'sell'
        ? '正在編輯賣出交易'
        : null

  const isEditingBuy = editingCategory === 'buy'
  const isEditingSell = editingCategory === 'sell'

  const executeSettle = () => {
    const snapshot = createSnapshot()

    const inventoryAtSettle = computeInventoryCost(
      openingBalances,
      openingUsdtCost,
      transactions,
    )

    const usdtTxs = transactions
    const assetsAtSettle = computeTotalAssetsTwd(balances, inventoryAtSettle)
    const settledDayProfit = computeDayTotalProfit(
      openingBalances,
      openingUsdtCost,
      transactions,
    )

    const settlement: DailySettlement = {
      id: crypto.randomUUID(),
      settledAt: new Date(),
      dateLabel: formatSettlementDateTime(new Date()),
      twdBalance: balances.twd,
      usdtBalance: balances.usdt,
      vnBalance: balances.vn,
      usdtInventoryAvgTwd: inventoryAtSettle.twd,
      usdtInventoryAvgVn: inventoryAtSettle.vn,
      dayBuyAvgTwd: calculateBuyDayAverageRate(usdtTxs, 'twd'),
      dayBuyAvgVn: null,
      ...settlementFromTotalAssets(assetsAtSettle),
      transactionCount: transactions.length,
      dayTotalProfit: settledDayProfit,
    }

    setSettlements((prev) => [settlement, ...prev])
    setOpeningBalances(balances)
    setOpeningUsdtCost(inventoryAtSettle)
    setTransactions([])
    resetBuyForm()
    resetSellForm()
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
      lines: buildSettleConfirmLines(
        transactions,
        balances,
        inventoryCost,
        openingBalances,
        openingUsdtCost,
      ),
      confirmLabel: '確認結算',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeSettle()
      },
    })
  }

  const executeResetAll = () => {
    setTransactions([])
    setSettlements([])
    setOpeningBalances({ ...INITIAL_BALANCES })
    setOpeningUsdtCost({ ...EMPTY_USDT_COST })
    resetBuyForm()
    resetSellForm()
    setEditingId(null)
    setEditingCategory(null)
    setUndoSnapshot(null)
    setUndoMessage('')
    setActiveTab('daily')
  }

  const handleResetAll = () => {
    setConfirmDialog({
      title: '確定清空全部資料？',
      lines: [
        '將刪除所有交易與結算紀錄，並還原初始餘額。',
        '此操作無法復原，僅供測試使用。',
      ],
      confirmLabel: '確認清空',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        executeResetAll()
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
    <div className="h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <ConfirmModal dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} />
      <div className="flex h-full w-full">
        <aside className="hidden w-[5.5rem] shrink-0 border-r border-slate-200 bg-white px-1.5 py-3 lg:block">
          <AppNav
            activeTab={activeTab}
            settlementsCount={settlements.length}
            onSelect={setActiveTab}
            layout="sidebar"
          />
        </aside>

        <div
          className={`fixed inset-0 z-40 lg:hidden ${mobileNavOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          aria-hidden={!mobileNavOpen}
        >
          <button
            type="button"
            aria-label="關閉選單"
            tabIndex={mobileNavOpen ? 0 : -1}
            className={`absolute inset-0 bg-black/40 ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeMobileNav}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-[9.5rem] flex-col border-r border-slate-200 bg-white shadow-xl ${
              mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-2.5 py-2">
              <p className="text-sm font-semibold text-slate-800">選單</p>
              <button
                type="button"
                aria-label="關閉選單"
                tabIndex={mobileNavOpen ? 0 : -1}
                onClick={closeMobileNav}
                className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100"
              >
                <MobileNavCloseIcon />
              </button>
            </div>
            <AppNav
              activeTab={activeTab}
              settlementsCount={settlements.length}
              onSelect={setActiveTab}
              onNavigate={closeMobileNav}
              layout="drawer"
            />
          </aside>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 lg:hidden">
            <button
              type="button"
              aria-label={mobileNavOpen ? '關閉選單' : '開啟選單'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
              className="rounded-md p-1.5 text-slate-700 transition hover:bg-slate-100"
            >
              {mobileNavOpen ? <MobileNavCloseIcon /> : <MobileNavMenuIcon />}
            </button>
            <p className="min-w-0 flex-1 text-sm font-medium text-slate-800">
              {activeTab === 'daily' ? '每日明細' : '每日結算'}
            </p>
          </header>

        <main
          className={`flex min-h-0 flex-1 flex-col px-2 py-1 pb-4 sm:px-3 lg:overflow-y-auto lg:pb-1 ${
            mobileNavOpen ? 'overflow-hidden touch-none' : 'overflow-y-auto overscroll-y-contain'
          }`}
        >
          {undoSnapshot && undoMessage && (
            <UndoBanner message={undoMessage} onUndo={handleUndo} onDismiss={dismissUndo} />
          )}

          {activeTab === 'daily' ? (
            <div className="flex flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={cancelEditing} />
              )}
              <div className="mb-1 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-[10px] text-slate-500">
                    營業日：{businessDayLabel}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={handleResetAll}
                      className="rounded border border-red-200 bg-white px-2 py-0.5 text-[10px] font-medium text-red-600 transition hover:bg-red-50"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={handleSettle}
                      className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-indigo-700"
                    >
                      結算
                    </button>
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  <div className="rounded bg-slate-50 px-1 py-0.5 text-center leading-tight">
                    <p className="text-[8px] text-slate-500">TWD</p>
                    <p className="text-[11px] font-bold tabular-nums text-emerald-600">
                      {formatTwd(balances.twd)}
                    </p>
                  </div>
                  <div className="rounded bg-slate-50 px-1 py-0.5 text-center leading-tight">
                    <p className="text-[8px] text-slate-500">USDT</p>
                    <p className="text-[11px] font-bold tabular-nums text-sky-600">
                      {formatNumber(balances.usdt)}
                    </p>
                    {balances.usdt > 0 && (inventoryCost.twd !== null || totalAssets.usdtInTwd !== null) && (
                      <p className="text-[8px] tabular-nums text-slate-500">
                        {inventoryCost.twd !== null && `@${formatRateDisplay(inventoryCost.twd)}`}
                        {inventoryCost.twd !== null && totalAssets.usdtInTwd !== null && ' · '}
                        {totalAssets.usdtInTwd !== null && `估值 ${formatTwd(totalAssets.usdtInTwd)}`}
                      </p>
                    )}
                  </div>
                  <TotalAssetsColumn assets={totalAssets} />
                </div>
              </div>

        <section className="grid shrink-0 gap-1.5 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <div className={formCardClass('emerald', isEditingBuy)}>
              <TradeForm
                type="buy"
                title="買入 USDT"
                editTitle="編輯買入"
                usdt={buyUsdtAmount}
                fiat={buyFiatAmount}
                rate={buyRate}
                error={buyError}
                isEditing={isEditingBuy}
                disabled={isEditingSell}
                onFieldChange={updateBuyForm}
                onSubmit={(e) => handleSubmit('buy', e)}
                onCancel={resetBuyForm}
                accentClass="text-emerald-700"
                buttonClass="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600/30"
                focusClass="focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                balances={balances}
                inventoryUnitCost={inventoryCost.twd}
              />
            </div>
            <div className={recordCardClass('emerald')}>
              <h2 className="mb-0.5 shrink-0 text-[11px] font-semibold leading-none text-emerald-700">
                買入紀錄
              </h2>
              <TransactionTable
                transactions={buyTransactions}
                editingId={editingId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                accent="buy"
                showDayAverage
                visibleRows={tableVisibleRows}
                bodyScrollRef={buyBodyScrollRef}
                onBodyScroll={(scrollTop) => syncTransactionBodyScroll('buy', scrollTop)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className={formCardClass('rose', isEditingSell)}>
              <TradeForm
                type="sell"
                title="賣出 USDT"
                editTitle="編輯賣出"
                usdt={sellUsdtAmount}
                fiat={sellFiatAmount}
                rate={sellRate}
                error={sellError}
                isEditing={isEditingSell}
                disabled={isEditingBuy}
                onFieldChange={updateSellForm}
                onSubmit={(e) => handleSubmit('sell', e)}
                onCancel={resetSellForm}
                accentClass="text-rose-700"
                buttonClass="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600/30"
                focusClass="focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                balances={balances}
                inventoryUnitCost={inventoryCost.twd}
              />
            </div>
            <div className={recordCardClass('rose')}>
              <h2 className="mb-0.5 shrink-0 text-[11px] font-semibold leading-none text-rose-700">
                賣出紀錄
              </h2>
              <TransactionTable
                transactions={sellTransactions}
                editingId={editingId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                accent="sell"
                sellProfitById={sellProfitById}
                visibleRows={tableVisibleRows}
                bodyScrollRef={sellBodyScrollRef}
                onBodyScroll={(scrollTop) => syncTransactionBodyScroll('sell', scrollTop)}
              />
            </div>
          </div>
        </section>
            </div>
          ) : (
            <>
              <h1 className="mb-2 shrink-0 text-sm font-semibold text-slate-800">每日結算</h1>
              <SettlementsPanel
                settlements={settlements}
                currentBalances={balances}
                currentInventoryCost={inventoryCost}
                currentDayBuyAvg={dayBuyAvg}
                currentTotalAssets={totalAssets}
                hasCurrentPeriodTransactions={transactions.length > 0}
                currentDayTotalProfit={dayTotalProfit}
              />
            </>
          )}
        </main>
        </div>
      </div>
    </div>
  )
}

export default App
