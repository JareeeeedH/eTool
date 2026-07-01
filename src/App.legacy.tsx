import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { loadPersistedAppState, savePersistedAppState } from './persistence'

type TransactionType = 'buy' | 'sell'
type EditingCategory = TransactionType | 'vn_buy' | 'vn_sell' | 'expense'
type DailyWorkTab = 'usdt' | 'vn'
type FiatCurrency = 'twd' | 'vn'
type VnPayCurrency = 'twd' | 'usdt'

type ExpenseType = 'rent' | 'fuel' | 'parking' | 'meal' | 'telecom' | 'misc' | 'other'

const EXPENSE_TYPE_OPTIONS: { value: ExpenseType; label: string }[] = [
  { value: 'rent', label: '車租' },
  { value: 'fuel', label: '油資' },
  { value: 'parking', label: '停車' },
  { value: 'meal', label: '餐費' },
  { value: 'telecom', label: '通訊' },
  { value: 'misc', label: '雜支' },
  { value: 'other', label: '其他' },
]

const EXPENSE_QUICK_TYPES: ExpenseType[] = ['fuel', 'parking', 'meal']

const EXPENSE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-1 text-xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-50'

function expenseTypeLabel(type: ExpenseType): string {
  return EXPENSE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type
}

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

interface VnTradeTransaction {
  id: string
  timestamp: Date
  category: 'vn_trade'
  type: TransactionType
  payCurrency: VnPayCurrency
  vnAmount: number
  twdAmount: number
  usdtAmount: number
  /** 匯率 = VN / 支付金額；VN/TWD 成本 = 1 NTD 可買多少 VN */
  rate: number
}

interface ExpenseTransaction {
  id: string
  timestamp: Date
  category: 'expense'
  expenseType: ExpenseType
  amountTwd: number
  note: string
}

type Transaction = UsdtTransaction | VnTradeTransaction | ExpenseTransaction

function isExpenseTransaction(tx: Transaction): tx is ExpenseTransaction {
  return tx.category === 'expense'
}

function isUsdtTransaction(tx: Transaction): tx is UsdtTransaction {
  return tx.category === 'usdt'
}

function isVnTradeTransaction(tx: Transaction): tx is VnTradeTransaction {
  return tx.category === 'vn_trade'
}

function filterUsdtTransactions(transactions: Transaction[]): UsdtTransaction[] {
  return transactions.filter(isUsdtTransaction)
}

function filterVnTradeTransactions(transactions: Transaction[]): VnTradeTransaction[] {
  return transactions.filter(isVnTradeTransaction)
}

function filterExpenseTransactions(transactions: Transaction[]): ExpenseTransaction[] {
  return transactions.filter(isExpenseTransaction)
}

function filterTradeTransactions(transactions: Transaction[]): Array<
  UsdtTransaction | VnTradeTransaction
> {
  return transactions.filter(
    (tx): tx is UsdtTransaction | VnTradeTransaction =>
      isUsdtTransaction(tx) || isVnTradeTransaction(tx),
  )
}

function normalizeVnTradeTransaction(tx: VnTradeTransaction): VnTradeTransaction {
  const payCurrency: VnPayCurrency =
    tx.payCurrency === 'usdt' ? 'usdt' : 'twd'

  if (payCurrency === 'usdt') {
    return {
      ...tx,
      payCurrency: 'usdt',
      twdAmount: 0,
      usdtAmount: tx.usdtAmount > 0 ? tx.usdtAmount : 0,
    }
  }

  return {
    ...tx,
    payCurrency: 'twd',
    usdtAmount: 0,
    twdAmount: tx.twdAmount > 0 ? tx.twdAmount : 0,
  }
}

function vnTradePayAmount(tx: VnTradeTransaction): number {
  return tx.payCurrency === 'usdt' ? tx.usdtAmount : tx.twdAmount
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
  /** 結算當下 VN 整池成本（1 NTD = ? VN，換算 VN 庫存用） */
  dayVnTwdRate: number | null
  /** 結算當下 VN 整池成本（1 USDT = ? VN） */
  dayVnUsdtRate: number | null
  totalAssetsComplete: boolean
  totalAssetsMissingNotes: string
  transactionCount: number
  /** 當日 USDT 賣出利潤（TWD） */
  dayUsdtProfit?: number
  /** 當日 VN 賣出利潤（TWD） */
  dayVnProfit?: number
  /** 當日賣出總利潤（TWD）= USDT + VN */
  dayTotalProfit: number
}

interface ExpenseSettlementItem {
  expenseType: ExpenseType
  amountTwd: number
  note: string
  timestamp: Date
}

interface ExpenseSettlement {
  id: string
  settledAt: Date
  dateLabel: string
  twdBalance: number
  expenseCount: number
  expenseTotal: number
  items: ExpenseSettlementItem[]
}

interface MonthlyClose {
  id: string
  periodLabel: string
  closedAt: Date
  actualStartDate: Date | null
  actualEndDate: Date | null
  grossProfit: number
  usdtProfit: number
  vnProfit: number
  expenseTotal: number
  netProfit: number
  expenseByCategory: Record<ExpenseType, number>
  openingTotalAssets?: number
  closingBalances: Balances
  closingUsdtCost: UsdtInventoryCost
  closingVnTwdRate: number | null
  closingVnUsdtRate: number | null
  /** 期初＋淨利（與本期損益一致） */
  closingTotalAssets: number
  /** 月結當下庫存成本計價帳面（USDT/VN 整池成本，可能與上式略有差異） */
  closingBookTotalAssets?: number
  tradeSettlements: DailySettlement[]
  expenseSettlements: ExpenseSettlement[]
}

type PageTab =
  | 'daily'
  | 'expenses'
  | 'settlements'
  | 'monthly'
  | 'notes'

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
  dayVnUsdtRate: number | null
  total: number
  isComplete: boolean
  missingNotes: string[]
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-TW', {
    maximumFractionDigits: 2,
  })
}

/** 大數字緊湊顯示（如 VN 庫存）：億 / 萬 */
function formatCompactNumber(value: number): string {
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

const TRADE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-1 text-xs outline-none transition disabled:bg-slate-50'

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

/** VN 整池成本：1 NTD 可買多少 VN */
function formatVnNtdCostRate(rate: number): string {
  return `1 NTD = ${formatRateDisplay(rate)} VN`
}

function formatVnNtdCostRateCompact(rate: number): string {
  return `${formatRateDisplay(rate)} VN/NTD`
}

/** VN 整池成本：1 USDT 可買多少 VN */
function formatVnUsdtCostRate(rate: number): string {
  return `1 U = ${formatRateDisplay(rate)} VN`
}

function formatVnUsdtCostRateCompact(rate: number): string {
  return `${formatRateDisplay(rate)} VN/U`
}

function VnPoolCostLines({
  twdRate,
  usdtRate,
  className = 'text-[8px] tabular-nums text-slate-500',
}: {
  twdRate: number | null
  usdtRate: number | null
  className?: string
}) {
  if (twdRate === null && usdtRate === null) return null
  return (
    <>
      {twdRate !== null && (
        <p className={className}>{formatVnNtdCostRateCompact(twdRate)}</p>
      )}
      {usdtRate !== null && (
        <p className={className}>{formatVnUsdtCostRateCompact(usdtRate)}</p>
      )}
    </>
  )
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

/** 帳面總資產（TWD）= TWD 現金 + USDT×整池成本 + VN÷VN 整池成本（與頂部 VN 卡片一致） */
function computeTotalAssetsTwd(
  balances: Balances,
  inventoryCost: UsdtInventoryCost,
  openingBalances: Balances,
  openingUsdtCost: UsdtInventoryCost,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  transactions: Transaction[],
): TotalAssetsTwd {
  const twdCash = balances.twd
  const missingNotes: string[] = []
  const vnAnalytics = computeVnTradeAnalytics(
    openingBalances,
    openingVnTwdRate,
    openingVnUsdtRate,
    openingUsdtCost,
    transactions,
  )
  const vnPoolRate = vnAnalytics.currentVnTwdRate

  let usdtInTwd: number | null = null
  if (balances.usdt <= 0) {
    usdtInTwd = 0
  } else if (inventoryCost.twd !== null) {
    usdtInTwd = floorTwd(balances.usdt * inventoryCost.twd)
  } else {
    missingNotes.push('USDT 無 TWD 成本')
  }

  let vnInTwd: number | null = null
  if (balances.vn <= 0) {
    vnInTwd = 0
  } else if (vnPoolRate !== null) {
    vnInTwd = floorTwd(balances.vn / vnPoolRate)
  } else {
    missingNotes.push('VN 無成本均價')
  }

  const total = twdCash + (usdtInTwd ?? 0) + (vnInTwd ?? 0)
  const isComplete =
    (balances.usdt <= 0 || usdtInTwd !== null) &&
    (balances.vn <= 0 || vnInTwd !== null)

  return {
    twdCash,
    usdtInTwd,
    vnInTwd,
    dayVnTwdRate: vnPoolRate,
    dayVnUsdtRate: vnAnalytics.currentVnUsdtRate,
    total,
    isComplete,
    missingNotes,
  }
}

function calculateVnTwdRate(vnAmount: number, twdAmount: number): number {
  if (twdAmount <= 0) return 0
  return vnAmount / twdAmount
}

interface UsdtInventoryState {
  usdtQty: number
  twdCostTotal: number
  vnCostTotal: number
}

function createUsdtInventoryState(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
): UsdtInventoryState {
  let usdtQty = openingBalances.usdt
  let twdCostTotal = (openingCost.twd ?? 0) * usdtQty
  let vnCostTotal = (openingCost.vn ?? 0) * usdtQty

  if (usdtQty <= 0) {
    twdCostTotal = 0
    vnCostTotal = 0
  }

  return { usdtQty, twdCostTotal, vnCostTotal }
}

function usdtUnitCostTwd(
  state: UsdtInventoryState,
  openingCost: UsdtInventoryCost,
): number | null {
  if (state.usdtQty > 0 && state.twdCostTotal > 0) {
    return state.twdCostTotal / state.usdtQty
  }
  return openingCost.twd
}

function applyUsdtInventoryTransaction(
  state: UsdtInventoryState,
  tx: Transaction,
  openingCost: UsdtInventoryCost,
): void {
  if (isUsdtTransaction(tx)) {
    if (tx.type === 'buy') {
      state.usdtQty += tx.usdtAmount
      if (tx.fiatCurrency === 'twd') {
        state.twdCostTotal += tx.fiatAmount
      }
    } else {
      if (state.usdtQty <= 0) return

      const sellRatio = Math.min(tx.usdtAmount / state.usdtQty, 1)
      state.twdCostTotal *= 1 - sellRatio
      state.vnCostTotal *= 1 - sellRatio
      state.usdtQty -= tx.usdtAmount

      if (state.usdtQty <= 0) {
        state.usdtQty = 0
        state.twdCostTotal = 0
        state.vnCostTotal = 0
      }
    }
    return
  }

  if (!isVnTradeTransaction(tx) || tx.payCurrency !== 'usdt') return

  if (tx.type === 'buy') {
    if (state.usdtQty <= 0) return

    const spendRatio = Math.min(tx.usdtAmount / state.usdtQty, 1)
    state.twdCostTotal *= 1 - spendRatio
    state.vnCostTotal *= 1 - spendRatio
    state.usdtQty -= tx.usdtAmount

    if (state.usdtQty <= 0) {
      state.usdtQty = 0
      state.twdCostTotal = 0
      state.vnCostTotal = 0
    }
  } else {
    const unitTwd =
      state.usdtQty > 0
        ? state.twdCostTotal / state.usdtQty
        : openingCost.twd ?? 0
    state.usdtQty += tx.usdtAmount
    state.twdCostTotal += tx.usdtAmount * unitTwd
  }
}

/**
 * 當日 VN 整池成本均價（買入加權）：1 NTD 可買多少 VN
 * - TWD 支付：直接累加 twdAmount
 * - USDT 支付：以該筆當下整池 USDT/TWD 成本換算 TWD 等值
 */
function computeVnTwdCostAverageRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  const state = createUsdtInventoryState(openingBalances, openingCost)
  let totalVn = 0
  let totalTwdEq = 0

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx) && tx.type === 'buy') {
      if (tx.payCurrency === 'twd') {
        totalVn += tx.vnAmount
        totalTwdEq += tx.twdAmount
      } else {
        const unitTwd = usdtUnitCostTwd(state, openingCost)
        if (unitTwd !== null && unitTwd > 0) {
          totalVn += tx.vnAmount
          totalTwdEq += tx.usdtAmount * unitTwd
        }
      }
    }

    applyUsdtInventoryTransaction(state, tx, openingCost)
  }

  return totalTwdEq > 0 ? totalVn / totalTwdEq : null
}

function calculateVnBuyDayAverageRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  return computeVnTwdCostAverageRate(openingBalances, openingCost, transactions)
}

/** 當日 VN 買入加權均價（1 USDT = ? VN） */
function computeVnUsdtCostAverageRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  const state = createUsdtInventoryState(openingBalances, openingCost)
  let totalVn = 0
  let totalUsdtEq = 0

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx) && tx.type === 'buy') {
      if (tx.payCurrency === 'usdt') {
        totalVn += tx.vnAmount
        totalUsdtEq += tx.usdtAmount
      } else {
        const unitTwd = usdtUnitCostTwd(state, openingCost)
        if (unitTwd !== null && unitTwd > 0) {
          totalVn += tx.vnAmount
          totalUsdtEq += tx.twdAmount / unitTwd
        }
      }
    }

    applyUsdtInventoryTransaction(state, tx, openingCost)
  }

  return totalUsdtEq > 0 ? totalVn / totalUsdtEq : null
}

function calculateVnBuyDayAverageUsdtRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  return computeVnUsdtCostAverageRate(openingBalances, openingCost, transactions)
}

/** 當日 VN 賣出成交均價（VN/TWD 加權；USDT 收款依當下 U 池成本換算） */
function computeVnSellDayAverageRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  const state = createUsdtInventoryState(openingBalances, openingCost)
  let totalVn = 0
  let totalProceedsTwd = 0

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx) && tx.type === 'sell') {
      if (tx.payCurrency === 'twd') {
        totalVn += tx.vnAmount
        totalProceedsTwd += tx.twdAmount
      } else {
        const unitTwd = usdtUnitCostTwd(state, openingCost)
        if (unitTwd !== null && unitTwd > 0) {
          totalVn += tx.vnAmount
          totalProceedsTwd += tx.usdtAmount * unitTwd
        }
      }
    }

    applyUsdtInventoryTransaction(state, tx, openingCost)
  }

  return totalProceedsTwd > 0 ? totalVn / totalProceedsTwd : null
}

interface VnTradeAnalytics {
  buyImpliedTwdRateById: Map<string, number>
  buyImpliedUsdtRateById: Map<string, number>
  sellProfitById: Map<string, SellProfitInfo>
  /** 目前 VN 整池成本：1 NTD 可買多少 VN */
  currentVnTwdRate: number | null
  /** 目前 VN 整池成本：1 USDT 可買多少 VN */
  currentVnUsdtRate: number | null
}

function computeVnTradeAnalytics(
  openingBalances: Balances,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  openingUsdtCost: UsdtInventoryCost,
  transactions: Transaction[],
): VnTradeAnalytics {
  const usdtState = createUsdtInventoryState(openingBalances, openingUsdtCost)
  let vnQty = openingBalances.vn
  let vnTwdCostTotal =
    openingVnTwdRate !== null && openingVnTwdRate > 0 && vnQty > 0
      ? vnQty / openingVnTwdRate
      : 0
  let vnUsdtCostTotal =
    openingVnUsdtRate !== null && openingVnUsdtRate > 0 && vnQty > 0
      ? vnQty / openingVnUsdtRate
      : 0

  if (
    vnUsdtCostTotal === 0 &&
    vnQty > 0 &&
    openingVnUsdtRate === null &&
    openingVnTwdRate !== null &&
    openingVnTwdRate > 0 &&
    openingUsdtCost.twd !== null &&
    openingUsdtCost.twd > 0
  ) {
    vnUsdtCostTotal = vnQty / (openingVnTwdRate * openingUsdtCost.twd)
  }

  if (vnQty <= 0) {
    vnTwdCostTotal = 0
    vnUsdtCostTotal = 0
  }

  const buyImpliedTwdRateById = new Map<string, number>()
  const buyImpliedUsdtRateById = new Map<string, number>()
  const sellProfitById = new Map<string, SellProfitInfo>()

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx)) {
      if (tx.type === 'buy') {
        const usdtUnit = usdtUnitCostTwd(usdtState, openingUsdtCost)
        if (tx.payCurrency === 'twd') {
          buyImpliedTwdRateById.set(tx.id, tx.rate)
          if (usdtUnit !== null && usdtUnit > 0) {
            buyImpliedUsdtRateById.set(tx.id, tx.rate * usdtUnit)
          }
        } else if (usdtUnit !== null && usdtUnit > 0) {
          buyImpliedTwdRateById.set(tx.id, tx.rate / usdtUnit)
          buyImpliedUsdtRateById.set(tx.id, tx.rate)
        }

        vnQty += tx.vnAmount
        if (tx.payCurrency === 'twd') {
          vnTwdCostTotal += tx.twdAmount
          if (usdtUnit !== null && usdtUnit > 0) {
            vnUsdtCostTotal += tx.twdAmount / usdtUnit
          }
        } else if (usdtUnit !== null && usdtUnit > 0) {
          vnTwdCostTotal += tx.usdtAmount * usdtUnit
          vnUsdtCostTotal += tx.usdtAmount
        }
      } else {
        const vnUnitTwdRate =
          vnQty > 0 && vnTwdCostTotal > 0 ? vnQty / vnTwdCostTotal : null
        const costBasis =
          vnUnitTwdRate !== null && vnUnitTwdRate > 0
            ? tx.vnAmount / vnUnitTwdRate
            : 0
        const usdtUnit = usdtUnitCostTwd(usdtState, openingUsdtCost)
        const proceeds =
          tx.payCurrency === 'twd'
            ? tx.twdAmount
            : usdtUnit !== null
              ? tx.usdtAmount * usdtUnit
              : 0

        sellProfitById.set(tx.id, {
          unitCost: vnUnitTwdRate,
          costBasis,
          profit: proceeds - costBasis,
        })

        if (vnQty > 0) {
          const sellRatio = Math.min(tx.vnAmount / vnQty, 1)
          vnTwdCostTotal *= 1 - sellRatio
          vnUsdtCostTotal *= 1 - sellRatio
          vnQty -= tx.vnAmount

          if (vnQty <= 0) {
            vnQty = 0
            vnTwdCostTotal = 0
            vnUsdtCostTotal = 0
          }
        }
      }
    }

    applyUsdtInventoryTransaction(usdtState, tx, openingUsdtCost)
  }

  return {
    buyImpliedTwdRateById,
    buyImpliedUsdtRateById,
    sellProfitById,
    currentVnTwdRate:
      vnQty > 0 && vnTwdCostTotal > 0 ? vnQty / vnTwdCostTotal : null,
    currentVnUsdtRate:
      vnQty > 0 && vnUsdtCostTotal > 0 ? vnQty / vnUsdtCostTotal : null,
  }
}

function computeVnDayTotalProfit(
  openingBalances: Balances,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  openingUsdtCost: UsdtInventoryCost,
  transactions: Transaction[],
): number {
  const { sellProfitById } = computeVnTradeAnalytics(
    openingBalances,
    openingVnTwdRate,
    openingVnUsdtRate,
    openingUsdtCost,
    transactions,
  )
  return filterVnTradeTransactions(transactions)
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + (sellProfitById.get(tx.id)?.profit ?? 0), 0)
}

function settlementFromTotalAssets(assets: TotalAssetsTwd): Pick<
  DailySettlement,
  | 'totalAssetsTwd'
  | 'totalAssetsTwdCash'
  | 'totalAssetsUsdtInTwd'
  | 'totalAssetsVnInTwd'
  | 'dayVnTwdRate'
  | 'dayVnUsdtRate'
  | 'totalAssetsComplete'
  | 'totalAssetsMissingNotes'
> {
  return {
    totalAssetsTwd: assets.total,
    totalAssetsTwdCash: assets.twdCash,
    totalAssetsUsdtInTwd: assets.usdtInTwd,
    totalAssetsVnInTwd: assets.vnInTwd,
    dayVnTwdRate: assets.dayVnTwdRate,
    dayVnUsdtRate: assets.dayVnUsdtRate,
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
    dayVnUsdtRate: item.dayVnUsdtRate ?? null,
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

interface VnTradeFormValues {
  vn: string
  pay: string
  rate: string
}

/** 三方互相計算：VN = 支付金額 × 匯率 */
function syncVnTradeFormFields(
  field: 'vn' | 'pay' | 'rate',
  value: string,
  current: VnTradeFormValues,
): VnTradeFormValues {
  const next: VnTradeFormValues = {
    vn: field === 'vn' ? value : current.vn,
    pay: field === 'pay' ? value : current.pay,
    rate: field === 'rate' ? value : current.rate,
  }

  const vn = parsePositive(next.vn)
  const pay = parsePositive(next.pay)
  const rate = parsePositive(next.rate)

  switch (field) {
    case 'vn':
      if (vn && rate) {
        next.pay = formatFiatInput(vn / rate)
      } else if (vn && pay) {
        next.rate = formatRateCalc(vn / pay)
      }
      break
    case 'rate':
      if (pay && rate) {
        next.vn = formatFiatInput(pay * rate)
      } else if (rate && vn) {
        next.pay = formatFiatInput(vn / rate)
      }
      break
    case 'pay':
      if (pay && rate) {
        next.vn = formatFiatInput(pay * rate)
      } else if (pay && vn) {
        next.rate = formatRateCalc(vn / pay)
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

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isUsdtTransaction(tx)) {
      if (tx.type === 'buy') {
        usdtQty += tx.usdtAmount
        if (tx.fiatCurrency === 'twd') {
          twdCostTotal += tx.fiatAmount
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
      continue
    }

    if (isVnTradeTransaction(tx)) {
      if (tx.payCurrency !== 'usdt') continue

      if (tx.type === 'buy') {
      if (usdtQty <= 0) continue

      const spendRatio = Math.min(tx.usdtAmount / usdtQty, 1)
      twdCostTotal *= 1 - spendRatio
      vnCostTotal *= 1 - spendRatio
      usdtQty -= tx.usdtAmount

      if (usdtQty <= 0) {
        usdtQty = 0
        twdCostTotal = 0
        vnCostTotal = 0
      }
    } else {
      const unitTwd = usdtQty > 0 ? twdCostTotal / usdtQty : openingCost.twd ?? 0
      usdtQty += tx.usdtAmount
      twdCostTotal += tx.usdtAmount * unitTwd
      }
      continue
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

function computeUsdtDayTotalProfit(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: UsdtTransaction[],
): number {
  const profitById = computeSellProfitById(openingBalances, openingCost, transactions)
  return transactions
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + (profitById.get(tx.id)?.profit ?? 0), 0)
}

function computeDayExpenseTotal(transactions: Transaction[]): number {
  return filterExpenseTransactions(transactions).reduce(
    (sum, tx) => sum + tx.amountTwd,
    0,
  )
}

function computePendingExpenseBreakdown(
  expenses: ExpenseTransaction[],
): { label: string; amount: number }[] {
  const byType = new Map<string, number>()
  for (const tx of expenses) {
    const label = expenseTypeLabel(tx.expenseType)
    byType.set(label, (byType.get(label) ?? 0) + tx.amountTwd)
  }
  return [...byType.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)
}

function buildExpenseSettlementFromPending(
  expenses: ExpenseTransaction[],
  balances: Balances,
): ExpenseSettlement | null {
  if (expenses.length === 0) return null

  const total = computeDayExpenseTotal(expenses)
  const settledAt = expenses.reduce(
    (latest, tx) => (tx.timestamp.getTime() > latest.getTime() ? tx.timestamp : latest),
    expenses[0].timestamp,
  )

  return {
    id: crypto.randomUUID(),
    settledAt,
    dateLabel: `${formatSettlementDate(settledAt)} 月結封存`,
    twdBalance: balances.twd,
    expenseCount: expenses.length,
    expenseTotal: total,
    items: expenses.map((tx) => ({
      expenseType: tx.expenseType,
      amountTwd: tx.amountTwd,
      note: tx.note,
      timestamp: tx.timestamp,
    })),
  }
}

function assembleExpenseSettlementsForMonthlyClose(
  buffered: ExpenseSettlement[],
  pending: ExpenseTransaction[],
  balances: Balances,
): ExpenseSettlement[] {
  const result = buffered.map(cloneExpenseSettlement)
  const fromPending = buildExpenseSettlementFromPending(pending, balances)
  if (fromPending) result.push(fromPending)
  return result
}

const EMPTY_EXPENSE_BY_CATEGORY: Record<ExpenseType, number> = {
  rent: 0,
  fuel: 0,
  parking: 0,
  meal: 0,
  telecom: 0,
  misc: 0,
  other: 0,
}

function cloneDailySettlement(item: DailySettlement): DailySettlement {
  return { ...item, settledAt: new Date(item.settledAt) }
}

function cloneExpenseSettlement(item: ExpenseSettlement): ExpenseSettlement {
  return {
    ...item,
    settledAt: new Date(item.settledAt),
    items: item.items.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    })),
  }
}

function computeExpenseByCategory(
  settlements: ExpenseSettlement[],
): Record<ExpenseType, number> {
  const totals = { ...EMPTY_EXPENSE_BY_CATEGORY }
  for (const settlement of settlements) {
    for (const item of settlement.items) {
      totals[item.expenseType] += item.amountTwd
    }
  }
  return totals
}

function computeArchivedDateRange(
  tradeSettlements: DailySettlement[],
  expenseSettlements: ExpenseSettlement[],
): { start: Date | null; end: Date | null } {
  const dates = [
    ...tradeSettlements.map((item) => item.settledAt),
    ...expenseSettlements.map((item) => item.settledAt),
  ]
  if (dates.length === 0) return { start: null, end: null }
  const times = dates.map((date) => date.getTime())
  return {
    start: new Date(Math.min(...times)),
    end: new Date(Math.max(...times)),
  }
}

function formatArchiveDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return '—'
  const startLabel = formatSettlementDate(start)
  const endLabel = formatSettlementDate(end)
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
}

function suggestMonthlyPeriodLabel(): string {
  return `${new Date().getMonth() + 1}月份`
}

function buildMonthlyClosePreview(
  tradeSettlements: DailySettlement[],
  expenseSettlements: ExpenseSettlement[],
  pendingExpenses: ExpenseTransaction[],
  pendingTradeCount: number,
  balances: Balances,
) {
  const assembledExpenses = assembleExpenseSettlementsForMonthlyClose(
    expenseSettlements,
    pendingExpenses,
    balances,
  )
  const grossProfit = tradeSettlements.reduce((sum, item) => sum + item.dayTotalProfit, 0)
  const expenseTotal = assembledExpenses.reduce((sum, item) => sum + item.expenseTotal, 0)
  const expenseItemCount = assembledExpenses.reduce((sum, item) => sum + item.expenseCount, 0)
  const { start, end } = computeArchivedDateRange(tradeSettlements, assembledExpenses)

  return {
    tradeCount: tradeSettlements.length,
    expenseBatchCount: assembledExpenses.length,
    expenseItemCount,
    grossProfit,
    expenseTotal,
    netProfit: grossProfit - expenseTotal,
    dateRangeLabel: formatArchiveDateRange(start, end),
    pendingTradeCount,
    pendingExpenseCount: pendingExpenses.length,
  }
}

function inferOpeningTotalAssets(
  archivedTrade: DailySettlement[],
  closingBookTotal: number,
  netProfit: number,
): number {
  if (archivedTrade.length > 0) {
    const first = [...archivedTrade].sort(
      (a, b) => a.settledAt.getTime() - b.settledAt.getTime(),
    )[0]
    return first.totalAssetsTwd - first.dayTotalProfit
  }
  return closingBookTotal - netProfit
}

function normalizeMonthlyCloseRecord(item: MonthlyClose): MonthlyClose & { openingTotalAssets: number } {
  const openingTotalAssets =
    item.openingTotalAssets ??
    inferOpeningTotalAssets(item.tradeSettlements, item.closingBookTotalAssets ?? item.closingTotalAssets, item.netProfit)
  const closingBookTotalAssets = item.closingBookTotalAssets ?? item.closingTotalAssets

  return {
    ...item,
    openingTotalAssets,
    closingBookTotalAssets,
    closingTotalAssets: openingTotalAssets + item.netProfit,
  }
}

function normalizeLoadedSettlement(item: DailySettlement): DailySettlement {
  return {
    ...item,
    settledAt: new Date(item.settledAt),
    dayVnUsdtRate: item.dayVnUsdtRate ?? null,
  }
}

function buildMonthlyClose(
  periodLabel: string,
  tradeSettlements: DailySettlement[],
  expenseSettlements: ExpenseSettlement[],
  fallbackBalances: Balances,
  fallbackUsdtCost: UsdtInventoryCost,
  fallbackVnTwdRate: number | null,
  fallbackVnUsdtRate: number | null,
  fallbackTotalAssets: number,
): MonthlyClose {
  const archivedTrade = tradeSettlements.map(cloneDailySettlement)
  const archivedExpense = expenseSettlements.map(cloneExpenseSettlement)
  const { start, end } = computeArchivedDateRange(archivedTrade, archivedExpense)
  const grossProfit = archivedTrade.reduce((sum, item) => sum + item.dayTotalProfit, 0)
  const usdtProfit = archivedTrade.reduce(
    (sum, item) => sum + (item.dayUsdtProfit ?? 0),
    0,
  )
  const vnProfit = archivedTrade.reduce((sum, item) => sum + (item.dayVnProfit ?? 0), 0)
  const expenseTotal = archivedExpense.reduce((sum, item) => sum + item.expenseTotal, 0)
  const netProfit = grossProfit - expenseTotal
  const openingTotalAssets = inferOpeningTotalAssets(
    archivedTrade,
    fallbackTotalAssets,
    netProfit,
  )

  return {
    id: crypto.randomUUID(),
    periodLabel: periodLabel.trim(),
    closedAt: new Date(),
    actualStartDate: start,
    actualEndDate: end,
    grossProfit,
    usdtProfit,
    vnProfit,
    expenseTotal,
    netProfit,
    expenseByCategory: computeExpenseByCategory(archivedExpense),
    openingTotalAssets,
    closingBalances: { ...fallbackBalances },
    closingUsdtCost: { ...fallbackUsdtCost },
    closingVnTwdRate: fallbackVnTwdRate,
    closingVnUsdtRate: fallbackVnUsdtRate,
    closingTotalAssets: openingTotalAssets + netProfit,
    closingBookTotalAssets: fallbackTotalAssets,
    tradeSettlements: archivedTrade,
    expenseSettlements: archivedExpense,
  }
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

function settlementHasSplitProfit(item: DailySettlement): boolean {
  return item.dayUsdtProfit !== undefined && item.dayVnProfit !== undefined
}

function SettlementDayProfit({
  usdtProfit,
  vnProfit,
  totalProfit,
  expenseTotal,
  netProfit,
}: {
  usdtProfit: number | undefined
  vnProfit: number | undefined
  totalProfit: number
  expenseTotal?: number
  netProfit?: number
}) {
  const showSplit = usdtProfit !== undefined && vnProfit !== undefined
  const showNet = expenseTotal !== undefined && expenseTotal > 0

  if (!showSplit && !showNet) {
    return (
      <p className={`text-xs font-bold tabular-nums ${profitColorClass(totalProfit)}`}>
        {formatProfit(totalProfit)}
      </p>
    )
  }

  return (
    <div className="text-xs tabular-nums leading-tight">
      {showSplit ? (
        <>
          <p className={profitColorClass(usdtProfit!)}>
            U {formatProfit(usdtProfit!)}
          </p>
          <p className={profitColorClass(vnProfit!)}>
            VN {formatProfit(vnProfit!)}
          </p>
          <p className={`mt-0.5 font-semibold ${profitColorClass(totalProfit)}`}>
            毛利 {formatProfit(totalProfit)}
          </p>
        </>
      ) : (
        <p className={`font-semibold ${profitColorClass(totalProfit)}`}>
          毛利 {formatProfit(totalProfit)}
        </p>
      )}
      {showNet && (
        <>
          <p className="mt-0.5 text-rose-600">
            開銷 −{formatTwd(expenseTotal!)}
          </p>
          <p className={`mt-0.5 font-bold ${profitColorClass(netProfit ?? totalProfit - expenseTotal!)}`}>
            淨利 {formatProfit(netProfit ?? totalProfit - expenseTotal!)}
          </p>
        </>
      )}
    </div>
  )
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
  if (isExpenseTransaction(tx)) {
    return [
      `類型：開銷（${expenseTypeLabel(tx.expenseType)}）`,
      `金額：${formatTwd(tx.amountTwd)} TWD`,
      `備註：${tx.note.trim() || '—'}`,
    ]
  }

  if (isVnTradeTransaction(tx)) {
    const typeLabel = tx.type === 'buy' ? '買入 VN' : '賣出 VN'
    const payLabel = tx.payCurrency === 'usdt' ? 'USDT' : 'TWD'
    const payAmount =
      tx.payCurrency === 'usdt'
        ? formatNumber(tx.usdtAmount)
        : formatTwd(tx.twdAmount)
    const rateUnit = tx.payCurrency === 'usdt' ? 'VN/USDT' : 'VN/TWD'
    return [
      `類型：${typeLabel}（${payLabel}）`,
      `VN：${formatNumber(tx.vnAmount)}`,
      `${payLabel}：${payAmount}`,
      `匯率 (${rateUnit})：${formatRateDisplay(tx.rate)}`,
    ]
  }

  const typeLabel = tx.type === 'buy' ? '買入' : '賣出'
  return [
    `類型：${typeLabel}（TWD）`,
    `USDT：${formatNumber(tx.usdtAmount)}`,
    `金額：${formatTwd(tx.fiatAmount)}`,
    `匯率 (TWD/USDT)：${formatRateDisplay(tx.rate)}`,
  ]
}

function buildTradeSettleConfirmLines(
  transactions: Transaction[],
  balances: Balances,
  inventoryCost: UsdtInventoryCost,
  openingBalances: Balances,
  openingUsdtCost: UsdtInventoryCost,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
): string[] {
  const usdtTxs = filterUsdtTransactions(transactions)
  const vnTxs = filterVnTradeTransactions(transactions)
  const buyCount = usdtTxs.filter((tx) => tx.type === 'buy').length
  const sellCount = usdtTxs.filter((tx) => tx.type === 'sell').length
  const vnBuyCount = vnTxs.filter((tx) => tx.type === 'buy').length
  const vnSellCount = vnTxs.filter((tx) => tx.type === 'sell').length
  const assets = computeTotalAssetsTwd(
    balances,
    inventoryCost,
    openingBalances,
    openingUsdtCost,
    openingVnTwdRate,
    openingVnUsdtRate,
    transactions,
  )
  const dayUsdtProfit = computeUsdtDayTotalProfit(
    openingBalances,
    openingUsdtCost,
    usdtTxs,
  )
  const dayVnProfit = computeVnDayTotalProfit(
    openingBalances,
    openingVnTwdRate,
    openingVnUsdtRate,
    openingUsdtCost,
    transactions,
  )
  const dayTotalProfit = dayUsdtProfit + dayVnProfit
  const profitLines: string[] = []
  if (sellCount > 0 || vnSellCount > 0) {
    if (sellCount > 0) {
      profitLines.push(`USDT 利潤：${formatProfit(dayUsdtProfit)} TWD`)
    }
    if (vnSellCount > 0) {
      profitLines.push(`VN 利潤：${formatProfit(dayVnProfit)} TWD`)
    }
    profitLines.push(`當日毛利：${formatProfit(dayTotalProfit)} TWD`)
  } else {
    profitLines.push('當日毛利：—（無賣出）')
  }
  const tradeCount = usdtTxs.length + vnTxs.length
  return [
    `交易筆數：${tradeCount}（USDT 買 ${buyCount} / 賣 ${sellCount}${
      vnTxs.length > 0 ? ` · VN 買 ${vnBuyCount} / 賣 ${vnSellCount}` : ''
    }）`,
    `台幣庫存：${formatTwd(balances.twd)}`,
    `USDT 庫存：${formatNumber(balances.usdt)}${
      balances.usdt > 0 && inventoryCost.twd !== null
        ? `（@${formatRateDisplay(inventoryCost.twd)}）`
        : ''
    }`,
    `VN 庫存：${formatNumber(balances.vn)}${
      balances.vn > 0 && assets.dayVnTwdRate !== null
        ? `（${formatVnNtdCostRateCompact(assets.dayVnTwdRate)}${
            assets.dayVnUsdtRate !== null
              ? ` · ${formatVnUsdtCostRateCompact(assets.dayVnUsdtRate)}`
              : ''
          }）`
        : ''
    }`,
    ...profitLines,
    `帳面總資產：${formatTwd(assets.total)} TWD${
      assets.isComplete ? '' : '（部分換算）'
    }`,
    '',
    '結算後將封存交易紀錄並清空每日明細（開銷紀錄不受影響）。',
  ]
}

interface AppSnapshot {
  transactions: Transaction[]
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
  settlements: DailySettlement[]
  expenseSettlements: ExpenseSettlement[]
  monthlyCloses: MonthlyClose[]
  selectedMonthlyCloseId: string | null
  activeTab: PageTab
  dailyWorkTab: DailyWorkTab
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

type AccentColor = 'emerald' | 'rose' | 'violet' | 'orange'

function formCardClass(accent: AccentColor, isEditing: boolean): string {
  if (isEditing) {
    return 'shrink-0 rounded-lg border border-slate-200 border-l-4 border-l-amber-400 bg-white p-2 shadow-sm ring-1 ring-amber-100'
  }
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
    orange: 'border-l-orange-500',
  }[accent]
  return `shrink-0 rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-2 shadow-sm`
}

function recordCardClass(accent: AccentColor): string {
  const accentBorder = {
    emerald: 'border-l-emerald-500',
    rose: 'border-l-rose-500',
    violet: 'border-l-violet-500',
    orange: 'border-l-orange-500',
  }[accent]
  return `flex flex-col rounded-lg border border-slate-200 border-l-4 ${accentBorder} bg-white p-1.5 shadow-sm`
}

function TotalAssetsColumn({ assets }: { assets: TotalAssetsTwd }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center leading-tight shadow-sm">
      <p className="text-[10px] font-medium text-slate-500">
        帳面總資產
        <span className="ml-0.5 font-normal text-slate-400">TWD</span>
        {!assets.isComplete && (
          <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-700">
            部分
          </span>
        )}
      </p>
      <p
        className="text-sm font-bold tabular-nums text-indigo-700"
        title={formatTwd(assets.total)}
      >
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

interface DailyBalanceStripProps {
  balances: Balances
  inventoryCost: UsdtInventoryCost
  totalAssets: TotalAssetsTwd
  vnTwdRate: number | null
  vnUsdtRate: number | null
}

function DailyBalanceStrip({
  balances,
  inventoryCost,
  totalAssets,
  vnTwdRate,
  vnUsdtRate,
}: DailyBalanceStripProps) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center shadow-sm">
        <p className="text-[10px] font-medium text-slate-500">TWD</p>
        <p className="text-sm font-bold tabular-nums text-slate-800" title={formatTwd(balances.twd)}>
          {formatTwd(balances.twd)}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center shadow-sm">
        <p className="text-[10px] font-medium text-slate-500">USDT</p>
        <p className="text-sm font-bold tabular-nums text-slate-800">
          {formatNumber(balances.usdt)}
        </p>
        {balances.usdt > 0 && inventoryCost.twd !== null && (
          <p className="text-[10px] tabular-nums text-slate-400">
            @{formatRateDisplay(inventoryCost.twd)}
          </p>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center shadow-sm">
        <p className="text-[10px] font-medium text-slate-500">VN</p>
        <p
          className="text-sm font-bold tabular-nums text-slate-800"
          title={formatNumber(balances.vn)}
        >
          {formatCompactNumber(balances.vn)}
        </p>
        {balances.vn > 0 && (
          <VnPoolCostLines
            twdRate={vnTwdRate}
            usdtRate={vnUsdtRate}
            className="text-[10px] tabular-nums text-slate-400"
          />
        )}
      </div>
      <TotalAssetsColumn assets={totalAssets} />
    </div>
  )
}

interface DailyTradeSettleBarProps {
  tradeCount: number
  onSettle: () => void
}

function DailyTradeSettleBar({ tradeCount, onSettle }: DailyTradeSettleBarProps) {
  const canSettle = tradeCount > 0

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-slate-50 px-2.5 py-1.5">
      <div className="min-w-0">
        <span className="text-xs font-semibold text-slate-800">
          待結算
          <span className="ml-1 text-[10px] font-normal text-slate-500">{tradeCount} 筆</span>
        </span>
        <p className="text-[10px] text-slate-400">結算後封存至「每日結算」</p>
      </div>
      <button
        type="button"
        onClick={onSettle}
        disabled={!canSettle}
        className="shrink-0 rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
      >
        {canSettle ? '交易結算' : '尚無可結交易'}
      </button>
    </div>
  )
}

function applyExpenseTransaction(balances: Balances, tx: ExpenseTransaction): Balances {
  return {
    ...balances,
    twd: balances.twd - tx.amountTwd,
  }
}

function applyUsdtTransaction(balances: Balances, tx: UsdtTransaction): Balances {
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

function applyVnTradeTransaction(balances: Balances, tx: VnTradeTransaction): Balances {
  const next = { ...balances }

  if (tx.type === 'buy') {
    next.vn += tx.vnAmount
    if (tx.payCurrency === 'usdt') {
      next.usdt -= tx.usdtAmount
    } else {
      next.twd -= tx.twdAmount
    }
  } else {
    next.vn -= tx.vnAmount
    if (tx.payCurrency === 'usdt') {
      next.usdt += tx.usdtAmount
    } else {
      next.twd += tx.twdAmount
    }
  }

  return next
}

function applyTransaction(balances: Balances, tx: Transaction): Balances {
  if (isExpenseTransaction(tx)) return applyExpenseTransaction(balances, tx)
  if (isUsdtTransaction(tx)) return applyUsdtTransaction(balances, tx)
  return applyVnTradeTransaction(balances, tx)
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
    if (isExpenseTransaction(tx)) {
      if (tx.amountTwd <= 0) {
        return '請輸入有效的正數金額'
      }
      if (tx.amountTwd > balances.twd) {
        return '台幣庫存不足'
      }
      balances = applyExpenseTransaction(balances, tx)
      continue
    }

    if (isVnTradeTransaction(tx)) {
      const payAmount = vnTradePayAmount(tx)
      if (tx.vnAmount <= 0 || payAmount <= 0) {
        return '請輸入有效的正數金額'
      }
      if (tx.type === 'buy') {
        if (tx.payCurrency === 'twd' && tx.twdAmount > balances.twd) {
          return '台幣庫存不足'
        }
        if (tx.payCurrency === 'usdt' && tx.usdtAmount > balances.usdt) {
          return 'USDT 庫存不足'
        }
      } else if (tx.vnAmount > balances.vn) {
        return 'VN 庫存不足'
      }
      balances = applyVnTradeTransaction(balances, tx)
      continue
    }

    if (!isUsdtTransaction(tx)) continue

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

    balances = applyUsdtTransaction(balances, tx)
  }

  return null
}

interface TransactionTableProps {
  transactions: UsdtTransaction[]
  editingId: string | null
  onEdit: (tx: UsdtTransaction) => void
  onDelete: (id: string) => void
  accent: 'buy' | 'sell'
  sideLabel: string
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

const TRANSACTION_ROW_HEIGHT_REM = 2.5
const TRANSACTION_HEAD_REM = 2
const TRANSACTION_FOOT_REM = 2.5
const TRANSACTION_TABLE_CLASS = 'w-full min-w-[260px] table-fixed text-left text-xs'
const TRANSACTION_DATA_ROW_STYLE = { height: `${TRANSACTION_ROW_HEIGHT_REM}rem` } as const
const TRANSACTION_CELL_CLASS = 'align-middle px-1.5 leading-none'

function transactionBodyMaxHeight(visibleRows: number): string {
  return `calc(${TRANSACTION_ROW_HEIGHT_REM}rem * ${visibleRows})`
}

function transactionTableLayout(visibleRows: number, transactionCount: number) {
  return {
    hasOverflow: transactionCount > visibleRows,
    maxBodyHeight: transactionBodyMaxHeight(visibleRows),
  }
}

function useTableScrollAffordance(
  ref: RefObject<HTMLDivElement | null>,
  itemCount: number,
) {
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [canScrollUp, setCanScrollUp] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const maxScroll = Math.max(0, scrollHeight - clientHeight)
      const scrollRemaining = maxScroll - scrollTop
      setCanScrollDown(scrollRemaining > 4)
      setCanScrollUp(scrollTop > 4)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref, itemCount])

  return { canScrollDown, canScrollUp }
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
        <td colSpan={2} className={`${TRANSACTION_CELL_CLASS} font-semibold text-slate-800`}>
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
  sideLabel,
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

  const { maxBodyHeight, hasOverflow } = transactionTableLayout(
    visibleRows,
    transactions.length,
  )
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
  const emptyColSpan = isBuy ? 5 : 6

  const internalBodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = bodyScrollRef ?? internalBodyRef
  const { canScrollDown, canScrollUp } = useTableScrollAffordance(
    scrollRef,
    transactions.length,
  )

  useEffect(() => {
    if (!editingId) return
    const row = document.querySelector(`[data-usdt-row="${editingId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editingId])

  const transactionRows = transactions.map((tx) => {
    const profitInfo = sellProfitById?.get(tx.id)
    return (
      <tr
        key={tx.id}
        data-usdt-row={tx.id}
        style={TRANSACTION_DATA_ROW_STYLE}
        className={`group border-b border-slate-100 transition-colors hover:bg-slate-100/70 ${
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
          <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <RowActionButtons
              onEdit={() => onEdit(tx)}
              onDelete={() => onDelete(tx.id)}
            />
          </div>
        </td>
      </tr>
    )
  })

  const emptyBody = (
    <tr style={TRANSACTION_DATA_ROW_STYLE}>
      <td colSpan={emptyColSpan} className={`${TRANSACTION_CELL_CLASS} py-8 text-center`}>
        <p className="text-sm text-slate-400">尚無{sideLabel}紀錄</p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          在上方輸入 USDT 與匯率後按「新增」
        </p>
      </td>
    </tr>
  )

  if (!hasOverflow) {
    return (
      <div className="overflow-x-auto">
        <table className={TRANSACTION_TABLE_CLASS}>
          <TransactionTableHeader isBuy={isBuy} />
          <tbody>
            {transactions.length === 0 ? emptyBody : transactionRows}
          </tbody>
          <TransactionTableFooter {...footerProps} />
        </table>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-col overflow-x-auto">
      <table className={`${TRANSACTION_TABLE_CLASS} shrink-0`}>
        <TransactionTableHeader isBuy={isBuy} />
      </table>
      <div className="relative shrink-0">
        <div
          ref={scrollRef}
          className="transaction-table-body-scroll--overflow overflow-x-auto overflow-y-auto"
          style={{ maxHeight: maxBodyHeight }}
          onScroll={(event) => onBodyScroll?.(event.currentTarget.scrollTop)}
        >
          <table className={TRANSACTION_TABLE_CLASS}>
            <tbody>{transactionRows}</tbody>
          </table>
        </div>
        {canScrollUp && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-white to-transparent"
            aria-hidden
          />
        )}
        {canScrollDown && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-white via-white/90 to-transparent"
            aria-hidden
          />
        )}
      </div>
      <table className={`${TRANSACTION_TABLE_CLASS} shrink-0`}>
        <TransactionTableFooter {...footerProps} />
      </table>
    </div>
  )
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
  focusKey: number
  onFieldChange: (field: 'usdt' | 'fiat' | 'rate', value: string) => void
  onSubmit: (e: FormEvent) => void
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
  focusKey,
  onFieldChange,
  onSubmit,
  onCancel,
  accentClass,
  buttonClass,
  focusClass,
  balances,
  inventoryUnitCost = null,
}: TradeFormProps) {
  const usdtRef = useRef<HTMLInputElement>(null)
  const prefix = type === 'buy' ? 'buy' : 'sell'
  const inputClass = `${TRADE_INPUT_CLASS} ${focusClass}`

  const usdtNum = parseFloat(usdt)
  const fiatNum = parseFloat(fiat)
  const usdtValid = !Number.isNaN(usdtNum) && usdtNum > 0
  const fiatValid = !Number.isNaN(fiatNum) && fiatNum > 0
  const twdInsufficient = type === 'buy' && fiatValid && fiatNum > balances.twd
  const usdtInsufficient = type === 'sell' && usdtValid && usdtNum > balances.usdt

  useEffect(() => {
    if (!disabled && !isEditing) {
      usdtRef.current?.focus()
    }
  }, [disabled, isEditing, focusKey])

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

  const balanceLine =
    type === 'buy'
      ? `台幣餘額 ${formatTwd(balances.twd)}${
          fiatValid ? ` → 扣後 ${formatTwd(balances.twd - fiatNum)}` : ''
        }`
      : `USDT 餘額 ${formatNumber(balances.usdt)}${
          usdtValid ? ` → 扣後 ${formatNumber(balances.usdt - usdtNum)}` : ''
        }`

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
        <h2 className={`text-xs font-semibold ${accentClass}`}>
          {isEditing ? editTitle : title}
        </h2>
        {inventoryUnitCost !== null && (
          <p className="text-[10px] tabular-nums text-slate-500">
            @{formatRateDisplay(inventoryUnitCost)}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-[10px] text-slate-600">
            USDT
            {type === 'sell' && (
              <span className="ml-0.5 font-normal text-slate-400">
                ({formatNumber(balances.usdt)})
              </span>
            )}
            <input
              ref={usdtRef}
              id={`${prefix}Usdt`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={usdt}
              onChange={(e) => onFieldChange('usdt', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={`mt-0.5 ${inputClass}`}
            />
          </label>
          <label className="block w-full shrink-0 text-[10px] text-slate-600 sm:w-[4.5rem]">
            匯率
            <input
              id={`${prefix}Rate`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => onFieldChange('rate', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={`mt-0.5 ${inputClass}`}
            />
          </label>
          <label className="block min-w-0 flex-1 text-[10px] text-slate-600">
            台幣
            {type === 'buy' && (
              <span className="ml-0.5 font-normal text-slate-400">
                ({formatTwd(balances.twd)})
              </span>
            )}
            <input
              id={`${prefix}Fiat`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={fiat}
              onChange={(e) => onFieldChange('fiat', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={`mt-0.5 ${inputClass}`}
            />
          </label>
          <div className="flex shrink-0 gap-1 sm:pb-px">
            <button
              type="submit"
              disabled={disabled}
              className={`rounded px-3 py-1 text-xs font-medium text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isEditing
                  ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30'
                  : buttonClass
              }`}
            >
              {isEditing ? '儲存' : '新增'}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
            )}
          </div>
        </div>

        <p
          className={`mt-1 text-[10px] tabular-nums ${
            twdInsufficient || usdtInsufficient || previewWarn
              ? 'text-rose-600'
              : 'text-slate-500'
          }`}
        >
          {balanceLine}
          {previewText && (
            <span className="ml-1 text-slate-400">· {previewText}</span>
          )}
        </p>

        {profitPreview && (
          <p
            className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
              profitPreview.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {profitPreview.text}
          </p>
        )}

        {error && (
          <p className="mt-1 text-[10px] text-rose-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

function DailyWorkTabBar({
  value,
  onChange,
}: {
  value: DailyWorkTab
  onChange: (tab: DailyWorkTab) => void
}) {
  const tabClass = (tab: DailyWorkTab) =>
    `flex-1 border-b-2 px-2 py-1.5 text-[11px] font-medium transition ${
      value === tab
        ? 'border-slate-900 text-slate-900'
        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
    }`

  return (
    <div className="mb-2 flex gap-1 border-b border-slate-200">
      <button type="button" className={tabClass('usdt')} onClick={() => onChange('usdt')}>
        USDT 買賣
      </button>
      <button type="button" className={tabClass('vn')} onClick={() => onChange('vn')}>
        VN 買賣
      </button>
    </div>
  )
}

function VnPayCurrencyToggle({
  value,
  onChange,
  disabled,
  buySide,
}: {
  value: VnPayCurrency
  onChange: (currency: VnPayCurrency) => void
  disabled?: boolean
  buySide?: boolean
}) {
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
        onClick={() => onChange('usdt')}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
          value === 'usdt'
            ? 'bg-white text-sky-700 shadow-sm'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {buySide ? 'USDT 買' : '換 USDT'}
      </button>
    </div>
  )
}

interface VnTradeFormProps {
  type: TransactionType
  title: string
  editTitle: string
  payCurrency: VnPayCurrency
  onPayCurrencyChange: (currency: VnPayCurrency) => void
  vn: string
  pay: string
  rate: string
  error: string
  isEditing: boolean
  disabled: boolean
  focusKey: number
  onFieldChange: (field: 'vn' | 'pay' | 'rate', value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
  accentClass: string
  buttonClass: string
  focusClass: string
  balances: Balances
  usdtInventoryCostTwd: number | null
  vnInventoryTwdRate: number | null
}

function VnTradeForm({
  type,
  title,
  editTitle,
  payCurrency,
  onPayCurrencyChange,
  vn,
  pay,
  rate,
  error,
  isEditing,
  disabled,
  focusKey,
  onFieldChange,
  onSubmit,
  onCancel,
  accentClass,
  buttonClass,
  focusClass,
  balances,
  usdtInventoryCostTwd,
  vnInventoryTwdRate,
}: VnTradeFormProps) {
  const vnRef = useRef<HTMLInputElement>(null)
  const prefix = type === 'buy' ? 'vnBuy' : 'vnSell'
  const inputClass = `${TRADE_INPUT_CLASS} ${focusClass}`
  const rateLabel = payCurrency === 'usdt' ? '匯率 (VN/USDT)' : '匯率 (VN/TWD)'
  const payLabel = payCurrency === 'usdt' ? 'USDT' : '台幣'

  const vnNum = parseFloat(vn)
  const payNum = parseFloat(pay)
  const vnValid = !Number.isNaN(vnNum) && vnNum > 0
  const payValid = !Number.isNaN(payNum) && payNum > 0
  const payInsufficient =
    type === 'buy' &&
    payValid &&
    (payCurrency === 'twd' ? payNum > balances.twd : payNum > balances.usdt)
  const vnInsufficient = type === 'sell' && vnValid && vnNum > balances.vn

  useEffect(() => {
    if (!disabled && !isEditing) {
      vnRef.current?.focus()
    }
  }, [disabled, isEditing, focusKey])

  let previewText: string | null = null
  let previewWarn = false
  let profitPreview: { text: string; value: number } | null = null
  if (vnValid && payValid) {
    const payDisplay =
      payCurrency === 'usdt' ? formatNumber(payNum) : formatTwd(payNum)
    if (type === 'buy') {
      previewText = `−${payLabel} ${payDisplay} · +VN ${formatNumber(vnNum)}`
      previewWarn =
        payCurrency === 'twd' ? payNum > balances.twd : payNum > balances.usdt
      if (payCurrency === 'usdt' && usdtInventoryCostTwd !== null && usdtInventoryCostTwd > 0) {
        const impliedVnTwd = vnNum / (payNum * usdtInventoryCostTwd)
        previewText += ` · ${formatVnNtdCostRate(impliedVnTwd)}`
        previewText += ` · ${formatVnUsdtCostRate(vnNum / payNum)}`
      } else if (payCurrency === 'twd' && usdtInventoryCostTwd !== null && usdtInventoryCostTwd > 0) {
        const impliedVnTwd = vnNum / payNum
        previewText += ` · ${formatVnNtdCostRate(impliedVnTwd)}`
        previewText += ` · ${formatVnUsdtCostRate(impliedVnTwd * usdtInventoryCostTwd)}`
      }
    } else {
      previewText = `−VN ${formatNumber(vnNum)} · +${payLabel} ${payDisplay}`
      previewWarn = vnNum > balances.vn
      if (
        vnInventoryTwdRate !== null &&
        vnInventoryTwdRate > 0 &&
        (payCurrency === 'twd' ||
          (usdtInventoryCostTwd !== null && usdtInventoryCostTwd > 0))
      ) {
        const costBasis = vnNum / vnInventoryTwdRate
        const proceeds =
          payCurrency === 'twd'
            ? payNum
            : payNum * (usdtInventoryCostTwd ?? 0)
        const profit = proceeds - costBasis
        profitPreview = {
          text: `花費 ${formatTwd(costBasis)}（${formatVnNtdCostRate(vnInventoryTwdRate)}）· 收款 ${formatTwd(proceeds)} · 利潤 ${formatProfit(profit)}`,
          value: profit,
        }
      }
    }
  }

  const balanceLine =
    type === 'buy'
      ? payCurrency === 'twd'
        ? `台幣餘額 ${formatTwd(balances.twd)}${
            payValid ? ` → 扣後 ${formatTwd(balances.twd - payNum)}` : ''
          }`
        : `USDT 餘額 ${formatNumber(balances.usdt)}${
            payValid ? ` → 扣後 ${formatNumber(balances.usdt - payNum)}` : ''
          }`
      : `VN 餘額 ${formatCompactNumber(balances.vn)}${
          vnValid ? ` → 扣後 ${formatCompactNumber(balances.vn - vnNum)}` : ''
        }`

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-xs font-semibold ${accentClass}`}>
          {isEditing ? editTitle : title}
        </h2>
        <VnPayCurrencyToggle
          value={payCurrency}
          onChange={onPayCurrencyChange}
          disabled={disabled}
          buySide={type === 'buy'}
        />
      </div>

      <form onSubmit={onSubmit}>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-[10px] text-slate-600">
            VN
            {type === 'sell' && (
              <span className="ml-0.5 font-normal text-slate-400" title={formatNumber(balances.vn)}>
                ({formatCompactNumber(balances.vn)})
              </span>
            )}
            <input
              ref={vnRef}
              id={`${prefix}Vn`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={vn}
              onChange={(e) => onFieldChange('vn', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={`mt-0.5 ${inputClass}`}
            />
          </label>
          <label className="block w-full shrink-0 text-[10px] text-slate-600 sm:w-[5.5rem]">
            {rateLabel}
            <input
              id={`${prefix}Rate`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => onFieldChange('rate', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={`mt-0.5 ${inputClass}`}
            />
          </label>
          <label className="block min-w-0 flex-1 text-[10px] text-slate-600">
            {payLabel}
            {type === 'buy' && (
              <span className="ml-0.5 font-normal text-slate-400">
                (
                {payCurrency === 'usdt'
                  ? formatNumber(balances.usdt)
                  : formatTwd(balances.twd)}
                )
              </span>
            )}
            <input
              id={`${prefix}Pay`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={pay}
              onChange={(e) => onFieldChange('pay', e.target.value)}
              disabled={disabled}
              placeholder="0"
              className={`mt-0.5 ${inputClass}`}
            />
          </label>
          <div className="flex shrink-0 gap-1 sm:pb-px">
            <button
              type="submit"
              disabled={disabled}
              className={`rounded px-3 py-1 text-xs font-medium text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                isEditing
                  ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30'
                  : buttonClass
              }`}
            >
              {isEditing ? '儲存' : '新增'}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
            )}
          </div>
        </div>

        <p
          className={`mt-1 text-[10px] tabular-nums ${
            payInsufficient || vnInsufficient || previewWarn
              ? 'text-rose-600'
              : 'text-slate-500'
          }`}
        >
          {balanceLine}
          {previewText && <span className="ml-1 text-slate-400">· {previewText}</span>}
        </p>

        {profitPreview && (
          <p
            className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
              profitPreview.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {profitPreview.text}
          </p>
        )}

        {error && (
          <p className="mt-1 text-[10px] text-rose-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

const VN_TRANSACTION_TABLE_CLASS = 'w-full min-w-[340px] table-fixed text-left text-xs'

interface VnTradeTableProps {
  transactions: VnTradeTransaction[]
  editingId: string | null
  onEdit: (tx: VnTradeTransaction) => void
  onDelete: (id: string) => void
  accent: 'buy' | 'sell'
  sideLabel: string
  showCostAverage?: boolean
  showSellAverage?: boolean
  openingBalances?: Balances
  openingUsdtCost?: UsdtInventoryCost
  allTransactions?: Transaction[]
  buyImpliedTwdRateById?: Map<string, number>
  buyImpliedUsdtRateById?: Map<string, number>
  sellProfitById?: Map<string, SellProfitInfo>
  visibleRows?: number
  bodyScrollRef?: RefObject<HTMLDivElement | null>
  onBodyScroll?: (scrollTop: number) => void
}

function VnTradeTable({
  transactions,
  editingId,
  onEdit,
  onDelete,
  accent,
  sideLabel,
  showCostAverage = false,
  showSellAverage = false,
  openingBalances,
  openingUsdtCost,
  allTransactions,
  buyImpliedTwdRateById,
  buyImpliedUsdtRateById,
  sellProfitById,
  visibleRows = 8,
  bodyScrollRef,
  onBodyScroll,
}: VnTradeTableProps) {
  const isBuy = accent === 'buy'
  const costAvg =
    showCostAverage && openingBalances && openingUsdtCost && allTransactions
      ? calculateVnBuyDayAverageRate(openingBalances, openingUsdtCost, allTransactions)
      : null
  const costUsdtAvg =
    showCostAverage && openingBalances && openingUsdtCost && allTransactions
      ? calculateVnBuyDayAverageUsdtRate(openingBalances, openingUsdtCost, allTransactions)
      : null
  const sellAvg =
    showSellAverage && openingBalances && openingUsdtCost && allTransactions
      ? computeVnSellDayAverageRate(openingBalances, openingUsdtCost, allTransactions)
      : null
  const totalVn = transactions.reduce((sum, tx) => sum + tx.vnAmount, 0)
  const totalTwd = transactions
    .filter((tx) => tx.payCurrency === 'twd')
    .reduce((sum, tx) => sum + tx.twdAmount, 0)
  const totalUsdt = transactions
    .filter((tx) => tx.payCurrency === 'usdt')
    .reduce((sum, tx) => sum + tx.usdtAmount, 0)
  const totalProfit = !isBuy
    ? transactions.reduce((sum, tx) => sum + (sellProfitById?.get(tx.id)?.profit ?? 0), 0)
    : 0
  const hasProfitData = !isBuy && sellProfitById !== undefined

  const { maxBodyHeight, hasOverflow } = transactionTableLayout(
    visibleRows,
    transactions.length,
  )

  const internalBodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = bodyScrollRef ?? internalBodyRef
  const { canScrollDown, canScrollUp } = useTableScrollAffordance(
    scrollRef,
    transactions.length,
  )

  useEffect(() => {
    if (!editingId) return
    const row = document.querySelector(`[data-vn-row="${editingId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editingId])

  const vnTableHeader = (
    <thead>
      <tr
        className="border-b border-slate-200 text-[11px] text-slate-500"
        style={{ height: `${TRANSACTION_HEAD_REM}rem` }}
      >
        <th className={`w-[4.5rem] ${TRANSACTION_CELL_CLASS} font-medium`}>時間</th>
        <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>VN</th>
        <th className={`w-14 ${TRANSACTION_CELL_CLASS} text-center font-medium`}>
          {isBuy ? '支付' : '兌換為'}
        </th>
        <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>金額</th>
        <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>
          {isBuy ? '成交匯率' : '匯率'}
        </th>
        {isBuy ? (
          <th className={`w-[5.25rem] ${TRANSACTION_CELL_CLASS} text-right font-medium leading-tight`}>
            成本
          </th>
        ) : (
          <th className={`${TRANSACTION_CELL_CLASS} text-right font-medium`}>利潤</th>
        )}
        <th className={`w-12 ${TRANSACTION_CELL_CLASS} text-right font-medium`}>操作</th>
      </tr>
    </thead>
  )

  const vnTableFooter = (
    <tfoot>
      <tr
        className={`border-t-2 bg-slate-50 ${
          isBuy ? 'border-violet-200' : 'border-amber-200'
        }`}
        style={{ height: `${TRANSACTION_FOOT_REM}rem` }}
      >
        <td colSpan={2} className={`${TRANSACTION_CELL_CLASS} font-semibold text-slate-800`}>
          總結
          <span className="ml-1 text-[10px] font-normal text-slate-500">
            {transactions.length} 筆
          </span>
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums font-medium text-slate-800`}>
          {formatNumber(totalVn)}
        </td>
        <td className={`w-14 ${TRANSACTION_CELL_CLASS} text-center text-[10px] text-slate-400`}>
          —
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right text-[10px] tabular-nums text-slate-600`}>
          {totalTwd > 0 && <span className="block text-emerald-700">T {formatTwd(totalTwd)}</span>}
          {totalUsdt > 0 && (
            <span className="block text-sky-700">U {formatNumber(totalUsdt)}</span>
          )}
          {totalTwd <= 0 && totalUsdt <= 0 && '—'}
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right text-[10px]`}>
          {showSellAverage ? (
            sellAvg !== null ? (
              <span className="font-bold tabular-nums text-amber-600">
                成交 {formatVnNtdCostRate(sellAvg)}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        {isBuy ? (
          <td className={`w-[5.25rem] ${TRANSACTION_CELL_CLASS} text-right text-[10px] leading-tight`}>
            {showCostAverage ? (
              costAvg !== null || costUsdtAvg !== null ? (
                <>
                  {costAvg !== null ? (
                    <span className="block font-bold tabular-nums text-violet-600">
                      {formatVnNtdCostRateCompact(costAvg)}
                    </span>
                  ) : (
                    <span className="block text-slate-400">—</span>
                  )}
                  {costUsdtAvg !== null ? (
                    <span className="block font-bold tabular-nums text-violet-600">
                      {formatVnUsdtCostRateCompact(costUsdtAvg)}
                    </span>
                  ) : (
                    <span className="block text-slate-400">—</span>
                  )}
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )
            ) : (
              '—'
            )}
          </td>
        ) : (
          <td
            className={`${TRANSACTION_CELL_CLASS} text-right text-[10px] font-semibold tabular-nums ${
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

  const vnTransactionRows = transactions.map((tx) => {
    const impliedTwdRate = buyImpliedTwdRateById?.get(tx.id)
    const impliedUsdtRate = buyImpliedUsdtRateById?.get(tx.id)
    const profitInfo = sellProfitById?.get(tx.id)
    const rateUnit = tx.payCurrency === 'usdt' ? 'VN/U' : 'VN/TWD'
    return (
      <tr
        key={tx.id}
        data-vn-row={tx.id}
        style={TRANSACTION_DATA_ROW_STYLE}
        className={`group border-b border-slate-100 transition-colors hover:bg-slate-100/70 ${
          editingId === tx.id ? 'bg-amber-50/60 hover:bg-amber-50/80' : ''
        }`}
      >
        <td className={`w-[4.5rem] whitespace-nowrap ${TRANSACTION_CELL_CLASS} tabular-nums text-[11px] text-slate-600`}>
          {formatTableDateTime(tx.timestamp)}
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums text-amber-700`}>
          {formatNumber(tx.vnAmount)}
        </td>
        <td className={`w-14 ${TRANSACTION_CELL_CLASS} text-center text-[10px] font-medium text-slate-500`}>
          {tx.payCurrency === 'usdt' ? 'USDT' : 'TWD'}
        </td>
        <td
          className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums ${
            tx.payCurrency === 'usdt' ? 'text-sky-700' : 'text-emerald-700'
          }`}
        >
          {tx.payCurrency === 'usdt'
            ? formatNumber(tx.usdtAmount)
            : formatTwd(tx.twdAmount)}
        </td>
        <td className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums text-slate-600`}>
          <span>{formatRateDisplay(tx.rate)}</span>
          <span className="ml-0.5 text-[9px] font-normal text-slate-400">{rateUnit}</span>
        </td>
        {isBuy ? (
          <td className={`w-[5.25rem] ${TRANSACTION_CELL_CLASS} text-right text-[10px] leading-tight tabular-nums text-violet-700`}>
            {impliedTwdRate !== undefined ? (
              <span className="block">{formatVnNtdCostRateCompact(impliedTwdRate)}</span>
            ) : (
              <span className="block text-slate-400">—</span>
            )}
            {impliedUsdtRate !== undefined ? (
              <span className="block">{formatVnUsdtCostRateCompact(impliedUsdtRate)}</span>
            ) : impliedTwdRate === undefined ? null : (
              <span className="block text-slate-400">—</span>
            )}
          </td>
        ) : (
          <td
            className={`${TRANSACTION_CELL_CLASS} text-right tabular-nums ${
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
          <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <RowActionButtons
              onEdit={() => onEdit(tx)}
              onDelete={() => onDelete(tx.id)}
            />
          </div>
        </td>
      </tr>
    )
  })

  if (!hasOverflow) {
    return (
      <div className="overflow-x-auto">
        <table className={VN_TRANSACTION_TABLE_CLASS}>
          {vnTableHeader}
          <tbody>
            {transactions.length === 0 ? (
              <tr style={TRANSACTION_DATA_ROW_STYLE}>
                <td
                  colSpan={7}
                  className={`${TRANSACTION_CELL_CLASS} py-8 text-center`}
                >
                  <p className="text-sm text-slate-400">尚無{sideLabel}紀錄</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    在上方輸入 VN 與匯率後按「新增」
                  </p>
                </td>
              </tr>
            ) : (
              vnTransactionRows
            )}
          </tbody>
          {vnTableFooter}
        </table>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-col overflow-x-auto">
      <table className={`${VN_TRANSACTION_TABLE_CLASS} shrink-0`}>{vnTableHeader}</table>
      <div className="relative shrink-0">
        <div
          ref={scrollRef}
          className="transaction-table-body-scroll--overflow overflow-x-auto overflow-y-auto"
          style={{ maxHeight: maxBodyHeight }}
          onScroll={(event) => onBodyScroll?.(event.currentTarget.scrollTop)}
        >
          <table className={VN_TRANSACTION_TABLE_CLASS}>
            <tbody>{vnTransactionRows}</tbody>
          </table>
        </div>
        {canScrollUp && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-white to-transparent"
            aria-hidden
          />
        )}
        {canScrollDown && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-white via-white/90 to-transparent"
            aria-hidden
          />
        )}
      </div>
      <table className={`${VN_TRANSACTION_TABLE_CLASS} shrink-0`}>{vnTableFooter}</table>
    </div>
  )
}

const EXPENSE_TABLE_CLASS = 'w-full min-w-[300px] table-fixed text-left text-xs'

interface ExpenseFormProps {
  expenseType: ExpenseType
  amount: string
  note: string
  error: string
  isEditing: boolean
  disabled: boolean
  twdBalance: number
  focusKey: number
  onExpenseTypeChange: (value: ExpenseType) => void
  onAmountChange: (value: string) => void
  onNoteChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}

function ExpenseForm({
  expenseType,
  amount,
  note,
  error,
  isEditing,
  disabled,
  twdBalance,
  focusKey,
  onExpenseTypeChange,
  onAmountChange,
  onNoteChange,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const amountRef = useRef<HTMLInputElement>(null)
  const amountNum = parseFloat(amount)
  const amountValid = !Number.isNaN(amountNum) && amountNum > 0
  const insufficient = amountValid && amountNum > twdBalance
  const isQuickType = EXPENSE_QUICK_TYPES.includes(expenseType)

  useEffect(() => {
    if (!disabled && !isEditing) {
      amountRef.current?.focus()
    }
  }, [disabled, isEditing, focusKey])

  return (
    <form onSubmit={onSubmit}>
      <h2 className="mb-1.5 text-xs font-semibold text-orange-700">
        {isEditing ? '編輯開銷' : '新增開銷'}
      </h2>
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        {EXPENSE_QUICK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onExpenseTypeChange(type)}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition disabled:opacity-50 ${
              expenseType === type
                ? 'bg-orange-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700'
            }`}
          >
            {expenseTypeLabel(type)}
          </button>
        ))}
        <select
          value={isQuickType ? '' : expenseType}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) {
              onExpenseTypeChange(e.target.value as ExpenseType)
            }
          }}
          className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 outline-none transition focus:border-orange-500 disabled:bg-slate-50"
        >
          <option value="">更多類別</option>
          {EXPENSE_TYPE_OPTIONS.filter(
            (item) => !EXPENSE_QUICK_TYPES.includes(item.value),
          ).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end">
        <label className="block shrink-0 text-[10px] text-slate-600 sm:w-[5.5rem]">
          金額 TWD
          <input
            ref={amountRef}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={amount}
            disabled={disabled}
            onChange={(e) => onAmountChange(e.target.value)}
            className={`mt-0.5 ${EXPENSE_INPUT_CLASS}`}
            placeholder="0"
          />
        </label>
        <label className="block min-w-0 flex-1 text-[10px] text-slate-600">
          備註（選填）
          <input
            type="text"
            value={note}
            disabled={disabled}
            onChange={(e) => onNoteChange(e.target.value)}
            className={`mt-0.5 ${EXPENSE_INPUT_CLASS}`}
            placeholder="例如：北區巡點"
          />
        </label>
        <div className="flex shrink-0 gap-1 sm:pb-px">
          <button
            type="submit"
            disabled={disabled}
            className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-orange-700 focus:ring-2 focus:ring-orange-600/30 disabled:opacity-50"
          >
            {isEditing ? '儲存' : '新增'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          )}
        </div>
      </div>
      <p
        className={`mt-1 text-[10px] tabular-nums ${
          insufficient ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        台幣餘額 {formatTwd(twdBalance)}
        {amountValid && (
          <span>
            {' '}
            → 扣後 {formatTwd(twdBalance - amountNum)}
            <span className="ml-1 text-slate-400">
              · {expenseTypeLabel(expenseType)}
            </span>
          </span>
        )}
      </p>
      {error && <p className="mt-1 text-[10px] text-rose-600">{error}</p>}
    </form>
  )
}

interface ExpensePageSummaryProps {
  transactions: ExpenseTransaction[]
}

function ExpensePageSummary({ transactions }: ExpensePageSummaryProps) {
  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amountTwd, 0)
  const breakdown = computePendingExpenseBreakdown(transactions)

  return (
    <div className="mt-2 shrink-0 space-y-1.5 border-t border-orange-100 pt-2">
      {breakdown.length > 0 && (
        <p className="text-[10px] leading-relaxed text-slate-500">
          {breakdown.map(({ label, amount }, index) => (
            <span key={label}>
              {index > 0 && ' · '}
              {label}{' '}
              <span className="tabular-nums text-rose-600">−{formatTwd(amount)}</span>
            </span>
          ))}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50/80 to-slate-50 px-2.5 py-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold text-slate-800">
            總結
            <span className="ml-1 text-[10px] font-normal text-slate-500">
              {transactions.length} 筆
            </span>
          </span>
          <span className="text-sm font-bold tabular-nums text-rose-600">
            −{formatTwd(totalAmount)}
          </span>
        </div>
        <p className="text-[10px] text-slate-400">將於月結時一併封存</p>
      </div>
    </div>
  )
}

interface ExpenseTableProps {
  transactions: ExpenseTransaction[]
  editingId: string | null
  onEdit: (tx: ExpenseTransaction) => void
  onDelete: (id: string) => void
  visibleRows?: number
}

function ExpenseTable({
  transactions,
  editingId,
  onEdit,
  onDelete,
  visibleRows = 8,
}: ExpenseTableProps) {
  const { maxBodyHeight, hasOverflow } = transactionTableLayout(
    visibleRows,
    transactions.length,
  )

  useEffect(() => {
    if (!editingId) return
    const row = document.querySelector(`[data-expense-row="${editingId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editingId])

  const expenseRows = transactions.map((tx) => (
    <tr
      key={tx.id}
      data-expense-row={tx.id}
      style={TRANSACTION_DATA_ROW_STYLE}
      className={`group border-b border-slate-100 transition-colors hover:bg-slate-100/70 ${
        editingId === tx.id ? 'bg-amber-50/60 hover:bg-amber-50/80' : ''
      }`}
    >
      <td className={`w-[4.5rem] whitespace-nowrap ${TRANSACTION_CELL_CLASS} tabular-nums text-[11px] text-slate-600`}>
        {formatTableDateTime(tx.timestamp)}
      </td>
      <td className={`w-14 ${TRANSACTION_CELL_CLASS} text-[11px] font-medium text-orange-700`}>
        {expenseTypeLabel(tx.expenseType)}
      </td>
      <td className={`w-[4.5rem] ${TRANSACTION_CELL_CLASS} text-right tabular-nums text-rose-700`}>
        −{formatTwd(tx.amountTwd)}
      </td>
      <td className={`${TRANSACTION_CELL_CLASS} truncate text-[11px] text-slate-500`}>
        {tx.note.trim() || '—'}
      </td>
      <td className={`w-12 whitespace-nowrap ${TRANSACTION_CELL_CLASS} text-right`}>
        <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <RowActionButtons onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} />
        </div>
      </td>
    </tr>
  ))

  const tableHeader = (
    <thead>
      <tr
        className="border-b border-slate-200 text-[11px] text-slate-500"
        style={{ height: `${TRANSACTION_HEAD_REM}rem` }}
      >
        <th className={`w-[4.5rem] ${TRANSACTION_CELL_CLASS} font-medium`}>時間</th>
        <th className={`w-14 ${TRANSACTION_CELL_CLASS} font-medium`}>類別</th>
        <th className={`w-[4.5rem] ${TRANSACTION_CELL_CLASS} text-right font-medium`}>金額</th>
        <th className={`${TRANSACTION_CELL_CLASS} font-medium`}>備註</th>
        <th className={`w-12 ${TRANSACTION_CELL_CLASS} text-right font-medium`}>操作</th>
      </tr>
    </thead>
  )

  const emptyBody = (
    <tr style={TRANSACTION_DATA_ROW_STYLE}>
      <td
        colSpan={5}
        className={`${TRANSACTION_CELL_CLASS} py-8 text-center`}
      >
        <p className="text-sm text-slate-400">尚無開銷紀錄</p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          在上方輸入金額後按「新增」
        </p>
      </td>
    </tr>
  )

  if (!hasOverflow) {
    return (
      <div className="overflow-x-auto">
        <table className={EXPENSE_TABLE_CLASS}>
          {tableHeader}
          <tbody>
            {transactions.length === 0 ? emptyBody : expenseRows}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 flex-col overflow-x-auto">
      <table className={`${EXPENSE_TABLE_CLASS} shrink-0`}>{tableHeader}</table>
      <div
        className="transaction-table-body-scroll--overflow overflow-x-auto overflow-y-auto"
        style={{ maxHeight: maxBodyHeight }}
      >
        <table className={EXPENSE_TABLE_CLASS}>
          <tbody>{expenseRows}</tbody>
        </table>
      </div>
    </div>
  )
}

interface SettlementsPanelProps {
  settlements: DailySettlement[]
}

interface SettlementRecordBodyProps {
  twdBalance: number
  usdtBalance: number
  vnBalance: number
  twdAvg: number | null
  vnPoolRate: number | null
  vnUsdtPoolRate: number | null
  displayAssets: TotalAssetsTwd
  dayBuyTwd: number | null
  dayBuyVn: number | null
  dayUsdtProfit: number | undefined
  dayVnProfit: number | undefined
  dayTotalProfit: number
}

function SettlementRecordBody({
  twdBalance,
  usdtBalance,
  vnBalance,
  twdAvg,
  vnPoolRate,
  vnUsdtPoolRate,
  displayAssets,
  dayBuyTwd,
  dayBuyVn,
  dayUsdtProfit,
  dayVnProfit,
  dayTotalProfit,
}: SettlementRecordBodyProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        <div>
          <p className="text-[10px] text-slate-500">VN</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-0">
            <p className="text-sm font-bold tabular-nums text-amber-600">
              {formatNumber(vnBalance)}
            </p>
            {vnBalance > 0 && (vnPoolRate !== null || vnUsdtPoolRate !== null) && (
              <div className="w-full">
                <VnPoolCostLines
                  twdRate={vnPoolRate}
                  usdtRate={vnUsdtPoolRate}
                  className="text-[10px] tabular-nums text-slate-400"
                />
              </div>
            )}
            {vnBalance > 0 && displayAssets.vnInTwd !== null && (
              <span className="text-[10px] tabular-nums text-amber-600/80">
                估值 {formatTwd(displayAssets.vnInTwd)}
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
        {dayBuyVn !== null ? (
          <span className="tabular-nums">
            VN <span className="font-semibold">{formatVnNtdCostRate(dayBuyVn)}</span>
          </span>
        ) : null}
      </div>

      {(dayUsdtProfit !== undefined ||
        dayVnProfit !== undefined ||
        dayTotalProfit !== 0) && (
        <div className="mt-2 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
          <p className="mb-1 text-[10px] font-medium text-slate-500">當日利潤</p>
          <SettlementDayProfit
            usdtProfit={dayUsdtProfit}
            vnProfit={dayVnProfit}
            totalProfit={dayTotalProfit}
          />
        </div>
      )}
    </>
  )
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

function SettlementsPanel({ settlements }: SettlementsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cumulativeTotalProfit = settlements.reduce((sum, item) => sum + item.dayTotalProfit, 0)
  const cumulativeUsdtProfit = settlements.reduce(
    (sum, item) => sum + (item.dayUsdtProfit ?? 0),
    0,
  )
  const cumulativeVnProfit = settlements.reduce((sum, item) => sum + (item.dayVnProfit ?? 0), 0)
  const showCumulativeSplit = settlements.some(settlementHasSplitProfit)

  if (settlements.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
        尚無結算紀錄
      </p>
    )
  }

  const renderSettlementCard = ({
    id,
    title,
    transactionCount,
    totalAssets,
    totalProfit,
    body,
  }: {
    id: string
    title: string
    transactionCount: number
    totalAssets: number
    totalProfit: number
    body: SettlementRecordBodyProps
  }) => {
    const isExpanded = expandedIds.has(id)
    return (
      <article key={id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => toggleExpanded(id)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
              <h3 className="text-sm font-semibold tabular-nums text-slate-800">{title}</h3>
              <span className="text-[10px] text-slate-400">{transactionCount} 筆</span>
            </div>
            <p
              className={`overflow-hidden text-[10px] tabular-nums text-slate-500 transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                isExpanded ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
              }`}
            >
              總資產 {formatTwd(totalAssets)} TWD
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className={`text-xs font-bold tabular-nums ${profitColorClass(totalProfit)}`}>
              {formatProfit(totalProfit)}
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
            <SettlementRecordBody {...body} />
          </div>
        </CollapsibleSection>
      </article>
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
        <p className="mt-0.5 text-[10px] text-indigo-700/70">共 {settlements.length} 次結算</p>
        {showCumulativeSplit && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[10px] tabular-nums">
            <span className={profitColorClass(cumulativeUsdtProfit)}>
              U 累計 {formatProfit(cumulativeUsdtProfit)}
            </span>
            <span className={profitColorClass(cumulativeVnProfit)}>
              VN 累計 {formatProfit(cumulativeVnProfit)}
            </span>
          </div>
        )}
      </div>

      {settlements.map((item) =>
        renderSettlementCard({
          id: item.id,
          title: formatSettlementDateTime(item.settledAt),
          transactionCount: item.transactionCount,
          totalAssets: item.totalAssetsTwd,
          totalProfit: item.dayTotalProfit,
          body: {
            twdBalance: item.twdBalance,
            usdtBalance: item.usdtBalance,
            vnBalance: item.vnBalance,
            twdAvg: item.usdtInventoryAvgTwd,
            vnPoolRate: item.dayVnTwdRate,
            vnUsdtPoolRate: item.dayVnUsdtRate ?? null,
            displayAssets: totalAssetsFromSettlement(item),
            dayBuyTwd: item.dayBuyAvgTwd,
            dayBuyVn: item.dayBuyAvgVn,
            dayUsdtProfit: item.dayUsdtProfit,
            dayVnProfit: item.dayVnProfit,
            dayTotalProfit: item.dayTotalProfit,
          },
        }),
      )}
    </div>
  )
}

interface ExpenseSettlementsPanelProps {
  settlements: ExpenseSettlement[]
}

function ExpenseSettlementsPanel({ settlements }: ExpenseSettlementsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const cumulativeExpense = settlements.reduce((sum, item) => sum + item.expenseTotal, 0)

  if (settlements.length === 0) {
    return (
      <p className="rounded-lg border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
        本期無開銷紀錄
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
          <p className="text-xs font-medium text-orange-900">本期開銷合計</p>
          <p className="text-base font-bold tabular-nums text-rose-600">
            −{formatTwd(cumulativeExpense)} TWD
          </p>
        </div>
        <p className="mt-0.5 text-[10px] text-orange-700/70">
          共 {settlements.reduce((sum, item) => sum + item.expenseCount, 0)} 筆
        </p>
      </div>

      {settlements.map((item) => {
        const isExpanded = expandedIds.has(item.id)
        return (
          <article key={item.id} className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => toggleExpanded(item.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
                  <h3 className="text-sm font-semibold tabular-nums text-slate-800">
                    {item.dateLabel}
                  </h3>
                  <span className="text-[10px] text-slate-400">{item.expenseCount} 筆</span>
                </div>
                <p
                  className={`overflow-hidden text-[10px] tabular-nums text-slate-500 transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                    isExpanded ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
                  }`}
                >
                  台幣 {formatTwd(item.twdBalance)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-xs font-bold tabular-nums text-rose-600">
                  −{formatTwd(item.expenseTotal)}
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
                <p className="mb-2 text-[10px] text-slate-500">
                  結算時台幣庫存{' '}
                  <span className="font-semibold tabular-nums text-emerald-600">
                    {formatTwd(item.twdBalance)}
                  </span>
                </p>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500">
                      <th className="py-1 font-medium">時間</th>
                      <th className="py-1 font-medium">類別</th>
                      <th className="py-1 text-right font-medium">金額</th>
                      <th className="py-1 font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.items.map((row, index) => (
                      <tr key={`${item.id}-${index}`} className="border-b border-slate-50">
                        <td className="py-1 tabular-nums text-slate-600">
                          {formatTableDateTime(row.timestamp)}
                        </td>
                        <td className="py-1 text-orange-700">
                          {expenseTypeLabel(row.expenseType)}
                        </td>
                        <td className="py-1 text-right tabular-nums text-rose-700">
                          −{formatTwd(row.amountTwd)}
                        </td>
                        <td className="max-w-[6rem] truncate py-1 text-slate-500">
                          {row.note.trim() || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </article>
        )
      })}
    </div>
  )
}

function MonthCloseButton({
  onClick,
  compact = false,
}: {
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded font-medium text-white transition hover:bg-violet-700 ${
        compact
          ? 'bg-violet-600 px-2 py-0.5 text-[10px]'
          : 'bg-violet-600 px-2.5 py-1 text-xs'
      }`}
    >
      月結
    </button>
  )
}

interface MonthlyCloseModalProps {
  open: boolean
  periodLabel: string
  preview: ReturnType<typeof buildMonthlyClosePreview>
  onPeriodLabelChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

function MonthlyCloseModal({
  open,
  periodLabel,
  preview,
  onPeriodLabelChange,
  onCancel,
  onConfirm,
}: MonthlyCloseModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="monthly-close-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 id="monthly-close-title" className="text-base font-semibold text-slate-900">
          月結封存
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          將「每日結算」列表與進行中的營業開銷一併打包封存，並清空進行中列表。
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          期間名稱
          <input
            type="text"
            value={periodLabel}
            onChange={(event) => onPeriodLabelChange(event.target.value)}
            placeholder="例如：6月份、06/01–06/30"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </label>

        <div className="mt-4 space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <p>
            將封存：交易日結 {preview.tradeCount} 筆
            {preview.expenseItemCount > 0 &&
              `、開銷 ${preview.expenseItemCount} 筆`}
          </p>
          <p className="tabular-nums">
            實際封存區間：{preview.dateRangeLabel}
          </p>
          <p className="tabular-nums">
            毛利 {formatProfit(preview.grossProfit)}
            {preview.expenseTotal > 0 && ` · 開銷 −${formatTwd(preview.expenseTotal)}`}
            {' · '}
            淨利 {formatProfit(preview.netProfit)}
          </p>
          {preview.pendingExpenseCount > 0 && (
            <p className="text-slate-600">
              含進行中開銷 {preview.pendingExpenseCount} 筆（將一併納入封存）
            </p>
          )}
          {preview.pendingTradeCount > 0 && (
            <p className="text-amber-700">
              尚有未日結交易 {preview.pendingTradeCount} 筆（不會納入本次封存）
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!periodLabel.trim()}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            確認月結
          </button>
        </div>
      </div>
    </div>
  )
}

interface OpeningBalanceForm {
  twd: string
  usdt: string
  vn: string
  usdtCostTwd: string
  usdtCostVn: string
  vnTwdRate: string
  vnUsdtRate: string
}

function openingBalanceToForm(
  balances: Balances,
  usdtCost: UsdtInventoryCost,
  vnTwdRate: number | null,
  vnUsdtRate: number | null,
): OpeningBalanceForm {
  return {
    twd: String(balances.twd),
    usdt: String(balances.usdt),
    vn: String(balances.vn),
    usdtCostTwd: usdtCost.twd !== null ? String(usdtCost.twd) : '',
    usdtCostVn: usdtCost.vn !== null ? String(usdtCost.vn) : '',
    vnTwdRate: vnTwdRate !== null ? String(vnTwdRate) : '',
    vnUsdtRate: vnUsdtRate !== null ? String(vnUsdtRate) : '',
  }
}

interface OpeningBalanceModalProps {
  open: boolean
  form: OpeningBalanceForm
  error: string
  onFieldChange: (field: keyof OpeningBalanceForm, value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

function OpeningBalanceModal({
  open,
  form,
  error,
  onFieldChange,
  onCancel,
  onConfirm,
}: OpeningBalanceModalProps) {
  if (!open) return null

  const fieldClass =
    'mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-balance-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 id="opening-balance-title" className="text-base font-semibold text-slate-900">
          期初餘額設定
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          設定本帳期起點的庫存與成本。若有進行中流水或日結紀錄，變更前會再確認。
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <label className="text-xs font-medium text-slate-700">
            TWD
            <input
              type="text"
              inputMode="decimal"
              value={form.twd}
              onChange={(event) => onFieldChange('twd', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            USDT
            <input
              type="text"
              inputMode="decimal"
              value={form.usdt}
              onChange={(event) => onFieldChange('usdt', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            VN
            <input
              type="text"
              inputMode="decimal"
              value={form.vn}
              onChange={(event) => onFieldChange('vn', event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-slate-700">
            USDT 成本 (TWD)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.usdtCostTwd}
              onChange={(event) => onFieldChange('usdtCostTwd', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            USDT 成本 (VN)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.usdtCostVn}
              onChange={(event) => onFieldChange('usdtCostVn', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            VN 池成本 (VN/TWD)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.vnTwdRate}
              onChange={(event) => onFieldChange('vnTwdRate', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            VN 池成本 (VN/U)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.vnUsdtRate}
              onChange={(event) => onFieldChange('vnUsdtRate', event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}

interface MonthlyClosesListProps {
  closes: MonthlyClose[]
  onSelect: (id: string) => void
  onStartClose: () => void
}

function MonthlyClosesList({ closes, onSelect, onStartClose }: MonthlyClosesListProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">已封存 {closes.length} 次月結</p>
        <MonthCloseButton onClick={onStartClose} />
      </div>

      {closes.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
          尚無月結紀錄
        </p>
      ) : (
        closes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{item.periodLabel}</p>
              <p className="mt-0.5 text-[10px] tabular-nums text-slate-500">
                實際封存 {formatArchiveDateRange(item.actualStartDate, item.actualEndDate)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">
                交易 {item.tradeSettlements.length} 筆 · 開銷 {item.expenseSettlements.length} 筆
              </p>
            </div>
            <p
              className={`shrink-0 text-sm font-bold tabular-nums ${profitColorClass(item.netProfit)}`}
            >
              {formatProfit(item.netProfit)}
            </p>
          </button>
        ))
      )}
    </div>
  )
}

interface MonthlyCloseDetailProps {
  monthlyClose: MonthlyClose
  onBack: () => void
}

function MonthlyCloseDetail({ monthlyClose, onBack }: MonthlyCloseDetailProps) {
  const resolved = useMemo(
    () => normalizeMonthlyCloseRecord(monthlyClose),
    [monthlyClose],
  )
  const expenseCategories = EXPENSE_TYPE_OPTIONS.filter(
    (option) => resolved.expenseByCategory[option.value] > 0,
  )

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-medium text-violet-700 hover:text-violet-800"
      >
        ← 返回月結列表
      </button>

      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0">
          <p className="text-sm font-semibold text-violet-900">{resolved.periodLabel}</p>
          <p className={`text-base font-bold tabular-nums ${profitColorClass(resolved.netProfit)}`}>
            {formatProfit(resolved.netProfit)}
          </p>
        </div>
        <p className="mt-0.5 text-[10px] tabular-nums text-violet-800/80">
          實際封存 {formatArchiveDateRange(resolved.actualStartDate, resolved.actualEndDate)}
          {' · '}
          {resolved.closedAt.toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}{' '}
          月結
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0 text-[10px] tabular-nums text-slate-700">
          <span>
            毛利{' '}
            <span className={`font-semibold ${profitColorClass(resolved.grossProfit)}`}>
              {formatProfit(resolved.grossProfit)}
            </span>
          </span>
          {resolved.expenseTotal > 0 && (
            <span>
              開銷{' '}
              <span className="font-semibold text-rose-600">
                −{formatTwd(resolved.expenseTotal)}
              </span>
            </span>
          )}
          <span>
            淨利{' '}
            <span className={`font-semibold ${profitColorClass(resolved.netProfit)}`}>
              {formatProfit(resolved.netProfit)}
            </span>
          </span>
        </div>
        {(resolved.usdtProfit !== 0 || resolved.vnProfit !== 0) && (
          <p className="mt-1 text-[10px] tabular-nums text-slate-600">
            U {formatProfit(resolved.usdtProfit)} · VN {formatProfit(resolved.vnProfit)}
          </p>
        )}
        {expenseCategories.length > 0 && (
          <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
            {expenseCategories
              .map(
                (option) =>
                  `${option.label} −${formatTwd(resolved.expenseByCategory[option.value])}`,
              )
              .join(' · ')}
          </p>
        )}
        <p className="mt-2 text-[10px] tabular-nums text-slate-600">
          期初帳面資產 {formatTwd(resolved.openingTotalAssets)} TWD
        </p>
        <p className="mt-1 text-[10px] tabular-nums text-slate-600">
          月底資產 {formatTwd(resolved.closingTotalAssets)} TWD
          <span className="text-slate-400">（期初＋淨利）</span>
        </p>
        {resolved.closingBookTotalAssets !== undefined &&
          resolved.closingBookTotalAssets !== resolved.closingTotalAssets && (
            <p className="mt-0.5 text-[9px] tabular-nums text-slate-400">
              庫存成本計價帳面 {formatTwd(resolved.closingBookTotalAssets)} TWD
            </p>
          )}
      </div>

      <div>
        <h2 className="mb-1 text-xs font-semibold text-slate-700">交易日結明細</h2>
        <SettlementsPanel settlements={resolved.tradeSettlements} />
      </div>

      <div>
        <h2 className="mb-1 text-xs font-semibold text-slate-700">本期開銷明細</h2>
        <ExpenseSettlementsPanel settlements={resolved.expenseSettlements} />
      </div>
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

function AppNav({
  activeTab,
  settlementsCount,
  onSelect,
  layout,
  onNavigate,
}: AppNavProps) {
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
      <button type="button" onClick={() => selectTab('expenses')} className={buttonClass('expenses')}>
        營業開銷
      </button>
      <button type="button" onClick={() => selectTab('monthly')} className={buttonClass('monthly')}>
        月結
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

function normalizeLoadedTransactions(transactions: Transaction[]): Transaction[] {
  return transactions
    .filter(
      (tx) =>
        isUsdtTransaction(tx) || isVnTradeTransaction(tx) || isExpenseTransaction(tx),
    )
    .map((tx) => (isVnTradeTransaction(tx) ? normalizeVnTradeTransaction(tx) : tx))
}

function normalizeMonthlyClose(item: MonthlyClose): MonthlyClose {
  return normalizeMonthlyCloseRecord({
    ...item,
    closedAt: new Date(item.closedAt),
    actualStartDate: item.actualStartDate ? new Date(item.actualStartDate) : null,
    actualEndDate: item.actualEndDate ? new Date(item.actualEndDate) : null,
    tradeSettlements: item.tradeSettlements.map(cloneDailySettlement),
    expenseSettlements: item.expenseSettlements.map(cloneExpenseSettlement),
    expenseByCategory: { ...EMPTY_EXPENSE_BY_CATEGORY, ...item.expenseByCategory },
  })
}

function App() {
  const tableVisibleRows = useTransactionVisibleRows()
  const persistedRef = useRef(loadPersistedAppState())
  const persisted = persistedRef.current

  const [activeTab, setActiveTab] = useState<PageTab>(persisted?.activeTab ?? 'daily')
  const [dailyWorkTab, setDailyWorkTab] = useState<DailyWorkTab>(
    persisted?.dailyWorkTab ?? 'usdt',
  )
  const [openingBalances, setOpeningBalances] = useState<Balances>(
    persisted?.openingBalances ?? { ...INITIAL_BALANCES },
  )
  const [openingUsdtCost, setOpeningUsdtCost] = useState<UsdtInventoryCost>(
    persisted?.openingUsdtCost ?? { ...EMPTY_USDT_COST },
  )
  const [openingVnTwdRate, setOpeningVnTwdRate] = useState<number | null>(
    persisted?.openingVnTwdRate ?? null,
  )
  const [openingVnUsdtRate, setOpeningVnUsdtRate] = useState<number | null>(
    persisted?.openingVnUsdtRate ?? null,
  )
  const [settlements, setSettlements] = useState<DailySettlement[]>(
    (persisted?.settlements ?? []).map(normalizeLoadedSettlement),
  )
  const [expenseSettlements, setExpenseSettlements] = useState<ExpenseSettlement[]>(
    persisted?.expenseSettlements ?? [],
  )
  const [monthlyCloses, setMonthlyCloses] = useState<MonthlyClose[]>(
    (persisted?.monthlyCloses ?? []).map((item) => normalizeMonthlyClose(item)),
  )
  const [selectedMonthlyCloseId, setSelectedMonthlyCloseId] = useState<string | null>(null)
  const [monthlyCloseModalOpen, setMonthlyCloseModalOpen] = useState(false)
  const [monthlyPeriodLabel, setMonthlyPeriodLabel] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>(
    normalizeLoadedTransactions(persisted?.transactions ?? []),
  )

  const [buyUsdtAmount, setBuyUsdtAmount] = useState('')
  const [buyFiatAmount, setBuyFiatAmount] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [buyError, setBuyError] = useState('')

  const [sellUsdtAmount, setSellUsdtAmount] = useState('')
  const [sellFiatAmount, setSellFiatAmount] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [sellError, setSellError] = useState('')

  const [vnBuyVnAmount, setVnBuyVnAmount] = useState('')
  const [vnBuyPayAmount, setVnBuyPayAmount] = useState('')
  const [vnBuyPayCurrency, setVnBuyPayCurrency] = useState<VnPayCurrency>('twd')
  const [vnBuyRate, setVnBuyRate] = useState('')
  const [vnBuyError, setVnBuyError] = useState('')

  const [vnSellVnAmount, setVnSellVnAmount] = useState('')
  const [vnSellPayAmount, setVnSellPayAmount] = useState('')
  const [vnSellPayCurrency, setVnSellPayCurrency] = useState<VnPayCurrency>('twd')
  const [vnSellRate, setVnSellRate] = useState('')
  const [vnSellError, setVnSellError] = useState('')

  const [expenseType, setExpenseType] = useState<ExpenseType>('fuel')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseNote, setExpenseNote] = useState('')
  const [expenseError, setExpenseError] = useState('')
  const [expenseFormFocusKey, setExpenseFormFocusKey] = useState(0)
  const [buyFormFocusKey, setBuyFormFocusKey] = useState(0)
  const [sellFormFocusKey, setSellFormFocusKey] = useState(0)
  const [vnBuyFormFocusKey, setVnBuyFormFocusKey] = useState(0)
  const [vnSellFormFocusKey, setVnSellFormFocusKey] = useState(0)

  const [openingBalanceModalOpen, setOpeningBalanceModalOpen] = useState(false)
  const [openingBalanceForm, setOpeningBalanceForm] = useState<OpeningBalanceForm>(() =>
    openingBalanceToForm(
      persisted?.openingBalances ?? { ...INITIAL_BALANCES },
      persisted?.openingUsdtCost ?? { ...EMPTY_USDT_COST },
      persisted?.openingVnTwdRate ?? null,
      persisted?.openingVnUsdtRate ?? null,
    ),
  )
  const [openingBalanceError, setOpeningBalanceError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<AppSnapshot | null>(null)
  const [undoMessage, setUndoMessage] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const buyBodyScrollRef = useRef<HTMLDivElement>(null)
  const sellBodyScrollRef = useRef<HTMLDivElement>(null)
  const vnBuyBodyScrollRef = useRef<HTMLDivElement>(null)
  const vnSellBodyScrollRef = useRef<HTMLDivElement>(null)
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

  const syncVnBodyScroll = (source: 'buy' | 'sell', scrollTop: number) => {
    if (syncBodyScrollLock.current) return
    syncBodyScrollLock.current = true
    const target = source === 'buy' ? vnSellBodyScrollRef.current : vnBuyBodyScrollRef.current
    if (target && target.scrollTop !== scrollTop) {
      target.scrollTop = scrollTop
    }
    syncBodyScrollLock.current = false
  }

  useEffect(() => {
    savePersistedAppState({
      activeTab,
      dailyWorkTab,
      openingBalances,
      openingUsdtCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      transactions,
      settlements,
      expenseSettlements,
      monthlyCloses,
    })
  }, [activeTab, dailyWorkTab, openingBalances, openingUsdtCost, openingVnTwdRate, openingVnUsdtRate, transactions, settlements, expenseSettlements, monthlyCloses])

  const balances = useMemo(
    () => recalculateBalances(transactions, openingBalances),
    [transactions, openingBalances],
  )

  const usdtTransactions = useMemo(
    () => filterUsdtTransactions(transactions),
    [transactions],
  )

  const inventoryCost = useMemo(
    () => computeInventoryCost(openingBalances, openingUsdtCost, transactions),
    [openingBalances, openingUsdtCost, transactions],
  )

  const vnTradeTransactions = useMemo(
    () => filterVnTradeTransactions(transactions),
    [transactions],
  )

  const expenseTransactions = useMemo(
    () => filterExpenseTransactions(transactions),
    [transactions],
  )

  const tradeTransactions = useMemo(
    () => filterTradeTransactions(transactions),
    [transactions],
  )

  const businessDayLabel = useMemo(
    () => getBusinessDayLabel(tradeTransactions),
    [tradeTransactions],
  )

  const expenseBusinessDayLabel = useMemo(
    () => getBusinessDayLabel(expenseTransactions),
    [expenseTransactions],
  )

  const createSnapshot = (): AppSnapshot => ({
    transactions,
    openingBalances,
    openingUsdtCost,
    openingVnTwdRate,
    openingVnUsdtRate,
    settlements,
    expenseSettlements,
    monthlyCloses,
    selectedMonthlyCloseId,
    activeTab,
    dailyWorkTab,
  })

  const restoreSnapshot = (snapshot: AppSnapshot) => {
    setTransactions(snapshot.transactions)
    setOpeningBalances(snapshot.openingBalances)
    setOpeningUsdtCost(snapshot.openingUsdtCost)
    setOpeningVnTwdRate(snapshot.openingVnTwdRate ?? null)
    setOpeningVnUsdtRate(snapshot.openingVnUsdtRate ?? null)
    setSettlements(snapshot.settlements.map(normalizeLoadedSettlement))
    setExpenseSettlements(snapshot.expenseSettlements ?? [])
    setMonthlyCloses((snapshot.monthlyCloses ?? []).map((item) => normalizeMonthlyClose(item)))
    setSelectedMonthlyCloseId(snapshot.selectedMonthlyCloseId ?? null)
    setActiveTab(snapshot.activeTab)
    setDailyWorkTab(snapshot.dailyWorkTab ?? 'usdt')
    setMonthlyCloseModalOpen(false)
    setMonthlyPeriodLabel('')
  }

  const handleSelectTab = (tab: PageTab) => {
    if (tab === 'monthly') {
      setSelectedMonthlyCloseId(null)
    }
    setActiveTab(tab)
  }

  const buyTransactions = useMemo(
    () => usdtTransactions.filter((tx) => tx.type === 'buy'),
    [usdtTransactions],
  )
  const sellTransactions = useMemo(
    () => usdtTransactions.filter((tx) => tx.type === 'sell'),
    [usdtTransactions],
  )
  const vnBuyTransactions = useMemo(
    () => vnTradeTransactions.filter((tx) => tx.type === 'buy'),
    [vnTradeTransactions],
  )
  const vnSellTransactions = useMemo(
    () => vnTradeTransactions.filter((tx) => tx.type === 'sell'),
    [vnTradeTransactions],
  )
  const sellProfitById = useMemo(
    () => computeSellProfitById(openingBalances, openingUsdtCost, usdtTransactions),
    [openingBalances, openingUsdtCost, usdtTransactions],
  )

  const vnTradeAnalytics = useMemo(
    () =>
      computeVnTradeAnalytics(
        openingBalances,
        openingVnTwdRate,
        openingVnUsdtRate,
        openingUsdtCost,
        transactions,
      ),
    [openingBalances, openingVnTwdRate, openingVnUsdtRate, openingUsdtCost, transactions],
  )

  const totalAssets = useMemo(
    () =>
      computeTotalAssetsTwd(
        balances,
        inventoryCost,
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
        transactions,
      ),
    [balances, inventoryCost, openingBalances, openingUsdtCost, openingVnTwdRate, openingVnUsdtRate, transactions],
  )

  const monthlyClosePreview = useMemo(
    () =>
      buildMonthlyClosePreview(
        settlements,
        expenseSettlements,
        expenseTransactions,
        tradeTransactions.length,
        balances,
      ),
    [settlements, expenseSettlements, expenseTransactions, tradeTransactions.length, balances],
  )

  const selectedMonthlyClose = useMemo(
    () => monthlyCloses.find((item) => item.id === selectedMonthlyCloseId) ?? null,
    [monthlyCloses, selectedMonthlyCloseId],
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

  const resetVnBuyForm = () => {
    setVnBuyVnAmount('')
    setVnBuyPayAmount('')
    setVnBuyPayCurrency('twd')
    setVnBuyRate('')
    setVnBuyError('')
    if (editingCategory === 'vn_buy') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetVnSellForm = () => {
    setVnSellVnAmount('')
    setVnSellPayAmount('')
    setVnSellPayCurrency('twd')
    setVnSellRate('')
    setVnSellError('')
    if (editingCategory === 'vn_sell') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetExpenseForm = () => {
    setExpenseType('fuel')
    setExpenseAmount('')
    setExpenseNote('')
    setExpenseError('')
    if (editingCategory === 'expense') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const updateVnBuyForm = (field: 'vn' | 'pay' | 'rate', value: string) => {
    const next = syncVnTradeFormFields(field, value, {
      vn: vnBuyVnAmount,
      pay: vnBuyPayAmount,
      rate: vnBuyRate,
    })
    setVnBuyVnAmount(next.vn)
    setVnBuyPayAmount(next.pay)
    setVnBuyRate(next.rate)
  }

  const updateVnSellForm = (field: 'vn' | 'pay' | 'rate', value: string) => {
    const next = syncVnTradeFormFields(field, value, {
      vn: vnSellVnAmount,
      pay: vnSellPayAmount,
      rate: vnSellRate,
    })
    setVnSellVnAmount(next.vn)
    setVnSellPayAmount(next.pay)
    setVnSellRate(next.rate)
  }

  const handleWorkTabChange = (tab: DailyWorkTab) => {
    if (tab === dailyWorkTab) return
    if (editingCategory === 'buy') resetBuyForm()
    else if (editingCategory === 'sell') resetSellForm()
    else if (editingCategory === 'vn_buy') resetVnBuyForm()
    else if (editingCategory === 'vn_sell') resetVnSellForm()
    else if (editingCategory === 'expense') resetExpenseForm()
    setDailyWorkTab(tab)
  }

  const handleExpenseSubmit = (e: FormEvent) => {
    e.preventDefault()

    setExpenseError('')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    const amount = parseFloat(expenseAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setExpenseError('請輸入有效的正數金額')
      return
    }

    const isEditing = editingId !== null && editingCategory === 'expense'

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isExpenseTransaction(tx)
            ? {
                ...tx,
                expenseType,
                amountTwd: amount,
                note: expenseNote.trim(),
              }
            : tx,
        )
      }
      const newTransaction: ExpenseTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'expense',
        expenseType,
        amountTwd: amount,
        note: expenseNote.trim(),
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(updatedTransactions, openingBalances)
    if (validationError) {
      setExpenseError(validationError)
      return
    }

    setTransactions(updatedTransactions)
    resetExpenseForm()
    if (!isEditing) {
      setExpenseFormFocusKey((key) => key + 1)
    }
  }

  const handleSubmit = (type: TransactionType, e: FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const usdtStr = isBuy ? buyUsdtAmount : sellUsdtAmount
    const fiatStr = isBuy ? buyFiatAmount : sellFiatAmount
    const setError = isBuy ? setBuyError : setSellError
    const otherSetError = isBuy ? setSellError : setBuyError

    setError('')
    otherSetError('')
    setVnBuyError('')
    setVnSellError('')
    setExpenseError('')

    const usdt = parseFloat(usdtStr)
    const fiat = parseFloat(fiatStr)

    if (Number.isNaN(usdt) || Number.isNaN(fiat) || usdt <= 0 || fiat <= 0) {
      setError('請輸入有效的正數金額')
      return
    }

    const rate = calculateRate(fiat, usdt)
    const isEditing = editingId !== null && editingCategory === type

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isUsdtTransaction(tx)
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
    if (isBuy) {
      resetBuyForm()
      if (!isEditing) setBuyFormFocusKey((key) => key + 1)
    } else {
      resetSellForm()
      if (!isEditing) setSellFormFocusKey((key) => key + 1)
    }
  }

  const handleVnSubmit = (type: TransactionType, e: FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const vnStr = isBuy ? vnBuyVnAmount : vnSellVnAmount
    const payStr = isBuy ? vnBuyPayAmount : vnSellPayAmount
    const payCurrency = isBuy ? vnBuyPayCurrency : vnSellPayCurrency
    const setError = isBuy ? setVnBuyError : setVnSellError
    const otherSetError = isBuy ? setVnSellError : setVnBuyError

    setError('')
    otherSetError('')
    setBuyError('')
    setSellError('')
    setExpenseError('')

    const vn = parseFloat(vnStr)
    const pay = parseFloat(payStr)

    if (Number.isNaN(vn) || Number.isNaN(pay) || vn <= 0 || pay <= 0) {
      setError('請輸入有效的正數金額')
      return
    }

    const rate = calculateVnTwdRate(vn, pay)
    const editCategory = isBuy ? 'vn_buy' : 'vn_sell'
    const isEditing = editingId !== null && editingCategory === editCategory

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isVnTradeTransaction(tx)
            ? {
                ...tx,
                type,
                payCurrency,
                vnAmount: vn,
                twdAmount: payCurrency === 'twd' ? pay : 0,
                usdtAmount: payCurrency === 'usdt' ? pay : 0,
                rate,
              }
            : tx,
        )
      }
      const newTransaction: VnTradeTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'vn_trade',
        type,
        payCurrency,
        vnAmount: vn,
        twdAmount: payCurrency === 'twd' ? pay : 0,
        usdtAmount: payCurrency === 'usdt' ? pay : 0,
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
    if (isBuy) {
      resetVnBuyForm()
      if (!isEditing) setVnBuyFormFocusKey((key) => key + 1)
    } else {
      resetVnSellForm()
      if (!isEditing) setVnSellFormFocusKey((key) => key + 1)
    }
  }

  const handleEdit = (tx: UsdtTransaction) => {
    setActiveTab('daily')
    setDailyWorkTab('usdt')
    setEditingId(tx.id)
    setEditingCategory(tx.type)
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

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

  const handleEditVn = (tx: VnTradeTransaction) => {
    const normalized = normalizeVnTradeTransaction(tx)
    setActiveTab('daily')
    setDailyWorkTab('vn')
    setEditingId(normalized.id)
    setEditingCategory(normalized.type === 'buy' ? 'vn_buy' : 'vn_sell')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    if (normalized.type === 'buy') {
      setVnBuyPayCurrency(normalized.payCurrency)
      setVnBuyVnAmount(String(normalized.vnAmount))
      setVnBuyPayAmount(String(vnTradePayAmount(normalized)))
      setVnBuyRate(formatRateCalc(normalized.rate))
    } else {
      setVnSellPayCurrency(normalized.payCurrency)
      setVnSellVnAmount(String(normalized.vnAmount))
      setVnSellPayAmount(String(vnTradePayAmount(normalized)))
      setVnSellRate(formatRateCalc(normalized.rate))
    }
  }

  const handleEditExpense = (tx: ExpenseTransaction) => {
    setActiveTab('expenses')
    setEditingId(tx.id)
    setEditingCategory('expense')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')
    setExpenseError('')
    setExpenseType(tx.expenseType)
    setExpenseAmount(String(tx.amountTwd))
    setExpenseNote(tx.note)
  }

  const executeDelete = (id: string) => {
    const snapshot = createSnapshot()
    setTransactions((prev) => prev.filter((item) => item.id !== id))

    if (editingId === id) {
      resetBuyForm()
      resetSellForm()
      resetVnBuyForm()
      resetVnSellForm()
      resetExpenseForm()
      setEditingId(null)
      setEditingCategory(null)
    }

    setUndoSnapshot(snapshot)
    setUndoMessage('已刪除一筆紀錄')
  }

  const handleDelete = (id: string) => {
    const tx = transactions.find((item) => item.id === id)
    if (!tx) return

    setConfirmDialog({
      title: isExpenseTransaction(tx) ? '確定刪除以下開銷？' : '確定刪除以下交易？',
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
    else if (editingCategory === 'vn_buy') resetVnBuyForm()
    else if (editingCategory === 'vn_sell') resetVnSellForm()
    else if (editingCategory === 'expense') resetExpenseForm()
  }

  const editingBannerLabel =
    editingCategory === 'buy'
      ? '正在編輯買入 USDT'
      : editingCategory === 'sell'
        ? '正在編輯賣出 USDT'
        : editingCategory === 'vn_buy'
          ? '正在編輯買入 VN'
          : editingCategory === 'vn_sell'
            ? '正在編輯賣出 VN'
            : editingCategory === 'expense'
              ? '正在編輯開銷'
              : null

  const isEditingBuy = editingCategory === 'buy'
  const isEditingSell = editingCategory === 'sell'
  const isEditingVnBuy = editingCategory === 'vn_buy'
  const isEditingVnSell = editingCategory === 'vn_sell'
  const isEditingExpense = editingCategory === 'expense'
  const isEditingAny = editingCategory !== null

  const executeTradeSettle = () => {
    const snapshot = createSnapshot()
    const tradeTxs = filterTradeTransactions(transactions)

    const inventoryAtSettle = computeInventoryCost(
      openingBalances,
      openingUsdtCost,
      transactions,
    )

    const assetsAtSettle = computeTotalAssetsTwd(
      balances,
      inventoryAtSettle,
      openingBalances,
      openingUsdtCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      transactions,
    )
    const settledDayUsdtProfit = computeUsdtDayTotalProfit(
      openingBalances,
      openingUsdtCost,
      usdtTransactions,
    )
    const settledDayVnProfit = computeVnDayTotalProfit(
      openingBalances,
      openingVnTwdRate,
      openingVnUsdtRate,
      openingUsdtCost,
      transactions,
    )
    const settledDayProfit = settledDayUsdtProfit + settledDayVnProfit

    const settlement: DailySettlement = {
      id: crypto.randomUUID(),
      settledAt: new Date(),
      dateLabel: formatSettlementDateTime(new Date()),
      twdBalance: balances.twd,
      usdtBalance: balances.usdt,
      vnBalance: balances.vn,
      usdtInventoryAvgTwd: inventoryAtSettle.twd,
      usdtInventoryAvgVn: inventoryAtSettle.vn,
      dayBuyAvgTwd: calculateBuyDayAverageRate(usdtTransactions, 'twd'),
      dayBuyAvgVn: calculateVnBuyDayAverageRate(
        openingBalances,
        openingUsdtCost,
        transactions,
      ),
      ...settlementFromTotalAssets(assetsAtSettle),
      transactionCount: tradeTxs.length,
      dayUsdtProfit: settledDayUsdtProfit,
      dayVnProfit: settledDayVnProfit,
      dayTotalProfit: settledDayProfit,
    }

    setSettlements((prev) => [settlement, ...prev])
    setOpeningBalances(balances)
    setOpeningUsdtCost(inventoryAtSettle)
    setOpeningVnTwdRate(assetsAtSettle.dayVnTwdRate)
    setOpeningVnUsdtRate(assetsAtSettle.dayVnUsdtRate)
    setTransactions((prev) => prev.filter(isExpenseTransaction))
    resetBuyForm()
    resetSellForm()
    resetVnBuyForm()
    resetVnSellForm()
    setEditingId(null)
    setEditingCategory(null)
    setActiveTab('settlements')

    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成 ${businessDayLabel} 交易結算`)
  }

  const handleTradeSettle = () => {
    if (tradeTransactions.length === 0) {
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
      title: '確定結算今日交易？',
      lines: buildTradeSettleConfirmLines(
        transactions,
        balances,
        inventoryCost,
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
      confirmLabel: '確認結算',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeTradeSettle()
      },
    })
  }

  const executeResetAll = () => {
    setTransactions([])
    setSettlements([])
    setExpenseSettlements([])
    setMonthlyCloses([])
    setSelectedMonthlyCloseId(null)
    setMonthlyCloseModalOpen(false)
    setMonthlyPeriodLabel('')
    setOpeningBalances({ ...INITIAL_BALANCES })
    setOpeningUsdtCost({ ...EMPTY_USDT_COST })
    setOpeningVnTwdRate(null)
    setOpeningVnUsdtRate(null)
    resetBuyForm()
    resetSellForm()
    resetVnBuyForm()
    resetVnSellForm()
    resetExpenseForm()
    setEditingId(null)
    setEditingCategory(null)
    setUndoSnapshot(null)
    setUndoMessage('')
    setActiveTab('daily')
    setDailyWorkTab('usdt')
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

  const handleOpenOpeningBalance = () => {
    setOpeningBalanceForm(
      openingBalanceToForm(
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
    )
    setOpeningBalanceError('')
    setOpeningBalanceModalOpen(true)
  }

  const parseOpeningBalanceForm = (): {
    balances: Balances
    usdtCost: UsdtInventoryCost
    vnTwdRate: number | null
    vnUsdtRate: number | null
  } | null => {
    const twd = Number(openingBalanceForm.twd.trim())
    const usdt = Number(openingBalanceForm.usdt.trim())
    const vn = Number(openingBalanceForm.vn.trim())

    if (![twd, usdt, vn].every((value) => Number.isFinite(value) && value >= 0)) {
      setOpeningBalanceError('TWD / USDT / VN 請輸入有效的非負數')
      return null
    }

    const parseOptionalRate = (value: string): number | null | 'invalid' => {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed) || parsed <= 0) return 'invalid'
      return parsed
    }

    const usdtCostTwd = parseOptionalRate(openingBalanceForm.usdtCostTwd)
    if (usdtCostTwd === 'invalid') {
      setOpeningBalanceError('USDT 成本 (TWD) 請輸入有效正數或留空')
      return null
    }
    const usdtCostVn = parseOptionalRate(openingBalanceForm.usdtCostVn)
    if (usdtCostVn === 'invalid') {
      setOpeningBalanceError('USDT 成本 (VN) 請輸入有效正數或留空')
      return null
    }
    const vnTwdRate = parseOptionalRate(openingBalanceForm.vnTwdRate)
    if (vnTwdRate === 'invalid') {
      setOpeningBalanceError('VN 池成本 (VN/TWD) 請輸入有效正數或留空')
      return null
    }
    const vnUsdtRate = parseOptionalRate(openingBalanceForm.vnUsdtRate)
    if (vnUsdtRate === 'invalid') {
      setOpeningBalanceError('VN 池成本 (VN/U) 請輸入有效正數或留空')
      return null
    }

    if (usdt > 0 && usdtCostTwd === null) {
      setOpeningBalanceError('有 USDT 庫存時請填寫 USDT 成本 (TWD)')
      return null
    }

    setOpeningBalanceError('')
    return {
      balances: { twd, usdt, vn },
      usdtCost: { twd: usdtCostTwd, vn: usdtCostVn },
      vnTwdRate,
      vnUsdtRate,
    }
  }

  const executeApplyOpeningBalance = () => {
    const parsed = parseOpeningBalanceForm()
    if (!parsed) return

    setOpeningBalances(parsed.balances)
    setOpeningUsdtCost(parsed.usdtCost)
    setOpeningVnTwdRate(parsed.vnTwdRate)
    setOpeningVnUsdtRate(parsed.vnUsdtRate)
    setOpeningBalanceModalOpen(false)
    setOpeningBalanceError('')
  }

  const handleSaveOpeningBalance = () => {
    if (!parseOpeningBalanceForm()) return

    const hasActivity =
      transactions.length > 0 ||
      settlements.length > 0 ||
      expenseSettlements.length > 0 ||
      monthlyCloses.length > 0

    if (!hasActivity) {
      executeApplyOpeningBalance()
      return
    }

    setConfirmDialog({
      title: '確定更新期初餘額？',
      lines: [
        '將更新期初庫存與成本設定。',
        '既有流水與日結紀錄不會刪除，但顯示餘額會依新期初重算。',
        '建議在無進行中資料時調整，或調整後自行核對。',
      ],
      confirmLabel: '確認儲存',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeApplyOpeningBalance()
      },
    })
  }

  const handleOpenMonthlyClose = () => {
    if (
      settlements.length === 0 &&
      expenseSettlements.length === 0 &&
      expenseTransactions.length === 0
    ) {
      setConfirmDialog({
        title: '無法月結',
        lines: ['「每日結算」與「營業開銷」目前皆無紀錄，無法月結。'],
        confirmLabel: '知道了',
        variant: 'primary',
        alertOnly: true,
        onConfirm: () => setConfirmDialog(null),
      })
      return
    }

    setMonthlyPeriodLabel(suggestMonthlyPeriodLabel())
    setMonthlyCloseModalOpen(true)
  }

  const executeMonthlyClose = () => {
    const label = monthlyPeriodLabel.trim()
    if (!label) return

    const snapshot = createSnapshot()
    const hadPendingExpenses = expenseTransactions.length > 0
    const assembledExpenses = assembleExpenseSettlementsForMonthlyClose(
      expenseSettlements,
      expenseTransactions,
      balances,
    )
    const monthlyClose = buildMonthlyClose(
      label,
      settlements,
      assembledExpenses,
      balances,
      inventoryCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      totalAssets.total,
    )

    setMonthlyCloses((prev) => [monthlyClose, ...prev])
    setSettlements([])
    setExpenseSettlements([])
    if (hadPendingExpenses) {
      setTransactions((prev) => prev.filter((tx) => !isExpenseTransaction(tx)))
      setOpeningBalances(balances)
    }
    setSelectedMonthlyCloseId(monthlyClose.id)
    setMonthlyCloseModalOpen(false)
    setMonthlyPeriodLabel('')
    setActiveTab('monthly')

    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成「${monthlyClose.periodLabel}」月結封存`)
  }

  return (
    <div className="h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <ConfirmModal dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} />
      <MonthlyCloseModal
        open={monthlyCloseModalOpen}
        periodLabel={monthlyPeriodLabel}
        preview={monthlyClosePreview}
        onPeriodLabelChange={setMonthlyPeriodLabel}
        onCancel={() => {
          setMonthlyCloseModalOpen(false)
          setMonthlyPeriodLabel('')
        }}
        onConfirm={executeMonthlyClose}
      />
      <OpeningBalanceModal
        open={openingBalanceModalOpen}
        form={openingBalanceForm}
        error={openingBalanceError}
        onFieldChange={(field, value) =>
          setOpeningBalanceForm((prev) => ({ ...prev, [field]: value }))
        }
        onCancel={() => {
          setOpeningBalanceModalOpen(false)
          setOpeningBalanceError('')
        }}
        onConfirm={handleSaveOpeningBalance}
      />
      <div className="flex h-full w-full">
        <aside className="hidden w-[6rem] shrink-0 border-r border-slate-200 bg-white px-1 py-3 lg:block">
          <AppNav
            activeTab={activeTab}
            settlementsCount={settlements.length}
            onSelect={handleSelectTab}
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
              onSelect={handleSelectTab}
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
              {activeTab === 'daily'
                ? dailyWorkTab === 'usdt'
                  ? 'USDT 買賣'
                  : 'VN 買賣'
                : activeTab === 'expenses'
                  ? '營業開銷'
                  : activeTab === 'monthly'
                      ? selectedMonthlyClose
                        ? selectedMonthlyClose.periodLabel
                        : '月結'
                      : '每日結算'}
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
            <div className="mx-auto flex w-full max-w-6xl flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={cancelEditing} />
              )}
              <h1 className="mb-1 shrink-0 text-sm font-semibold text-slate-800">每日明細</h1>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500">
                  <span className="font-medium text-slate-700">{businessDayLabel}</span>
                  {' 營業日 · '}
                  待結{' '}
                  <span className="tabular-nums font-medium text-slate-700">
                    {tradeTransactions.length}
                  </span>{' '}
                  筆
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenOpeningBalance}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    期初
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-[10px] font-medium text-red-500 transition hover:text-red-700 hover:underline"
                  >
                    清空資料
                  </button>
                </div>
              </div>
              <DailyBalanceStrip
                balances={balances}
                inventoryCost={inventoryCost}
                totalAssets={totalAssets}
                vnTwdRate={vnTradeAnalytics.currentVnTwdRate}
                vnUsdtRate={vnTradeAnalytics.currentVnUsdtRate}
              />
              <DailyWorkTabBar value={dailyWorkTab} onChange={handleWorkTabChange} />

              {dailyWorkTab === 'usdt' ? (
                <section className="grid shrink-0 gap-2 lg:grid-cols-2 lg:items-start">
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
                        disabled={isEditingAny && !isEditingBuy}
                        focusKey={buyFormFocusKey}
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
                      <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-emerald-700">
                        買入紀錄
                      </h2>
                      <TransactionTable
                        transactions={buyTransactions}
                        editingId={editingId}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        accent="buy"
                        sideLabel="買入"
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
                        disabled={isEditingAny && !isEditingSell}
                        focusKey={sellFormFocusKey}
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
                      <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-rose-700">
                        賣出紀錄
                      </h2>
                      <TransactionTable
                        transactions={sellTransactions}
                        editingId={editingId}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        accent="sell"
                        sideLabel="賣出"
                        sellProfitById={sellProfitById}
                        visibleRows={tableVisibleRows}
                        bodyScrollRef={sellBodyScrollRef}
                        onBodyScroll={(scrollTop) => syncTransactionBodyScroll('sell', scrollTop)}
                      />
                    </div>
                  </div>
                </section>
              ) : (
                <section className="grid shrink-0 gap-2 lg:grid-cols-2 lg:items-start">
                  <div className="flex flex-col gap-1.5">
                    <div className={formCardClass('violet', isEditingVnBuy)}>
                      <VnTradeForm
                        type="buy"
                        title="買入 VN"
                        editTitle="編輯買入 VN"
                        payCurrency={vnBuyPayCurrency}
                        onPayCurrencyChange={setVnBuyPayCurrency}
                        vn={vnBuyVnAmount}
                        pay={vnBuyPayAmount}
                        rate={vnBuyRate}
                        error={vnBuyError}
                        isEditing={isEditingVnBuy}
                        disabled={isEditingAny && !isEditingVnBuy}
                        focusKey={vnBuyFormFocusKey}
                        onFieldChange={updateVnBuyForm}
                        onSubmit={(e) => handleVnSubmit('buy', e)}
                        onCancel={resetVnBuyForm}
                        accentClass="text-violet-700"
                        buttonClass="bg-violet-600 hover:bg-violet-700 focus:ring-violet-600/30"
                        focusClass="focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                        balances={balances}
                        usdtInventoryCostTwd={inventoryCost.twd}
                        vnInventoryTwdRate={null}
                      />
                    </div>
                    <div className={recordCardClass('violet')}>
                      <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-violet-700">
                        買入紀錄
                      </h2>
                      <VnTradeTable
                        transactions={vnBuyTransactions}
                        editingId={editingId}
                        onEdit={handleEditVn}
                        onDelete={handleDelete}
                        accent="buy"
                        sideLabel="買入"
                        showCostAverage
                        openingBalances={openingBalances}
                        openingUsdtCost={openingUsdtCost}
                        allTransactions={transactions}
                        buyImpliedTwdRateById={vnTradeAnalytics.buyImpliedTwdRateById}
                        buyImpliedUsdtRateById={vnTradeAnalytics.buyImpliedUsdtRateById}
                        visibleRows={tableVisibleRows}
                        bodyScrollRef={vnBuyBodyScrollRef}
                        onBodyScroll={(scrollTop) => syncVnBodyScroll('buy', scrollTop)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className={formCardClass('rose', isEditingVnSell)}>
                      <VnTradeForm
                        type="sell"
                        title="賣出 VN"
                        editTitle="編輯賣出 VN"
                        payCurrency={vnSellPayCurrency}
                        onPayCurrencyChange={setVnSellPayCurrency}
                        vn={vnSellVnAmount}
                        pay={vnSellPayAmount}
                        rate={vnSellRate}
                        error={vnSellError}
                        isEditing={isEditingVnSell}
                        disabled={isEditingAny && !isEditingVnSell}
                        focusKey={vnSellFormFocusKey}
                        onFieldChange={updateVnSellForm}
                        onSubmit={(e) => handleVnSubmit('sell', e)}
                        onCancel={resetVnSellForm}
                        accentClass="text-amber-700"
                        buttonClass="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30"
                        focusClass="focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        balances={balances}
                        usdtInventoryCostTwd={inventoryCost.twd}
                        vnInventoryTwdRate={vnTradeAnalytics.currentVnTwdRate}
                      />
                    </div>
                    <div className={recordCardClass('rose')}>
                      <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-amber-700">
                        賣出紀錄
                      </h2>
                      <VnTradeTable
                        transactions={vnSellTransactions}
                        editingId={editingId}
                        onEdit={handleEditVn}
                        onDelete={handleDelete}
                        accent="sell"
                        sideLabel="賣出"
                        showSellAverage
                        openingBalances={openingBalances}
                        openingUsdtCost={openingUsdtCost}
                        allTransactions={transactions}
                        sellProfitById={vnTradeAnalytics.sellProfitById}
                        visibleRows={tableVisibleRows}
                        bodyScrollRef={vnSellBodyScrollRef}
                        onBodyScroll={(scrollTop) => syncVnBodyScroll('sell', scrollTop)}
                      />
                    </div>
                  </div>
                </section>
              )}
              <DailyTradeSettleBar
                tradeCount={tradeTransactions.length}
                onSettle={handleTradeSettle}
              />
            </div>
          ) : activeTab === 'expenses' ? (
            <div className="flex flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={cancelEditing} />
              )}
              <h1 className="mb-1 shrink-0 text-sm font-semibold text-slate-800">營業開銷</h1>
              <p className="mb-2 shrink-0 text-[10px] text-slate-500">
                <span className="font-medium text-slate-700">{expenseBusinessDayLabel}</span>
                {' 營業日 · '}
                待結{' '}
                <span className="tabular-nums font-medium text-slate-700">
                  {expenseTransactions.length}
                </span>{' '}
                筆 · 台幣餘額{' '}
                <span className="tabular-nums font-medium text-slate-700">
                  {formatTwd(balances.twd)}
                </span>
              </p>
              <section className="mx-auto w-full max-w-2xl shrink-0 space-y-2">
                <div className={formCardClass('orange', isEditingExpense)}>
                  <ExpenseForm
                    expenseType={expenseType}
                    amount={expenseAmount}
                    note={expenseNote}
                    error={expenseError}
                    isEditing={isEditingExpense}
                    disabled={isEditingAny && !isEditingExpense}
                    twdBalance={balances.twd}
                    focusKey={expenseFormFocusKey}
                    onExpenseTypeChange={setExpenseType}
                    onAmountChange={setExpenseAmount}
                    onNoteChange={setExpenseNote}
                    onSubmit={handleExpenseSubmit}
                    onCancel={resetExpenseForm}
                  />
                </div>
                <div className={`${recordCardClass('orange')} flex flex-col`}>
                  <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-orange-700">
                    開銷紀錄
                  </h2>
                  <ExpenseTable
                    transactions={expenseTransactions}
                    editingId={editingId}
                    onEdit={handleEditExpense}
                    onDelete={handleDelete}
                    visibleRows={tableVisibleRows}
                  />
                  <ExpensePageSummary transactions={expenseTransactions} />
                </div>
              </section>
            </div>
          ) : activeTab === 'settlements' ? (
            <>
              <h1 className="mb-2 shrink-0 text-sm font-semibold text-slate-800">每日結算</h1>
              <SettlementsPanel settlements={settlements} />
            </>
          ) : (
            <>
              <h1 className="mb-2 shrink-0 text-sm font-semibold text-slate-800">月結</h1>
              {selectedMonthlyClose ? (
                <MonthlyCloseDetail
                  monthlyClose={selectedMonthlyClose}
                  onBack={() => setSelectedMonthlyCloseId(null)}
                />
              ) : (
                <MonthlyClosesList
                  closes={monthlyCloses}
                  onSelect={setSelectedMonthlyCloseId}
                  onStartClose={handleOpenMonthlyClose}
                />
              )}
            </>
          )}
        </main>
        </div>
      </div>
    </div>
  )
}

export default App
