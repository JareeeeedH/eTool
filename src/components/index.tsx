import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type {
  AppNavProps,
  CabinAllocModalProps,
  ConfirmModalProps,
  DailyBalanceStripProps,
  DailyTradeSettleBarProps,
  ExpenseFormProps,
  ExpensePageSummaryProps,
  ExpenseTableProps,
  MonthlyClosesListProps,
  MonthlyCloseModalProps,
  NotebookPanelProps,
  OpeningBalanceModalProps,
  SettlementsPanelProps,
  ExpenseSettlementsPanelProps,
  SettlementRecordBodyProps,
  TradeSettleConfirmSummary,
  TradeFormProps,
  TransactionTableProps,
  UndoBannerProps,
  VnTradeFormProps,
  VnTradeTableProps,
  DailyWorkTab,
  DailyMobileTradePane,
  MonthlyClose,
  PageTab,
  TotalAssetsTwd,
  UsdtTransaction,
  VnPayCurrency,
} from '../types'
import {
  EXPENSE_INPUT_CLASS,
  EXPENSE_TABLE_CLASS,
  EXPENSE_TYPE_OPTIONS,
  EMPTY_DATA_LABEL,
  TRADE_FORM_META_CELL_CLASS,
  TRADE_FORM_ACTIONS_CLASS,
  TRADE_FORM_SUBMIT_CLASS,
  TRADE_FORM_GRID_CLASS,
  TRADE_INPUT_CLASS,
  TRADE_PANE_CODE,
  TRADE_RATE_INPUT_CLASS,
  TRADE_RATE_FIELD_CLASS,
  TRANSACTION_CELL_CLASS,
  TRANSACTION_DATA_ROW_STYLE,
  TRANSACTION_FOOT_REM,
  TRANSACTION_HEAD_REM,
  TRANSACTION_NUM_CELL_CLASS,
  TRANSACTION_ACTION_CELL_CLASS,
  TRANSACTION_TIME_CELL_CLASS,
  TRANSACTION_DATE_CELL_CLASS,
  TRANSACTION_INDEX_CELL_CLASS,
  TRANSACTION_MOBILE_DATE_CELL_CLASS,
  TRANSACTION_ROW_HEIGHT_REM,
  TRANSACTION_TABLE_CLASS,
  TRANSACTION_VISIBLE_ROWS_DESKTOP,
  TRANSACTION_VISIBLE_ROWS_MOBILE,
  VN_MOBILE_ACTION_CELL_CLASS,
  VN_MOBILE_INDEX_CELL_CLASS,
  VN_MOBILE_VN_CELL_CLASS,
  VN_MOBILE_COIN_CELL_CLASS,
  VN_MOBILE_NUM_CELL_CLASS,
  VN_DESKTOP_VN_CELL_CLASS,
  VN_TRANSACTION_TABLE_CLASS,
  VN_TRANSACTION_TABLE_MOBILE_CLASS,
} from '../constants'
import {
  expenseTypeLabel,
  formatArchiveDateRange,
  assetCode,
  formatNumber,
  formatProfit,
  formatProfitCompact,
  formatProfitMarginPercent,
  formatUsdtTradeRateDisplay,
  formatVnTradeRateDisplay,
  formatUsdtCostRateDisplay,
  formatSettlementDate,
  formatSettlementDateTime,
  formatTableDateTime,
  formatTradeMetaDateDisplay,
  formatTransactionTableDate,
  formatTwd,
  formatTwdCompactInput,
  formatTwdTableCompact,
  formatVnCompactInput,
  formatVnTableCompact,
  parseTwdAdjustInput,
  parseUsdtAdjustInput,
  parseVnAdjustInput,
  formatVnNtdCostRateCompact,
  formatVnUsdtCostRateCompact,
  profitColorClass,
} from '../utils/format'
import { resolveUsdtTradeFields, resolveVnTradeFields } from '../utils/form'
import {
  calculateAverageRate,
  calculateBuyDayAverageRate,
  computeUsdtSellProfitPreview,
  computeVnSellProfitPreview,
  normalizeMonthlyCloseRecord,
  settlementHasSplitProfit,
  totalAssetsFromSettlement,
} from '../domain'

export function VnPoolCostLines({
  twdRate,
  usdtRate,
  className = 'text-[8px] tabular-nums text-slate-500',
  inline = false,
}: {
  twdRate: number | null
  usdtRate: number | null
  className?: string
  inline?: boolean
}) {
  if (twdRate === null && usdtRate === null) return null
  if (inline) {
    const parts: string[] = []
    if (twdRate !== null) parts.push(formatVnNtdCostRateCompact(twdRate))
    if (usdtRate !== null) parts.push(formatVnUsdtCostRateCompact(usdtRate))
    return <p className={className}>{parts.join(' · ')}</p>
  }
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
export function ConfirmModal({ dialog, onCancel }: ConfirmModalProps) {
  if (!dialog) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2
          id="confirm-dialog-title"
          className={
            dialog.tradeSettleSummary
              ? 'sr-only'
              : 'text-base font-semibold text-slate-900'
          }
        >
          {dialog.title}
        </h2>
        {dialog.tradeSettleSummary ? (
          <TradeSettleConfirmBody summary={dialog.tradeSettleSummary} />
        ) : (
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            {dialog.lines.map((line, i) =>
              line === '' ? (
                <div key={i} className="h-1" />
              ) : (
                <p key={i}>{line}</p>
              ),
            )}
          </div>
        )}
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

function TradeSettleConfirmBody({ summary }: { summary: TradeSettleConfirmSummary }) {
  const countCols = summary.showVn ? 'grid-cols-2' : 'grid-cols-1'

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-end gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {summary.tradeCount} 筆
        </span>
      </div>

      <div className={`grid gap-2 ${countCols}`}>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">P</p>
          <p className="mt-1 text-xs tabular-nums text-slate-700">
            買 <span className="font-semibold text-slate-900">{summary.usdtBuy}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            賣 <span className="font-semibold text-slate-900">{summary.usdtSell}</span>
          </p>
        </div>
        {summary.showVn && (
          <div className="rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">VN</p>
            <p className="mt-1 text-xs tabular-nums text-slate-700">
              買 <span className="font-semibold text-slate-900">{summary.vnBuy}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              賣 <span className="font-semibold text-slate-900">{summary.vnSell}</span>
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 px-3 py-2.5">
        <p className="text-xs font-medium text-slate-500">當日毛利</p>
        {summary.hasSells ? (
          <div className="mt-2 space-y-1 text-sm tabular-nums">
            {summary.dayUsdtProfit !== null && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-500">P</span>
                <span className={`font-medium ${profitColorClass(summary.dayUsdtProfit)}`}>
                  {formatProfit(summary.dayUsdtProfit)}
                </span>
              </div>
            )}
            {summary.dayVnProfit !== null && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-500">VN</span>
                <span className={`font-medium ${profitColorClass(summary.dayVnProfit)}`}>
                  {formatProfit(summary.dayVnProfit)}
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2">
              <span className="font-medium text-slate-700">合計</span>
              <span className={`text-base font-bold ${profitColorClass(summary.dayTotalProfit)}`}>
                {formatProfit(summary.dayTotalProfit)}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">—（無賣出）</p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        結算後將封存交易紀錄並清空每日明細。
      </p>
    </div>
  )
}

export function EditingBanner({ label, onCancel }: { label: string; onCancel: () => void }) {
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

export function SettlementDayProfit({
  usdtProfit,
  vnProfit,
  totalProfit,
  expenseTotal,
  netProfit,
  compact = false,
}: {
  usdtProfit: number | undefined
  vnProfit: number | undefined
  totalProfit: number
  expenseTotal?: number
  netProfit?: number
  compact?: boolean
}) {
  const showSplit = usdtProfit !== undefined && vnProfit !== undefined
  const showNet = expenseTotal !== undefined && expenseTotal > 0
  const textClass = compact ? 'text-[10px] leading-tight' : 'text-xs leading-tight'

  if (!showSplit && !showNet) {
    return (
      <p className={`${textClass} font-bold tabular-nums ${profitColorClass(totalProfit)}`}>
        {formatProfit(totalProfit)}
      </p>
    )
  }

  return (
    <div className={`${textClass} tabular-nums`}>
      {showSplit ? (
        <>
          <p className={profitColorClass(usdtProfit!)}>P {formatProfit(usdtProfit!)}</p>
          <p className={profitColorClass(vnProfit!)}>VN {formatProfit(vnProfit!)}</p>
          <p className={`font-semibold ${profitColorClass(totalProfit)}`}>
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
          <p className="text-rose-600">開銷 −{formatTwd(expenseTotal!)}</p>
          <p className={`font-bold ${profitColorClass(netProfit ?? totalProfit - expenseTotal!)}`}>
            淨利 {formatProfit(netProfit ?? totalProfit - expenseTotal!)}
          </p>
        </>
      )}
    </div>
  )
}
export function UndoBanner({ message, onUndo, onDismiss }: UndoBannerProps) {
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

const BALANCE_CARD_CLASS =
  'rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center leading-tight shadow-sm sm:px-2 sm:py-1.5'
const BALANCE_LABEL_CLASS = 'shrink-0 text-[9px] font-medium leading-tight text-slate-500 sm:text-[10px]'
const BALANCE_VALUE_CLASS =
  'min-w-0 text-xs font-bold tabular-nums leading-tight text-slate-800 sm:text-sm'
const BALANCE_SUB_CLASS = 'text-[9px] tabular-nums leading-tight text-slate-400 sm:mt-0.5 sm:text-[10px]'
const BALANCE_MOBILE_ROW_CLASS = 'flex items-baseline justify-center gap-1 sm:block'

const TOTAL_ASSETS_DENSE_CARD_CLASS =
  'flex h-full min-h-0 flex-col items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50/70 px-1.5 py-1 text-center shadow-sm sm:px-2 sm:py-1.5'

const TOTAL_ASSETS_CARD_CLASS =
  'rounded-lg border border-indigo-200 bg-indigo-50/50 px-2 py-1.5 text-center leading-tight shadow-sm'

export function TotalAssetsColumn({
  assets,
  dense = false,
  titleLabel = '帳面總資產',
  showCurrencySuffix = true,
}: {
  assets: TotalAssetsTwd
  dense?: boolean
  titleLabel?: string
  showCurrencySuffix?: boolean
}) {
  const cardClass = dense ? TOTAL_ASSETS_DENSE_CARD_CLASS : TOTAL_ASSETS_CARD_CLASS
  const labelClass = 'text-[10px] font-medium text-slate-500'
  const valueClass = dense
    ? 'text-xs font-bold tabular-nums leading-tight text-indigo-800 sm:text-sm'
    : 'text-sm font-bold tabular-nums text-indigo-800'
  const noteClass = dense
    ? 'mt-0.5 text-[8px] leading-tight text-amber-700 sm:text-[9px]'
    : 'mt-0.5 text-[9px] text-amber-700'

  return (
    <div className={cardClass}>
      {!dense && (
        <p className={labelClass}>
          {titleLabel}
          {showCurrencySuffix && (
            <span className="ml-0.5 font-normal text-slate-400">TWD</span>
          )}
          {!assets.isComplete && (
            <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[8px] font-medium text-amber-700 sm:text-[9px]">
              部分
            </span>
          )}
        </p>
      )}
      <p
        className={`${valueClass}${dense ? ' flex flex-wrap items-center justify-center gap-1' : ''}`}
        title={formatTwd(assets.total)}
      >
        {formatTwdTableCompact(assets.total)}
        {dense && !assets.isComplete && (
          <span className="rounded bg-amber-100 px-1 py-px text-[8px] font-medium text-amber-700">
            部分
          </span>
        )}
      </p>
      {assets.missingNotes.length > 0 && (
        <p className={noteClass}>{assets.missingNotes.join('；')}</p>
      )}
    </div>
  )
}

export function DailyPageHeader({
  businessDayLabel,
  pendingCount,
}: {
  businessDayLabel: string
  pendingCount: number
}) {
  return (
    <div className="mb-1 hidden items-center gap-x-2 gap-y-0 lg:flex">
      <p className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
        <span className="font-medium text-slate-700">{businessDayLabel}</span>
        <span className="text-slate-300"> · </span>
        待結
        <span className="ml-0.5 tabular-nums font-medium text-slate-700">{pendingCount}</span>
      </p>
    </div>
  )
}

export function DailyBalanceStrip({
  balances,
  inventoryCost,
  usdtCabinBalances,
  totalAssets,
  vnTwdRate,
  vnUsdtRate,
}: DailyBalanceStripProps) {
  const showUsdtCost = balances.usdt > 0 && inventoryCost.twd !== null
  const showVnRates =
    balances.vn > 0 && (vnTwdRate !== null || vnUsdtRate !== null)
  const showCabinSplit = balances.usdt > 0

  return (
    <div className="mb-1 grid grid-cols-2 items-stretch gap-1 sm:mb-1.5 sm:grid-cols-4 sm:gap-1.5">
      <div className={`${BALANCE_CARD_CLASS} ${BALANCE_MOBILE_ROW_CLASS}`}>
        <p className={BALANCE_LABEL_CLASS}>T</p>
        <p className={BALANCE_VALUE_CLASS} title={formatTwd(balances.twd)}>
          {formatTwdTableCompact(balances.twd)}
        </p>
      </div>
      <div
        className={`${BALANCE_CARD_CLASS} flex flex-wrap items-baseline justify-center gap-x-1 gap-y-0 sm:block`}
      >
        <p className={BALANCE_LABEL_CLASS}>P</p>
        <p className={BALANCE_VALUE_CLASS}>{formatNumber(balances.usdt)}</p>
        {showUsdtCost && (
          <p className={BALANCE_SUB_CLASS}>@{formatUsdtCostRateDisplay(inventoryCost.twd!)}</p>
        )}
        {showCabinSplit && (
          <p className={`${BALANCE_SUB_CLASS} w-full text-[9px] sm:text-[10px]`}>
            A {formatNumber(usdtCabinBalances.a)}
            <span className="mx-0.5 text-slate-300">·</span>
            B {formatNumber(usdtCabinBalances.b)}
          </p>
        )}
      </div>
      <div className={BALANCE_CARD_CLASS}>
        <div className={BALANCE_MOBILE_ROW_CLASS}>
          <p className={BALANCE_LABEL_CLASS}>V</p>
          <p className={`${BALANCE_VALUE_CLASS} text-[10px] sm:text-sm`} title={formatNumber(balances.vn)}>
            {formatVnTableCompact(balances.vn)}
          </p>
        </div>
        {showVnRates && (
          <>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 sm:hidden">
              {vnTwdRate !== null && (
                <p className={BALANCE_SUB_CLASS}>{formatVnNtdCostRateCompact(vnTwdRate)}</p>
              )}
              {vnUsdtRate !== null && (
                <p className={BALANCE_SUB_CLASS}>{formatVnUsdtCostRateCompact(vnUsdtRate)}</p>
              )}
            </div>
            <VnPoolCostLines
              twdRate={vnTwdRate}
              usdtRate={vnUsdtRate}
              inline
              className={`${BALANCE_SUB_CLASS} mt-0.5 hidden sm:block`}
            />
          </>
        )}
      </div>
      <TotalAssetsColumn assets={totalAssets} dense />
    </div>
  )
}

/** 資產艙位管理總覽（獨立頁簽）— 放大卡片並垂直置中，減少下方空白感 */
export function AssetsCabinOverview({
  balances,
  inventoryCost,
  usdtCabinBalances,
  totalAssets,
  vnTwdRate,
  vnUsdtRate,
}: DailyBalanceStripProps) {
  const showUsdtCost = balances.usdt > 0 && inventoryCost.twd !== null
  const showVnRates =
    balances.vn > 0 && (vnTwdRate !== null || vnUsdtRate !== null)
  const showCabinSplit = balances.usdt > 0

  const cardClass =
    'flex min-h-[6.25rem] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm sm:min-h-[7.5rem] sm:px-4 sm:py-5'
  const labelClass = 'text-[11px] font-medium tracking-wide text-slate-400 sm:text-xs'
  const valueClass = 'mt-1 text-xl font-bold tabular-nums leading-none text-slate-800 sm:text-2xl'
  const totalValueClass =
    'mt-1 text-xl font-bold tabular-nums leading-none text-indigo-800 sm:text-2xl'
  const subClass = 'mt-1.5 text-[11px] tabular-nums leading-tight text-slate-400 sm:text-xs'

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-4 sm:max-w-xl sm:py-6">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
          <div className={cardClass}>
            <p className={labelClass}>T</p>
            <p className={valueClass} title={formatTwd(balances.twd)}>
              {formatTwdTableCompact(balances.twd)}
            </p>
          </div>

          <div className={cardClass}>
            <p className={labelClass}>P</p>
            <p className={valueClass}>{formatNumber(balances.usdt)}</p>
            {showUsdtCost && (
              <p className={subClass}>@{formatUsdtCostRateDisplay(inventoryCost.twd!)}</p>
            )}
            {showCabinSplit && (
              <p className={`${subClass} mt-1`}>
                A {formatNumber(usdtCabinBalances.a)}
                <span className="mx-1 text-slate-300">·</span>
                B {formatNumber(usdtCabinBalances.b)}
              </p>
            )}
          </div>

          <div className={cardClass}>
            <p className={labelClass}>V</p>
            <p className={valueClass} title={formatNumber(balances.vn)}>
              {formatVnTableCompact(balances.vn)}
            </p>
            {showVnRates && (
              <div className={`${subClass} flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5`}>
                {vnTwdRate !== null && <span>{formatVnNtdCostRateCompact(vnTwdRate)}</span>}
                {vnUsdtRate !== null && <span>{formatVnUsdtCostRateCompact(vnUsdtRate)}</span>}
              </div>
            )}
          </div>

          <div className={`${cardClass} border-indigo-200 bg-indigo-50/70`}>
            <p className={totalValueClass} title={formatTwd(totalAssets.total)}>
              {formatTwdTableCompact(totalAssets.total)}
              {!totalAssets.isComplete && (
                <span className="ml-1.5 align-middle rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-700">
                  部分
                </span>
              )}
            </p>
            {totalAssets.missingNotes.length > 0 && (
              <p className="mt-1.5 text-[10px] leading-tight text-amber-700">
                {totalAssets.missingNotes.join('；')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CabinAllocModal({
  open,
  totalUsdt,
  direction,
  initialCabinA,
  cabinBalances,
  error,
  onCancel,
  onConfirm,
}: CabinAllocModalProps) {
  const [cabinAStr, setCabinAStr] = useState('')
  const [cabinBStr, setCabinBStr] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return
    const a = Math.min(Math.max(0, initialCabinA), totalUsdt)
    const b = Math.max(0, totalUsdt - a)
    setCabinAStr(a === 0 ? '' : String(a))
    setCabinBStr(b === 0 ? '' : String(b))
    setLocalError('')
  }, [open, initialCabinA, totalUsdt])

  if (!open) return null

  const parseAmt = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return 0
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  }

  const applyA = (raw: string) => {
    setCabinAStr(raw)
    const a = parseAmt(raw)
    if (a === null) return
    const clamped = Math.min(a, totalUsdt)
    setCabinBStr(String(Math.max(0, totalUsdt - clamped)))
    setLocalError('')
  }

  const applyB = (raw: string) => {
    setCabinBStr(raw)
    const b = parseAmt(raw)
    if (b === null) return
    const clamped = Math.min(b, totalUsdt)
    setCabinAStr(String(Math.max(0, totalUsdt - clamped)))
    setLocalError('')
  }

  const setPreset = (a: number) => {
    const clamped = Math.min(Math.max(0, a), totalUsdt)
    setCabinAStr(clamped === 0 ? '0' : String(clamped))
    setCabinBStr(String(Math.max(0, totalUsdt - clamped)))
    setLocalError('')
  }

  const handleConfirm = () => {
    const a = parseAmt(cabinAStr)
    const b = parseAmt(cabinBStr)
    if (a === null || b === null) {
      setLocalError('請輸入有效的非負數量')
      return
    }
    const sum = a + b
    if (Math.abs(sum - totalUsdt) > 1e-9) {
      setLocalError(`A+B 須等於 ${formatNumber(totalUsdt)}`)
      return
    }
    onConfirm(a)
  }

  const signLabel = direction === 'in' ? '+' : '−'
  const displayError = localError || error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cabin-alloc-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 id="cabin-alloc-title" className="text-base font-semibold text-slate-900">
          分倉配置
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          本筆 P {formatNumber(totalUsdt)} · 請分配至 A / B（成本共用）
        </p>

        <div className="mt-3 flex gap-2 text-[10px] tabular-nums text-slate-500">
          <span>
            目前 A {formatNumber(cabinBalances.a)}
          </span>
          <span className="text-slate-300">·</span>
          <span>
            B {formatNumber(cabinBalances.b)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold text-sky-600">
              A{signLabel}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={cabinAStr}
              onChange={(e) => applyA(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold text-violet-600">
              B{signLabel}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={cabinBStr}
              onChange={(e) => applyB(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm tabular-nums outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            />
          </label>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setPreset(totalUsdt)}
            className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
          >
            全 A
          </button>
          <button
            type="button"
            onClick={() => setPreset(0)}
            className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
          >
            全 B
          </button>
          <button
            type="button"
            onClick={() => setPreset(totalUsdt / 2)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
          >
            各半
          </button>
        </div>

        {displayError && (
          <p className="mt-2 text-xs text-rose-600">{displayError}</p>
        )}

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
            onClick={handleConfirm}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            確認
          </button>
        </div>
      </div>
    </div>
  )
}

export function DailyTradeSettleBar({ tradeCount, onSettle }: DailyTradeSettleBarProps) {
  const canSettle = tradeCount > 0

  return (
    <div className="mt-1 flex justify-end sm:mt-1.5">
      <button
        type="button"
        onClick={onSettle}
        disabled={!canSettle}
        className="w-full rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 sm:w-auto sm:bg-indigo-600 sm:py-0.5 sm:text-xs sm:text-white sm:shadow-sm sm:hover:bg-indigo-700 sm:disabled:bg-slate-300 sm:disabled:text-slate-500"
      >
        {canSettle ? 'AL' : '尚無可結交易'}
      </button>
    </div>
  )
}
export function RowActionButtons({
  onEdit,
  onDelete,
  compact = false,
}: {
  onEdit: () => void
  onDelete: () => void
  compact?: boolean
}) {
  const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const btnClass = compact
    ? 'shrink-0 rounded p-0.5 transition'
    : 'shrink-0 rounded p-1 transition'
  return (
    <div className="flex flex-nowrap items-center justify-end gap-0">
      <button
        type="button"
        onClick={onEdit}
        title="編輯"
        aria-label="編輯"
        className={`${btnClass} text-sky-600 hover:bg-sky-50`}
      >
        <svg
          className={iconClass}
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
        className={`${btnClass} text-rose-600 hover:bg-rose-50`}
      >
        <svg
          className={iconClass}
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

export function useTransactionVisibleRows(): number {
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

export function useIsLgUp(): boolean {
  const [isLgUp, setIsLgUp] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsLgUp(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return isLgUp
}

export function transactionBodyMaxHeight(visibleRows: number): string {
  return `calc(${TRANSACTION_ROW_HEIGHT_REM}rem * ${visibleRows})`
}

export function transactionTableLayout(visibleRows: number, transactionCount: number) {
  return {
    hasOverflow: transactionCount > visibleRows,
    maxBodyHeight: transactionBodyMaxHeight(visibleRows),
  }
}

export function useTableScrollAffordance(
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

export function TransactionTableColGroup({
  isBuy,
  mobileRowIndex = false,
}: {
  isBuy: boolean
  mobileRowIndex?: boolean
}) {
  if (mobileRowIndex) {
    if (isBuy) {
      return (
        <colgroup>
          <col style={{ width: '13%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '17%' }} />
        </colgroup>
      )
    }
    return (
      <colgroup>
        <col style={{ width: '11%' }} />
        <col style={{ width: '21%' }} />
        <col style={{ width: '21%' }} />
        <col style={{ width: '17%' }} />
        <col style={{ width: '15%' }} />
        <col style={{ width: '15%' }} />
      </colgroup>
    )
  }

  return (
    <colgroup>
      <col style={{ width: '4.25rem' }} />
      <col style={{ width: isBuy ? '24%' : '20%' }} />
      <col style={{ width: isBuy ? '30%' : '24%' }} />
      <col style={{ width: isBuy ? '18%' : '13%' }} />
      {!isBuy && <col style={{ width: '16%' }} />}
      <col style={{ width: '3.25rem' }} />
    </colgroup>
  )
}

export function VnTradeTableColGroup({
  isBuy,
  mobileRowIndex = false,
}: {
  isBuy: boolean
  mobileRowIndex?: boolean
}) {
  if (mobileRowIndex) {
    if (isBuy) {
      return (
        <colgroup>
          <col style={{ width: '13%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '27%' }} />
          <col style={{ width: '21%' }} />
          <col style={{ width: '17%' }} />
        </colgroup>
      )
    }
    return (
      <colgroup>
        <col style={{ width: '12%' }} />
        <col style={{ width: '17%' }} />
        <col style={{ width: '21%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '20%' }} />
        <col style={{ width: '2.5rem' }} />
      </colgroup>
    )
  }

  const coinCol = '1.75rem'
  const actionCol = '3rem'
  const vnCol = '4.5rem'

  return (
    <colgroup>
      <col style={{ width: '2.75rem' }} />
      <col style={{ width: vnCol }} />
      <col style={{ width: coinCol }} />
      <col style={{ width: isBuy ? '24%' : '22%' }} />
      <col style={{ width: isBuy ? '20%' : '17%' }} />
      {!isBuy && <col style={{ width: '14%' }} />}
      <col style={{ width: actionCol }} />
    </colgroup>
  )
}

export function TransactionTableHeader({
  isBuy,
  mobileRowIndex = false,
}: {
  isBuy: boolean
  mobileRowIndex?: boolean
}) {
  const numCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_NUM_CELL_CLASS} ${extra}`
      : `${TRANSACTION_NUM_CELL_CLASS} ${extra}`

  return (
    <thead>
      <tr
        className="border-b border-slate-200 text-[13px] text-slate-500"
        style={{ height: `${TRANSACTION_HEAD_REM}rem` }}
      >
        <th
          className={`${
            mobileRowIndex ? TRANSACTION_MOBILE_DATE_CELL_CLASS : TRANSACTION_TIME_CELL_CLASS
          } font-medium text-slate-500`}
        >
          {'\u00a0'}
        </th>
        <th className={numCell('font-medium text-slate-500')}>P</th>
        <th className={numCell('font-medium text-slate-500')}>T</th>
        <th className={numCell('font-medium text-slate-500')}>R</th>
        {!isBuy && (
          <th className={numCell('font-medium text-slate-500')}>PF</th>
        )}
        <th
          className={
            mobileRowIndex
              ? `${VN_MOBILE_ACTION_CELL_CLASS} font-medium text-slate-500`
              : `${TRANSACTION_ACTION_CELL_CLASS} font-medium text-slate-500`
          }
        >
          {mobileRowIndex ? '' : '操作'}
        </th>
      </tr>
    </thead>
  )
}

export function TransactionTableFooter({
  isBuy,
  transactions,
  totalUsdt,
  totalTwd,
  twdAvg,
  showDayAverage,
  totalProfit,
  hasProfitData,
  mobileRowIndex = false,
}: {
  isBuy: boolean
  transactions: UsdtTransaction[]
  totalUsdt: number
  totalTwd: number
  twdAvg: number | null
  showDayAverage: boolean
  totalProfit: number
  hasProfitData: boolean
  mobileRowIndex?: boolean
}) {
  const numCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_NUM_CELL_CLASS} ${extra}`
      : `${TRANSACTION_NUM_CELL_CLASS} ${extra}`

  return (
    <tfoot>
      <tr
        className={`border-t-2 bg-slate-50 ${
          isBuy ? 'border-emerald-200' : 'border-rose-200'
        }`}
        style={{ height: `${TRANSACTION_FOOT_REM}rem` }}
      >
        <td
          className={`${
            mobileRowIndex ? TRANSACTION_INDEX_CELL_CLASS : TRANSACTION_TIME_CELL_CLASS
          } font-semibold text-slate-800`}
        >
          {mobileRowIndex ? null : (
            <span className="whitespace-nowrap">
              總結
              <span className="ml-0.5 font-normal text-slate-500">
                {transactions.length}筆
              </span>
            </span>
          )}
        </td>
        <td className={numCell('font-medium text-slate-800')}>
          {formatNumber(totalUsdt)}
        </td>
        <td className={numCell('font-medium text-slate-800')}>
          {totalTwd > 0 ? (
            <span title={formatTwd(totalTwd)}>{formatTwdTableCompact(totalTwd)}</span>
          ) : (
            '—'
          )}
        </td>
        <td className={numCell()}>
          {showDayAverage ? (
            twdAvg !== null ? (
              <span className={`font-bold tabular-nums ${isBuy ? 'text-emerald-600' : 'text-rose-600'}`}>
                @{formatUsdtTradeRateDisplay(twdAvg)}
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
            className={numCell(
              `px-0.5 font-bold ${hasProfitData ? profitColorClass(totalProfit) : 'text-slate-400'}`,
            )}
          >
            {hasProfitData ? formatProfit(totalProfit) : '—'}
          </td>
        )}
        <td className={mobileRowIndex ? VN_MOBILE_ACTION_CELL_CLASS : TRANSACTION_ACTION_CELL_CLASS} />
      </tr>
    </tfoot>
  )
}

function transactionDataRowClass(
  txId: string,
  editingId: string | null,
  highlightedId?: string | null,
): string {
  if (editingId === txId) {
    return 'bg-amber-50/60 hover:bg-amber-50/80'
  }
  if (highlightedId === txId) {
    return 'transaction-row--new'
  }
  return ''
}

export function TransactionTable({
  transactions,
  editingId,
  highlightedId = null,
  onEdit,
  onDelete,
  accent,
  sideLabel: _sideLabel,
  showDayAverage = false,
  sellProfitById,
  visibleRows = 8,
  bodyScrollRef,
  onBodyScroll,
}: TransactionTableProps) {
  const isBuy = accent === 'buy'
  const isLgUp = useIsLgUp()
  const mobileRowIndex = !isLgUp
  const usdtNumCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_NUM_CELL_CLASS} ${extra}`
      : `${TRANSACTION_NUM_CELL_CLASS} ${extra}`
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
    mobileRowIndex,
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

  useEffect(() => {
    if (!highlightedId) return
    const row = document.querySelector(`[data-usdt-row="${highlightedId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlightedId])

  const transactionRows = transactions.map((tx) => {
    const profitInfo = sellProfitById?.get(tx.id)
    return (
      <tr
        key={tx.id}
        data-usdt-row={tx.id}
        style={TRANSACTION_DATA_ROW_STYLE}
        className={`group border-b border-slate-100 transition-colors hover:bg-slate-100/70 ${transactionDataRowClass(tx.id, editingId, highlightedId)}`}
      >
        <td
          className={`${
            mobileRowIndex ? TRANSACTION_MOBILE_DATE_CELL_CLASS : TRANSACTION_TIME_CELL_CLASS
          } text-slate-600`}
        >
          <span className="inline-flex items-center gap-0.5">
            {formatTransactionTableDate(tx.timestamp)}
          </span>
        </td>
        <td className={usdtNumCell('text-slate-800')}>
          {formatNumber(tx.usdtAmount)}
        </td>
        <td className={usdtNumCell('text-slate-800')}>
          <span title={formatTwd(tx.fiatAmount)}>{formatTwdTableCompact(tx.fiatAmount)}</span>
        </td>
        <td className={usdtNumCell('text-slate-600')}>
          {formatUsdtTradeRateDisplay(tx.rate)}
        </td>
        {!isBuy && (
          <td
            className={usdtNumCell(
              `px-0.5 font-semibold ${
                profitInfo !== undefined
                  ? profitColorClass(profitInfo.profit)
                  : 'text-slate-400'
              }`,
            )}
          >
            {profitInfo?.unitCost !== null && profitInfo !== undefined
              ? formatProfit(profitInfo.profit)
              : '—'}
          </td>
        )}
        <td className={mobileRowIndex ? VN_MOBILE_ACTION_CELL_CLASS : TRANSACTION_ACTION_CELL_CLASS}>
          <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <RowActionButtons
              compact={mobileRowIndex}
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
        <p className="text-sm text-slate-400">{EMPTY_DATA_LABEL}</p>
      </td>
    </tr>
  )

  if (!hasOverflow) {
    return (
      <div className="overflow-x-auto">
        <table className={TRANSACTION_TABLE_CLASS}>
          <TransactionTableColGroup isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
          <TransactionTableHeader isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
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
        <TransactionTableColGroup isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
        <TransactionTableHeader isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
      </table>
      <div className="relative shrink-0">
        <div
          ref={scrollRef}
          className="transaction-table-body-scroll--overflow overflow-x-auto overflow-y-auto"
          style={{ maxHeight: maxBodyHeight }}
          onScroll={(event) => onBodyScroll?.(event.currentTarget.scrollTop)}
        >
          <table className={TRANSACTION_TABLE_CLASS}>
            <TransactionTableColGroup isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
            <tbody>{transactions.length === 0 ? emptyBody : transactionRows}</tbody>
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
        <TransactionTableColGroup isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
        <TransactionTableFooter {...footerProps} />
      </table>
    </div>
  )
}

function TradeMetaDateInput({
  id,
  value,
  onChange,
  disabled,
  className = '',
}: {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label className={`relative block min-w-0 ${className}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-xs tabular-nums text-slate-700"
      >
        {formatTradeMetaDateDisplay(value)}
      </span>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="交易日期"
        className="w-[4.85rem] max-w-full rounded border border-slate-300 py-1 pl-1.5 pr-0.5 text-xs tabular-nums text-transparent outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300/40 disabled:bg-slate-50 sm:w-full sm:max-w-[9.5rem] sm:py-0.5 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
    </label>
  )
}

function TradeFormMetaCell({
  dateId,
  tradeDate,
  onTradeDateChange,
  disabled,
  isEditing,
  onClear,
  onCancel,
  buttonClass,
}: {
  dateId: string
  tradeDate: string
  onTradeDateChange: (value: string) => void
  disabled?: boolean
  isEditing: boolean
  onClear: () => void
  onCancel: () => void
  buttonClass: string
}) {
  return (
    <div className={TRADE_FORM_META_CELL_CLASS}>
      <TradeMetaDateInput
        id={dateId}
        value={tradeDate}
        onChange={onTradeDateChange}
        disabled={disabled}
        className="shrink-0 sm:min-w-0 sm:flex-1"
      />
      {!isEditing && (
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className={TRADE_FORM_ACTIONS_CLASS}
          aria-label="Cancel"
        >
          C
        </button>
      )}
      <button
        type="submit"
        disabled={disabled}
        aria-label="Add"
        className={`${TRADE_FORM_SUBMIT_CLASS} ${
          isEditing
            ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30'
            : buttonClass
        }`}
      >
        {isEditing ? '儲存' : 'A'}
      </button>
      {isEditing && (
        <button type="button" onClick={onCancel} className={TRADE_FORM_ACTIONS_CLASS}>
          取消
        </button>
      )}
    </div>
  )
}

export function UsdtCabinToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: 'A' | 'B'
  onChange: (cabin: 'A' | 'B') => void
  disabled?: boolean
}) {
  return (
    <div className="mb-1 flex items-center gap-0.5">
      {(['A', 'B'] as const).map((cabin) => (
        <button
          key={cabin}
          type="button"
          disabled={disabled}
          onClick={() => onChange(cabin)}
          className={`rounded-full px-2 py-px text-[10px] font-semibold transition disabled:opacity-50 ${
            value === cabin
              ? cabin === 'A'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-violet-600 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-500 hover:border-slate-300'
          }`}
        >
          {cabin}
        </button>
      ))}
      <span className="ml-1 text-[9px] text-slate-400">艙</span>
    </div>
  )
}

export function TradeForm({
  type,
  title,
  editTitle,
  usdt,
  fiat,
  rate,
  tradeDate,
  error,
  isEditing,
  disabled,
  onFieldChange,
  onTradeDateChange,
  onSubmit,
  onCancel,
  onClear,
  accentClass,
  buttonClass,
  focusClass,
  balances,
  openingBalances,
  openingUsdtCost,
  transactions,
  excludeTransactionId = null,
}: TradeFormProps) {
  const prefix = type === 'buy' ? 'buy' : 'sell'
  const inputClass = `${TRADE_INPUT_CLASS} ${focusClass}`
  const rateInputClass = `${TRADE_RATE_INPUT_CLASS} ${focusClass}`

  const resolvedPreview = useMemo(() => {
    const resolved = resolveUsdtTradeFields(usdt, fiat, rate)
    return resolved.ok ? resolved : null
  }, [usdt, fiat, rate])

  const usdtNum = resolvedPreview?.usdt ?? NaN
  const fiatNum = resolvedPreview?.fiat ?? NaN
  const usdtValid = !Number.isNaN(usdtNum) && usdtNum > 0
  const fiatValid = !Number.isNaN(fiatNum) && fiatNum > 0
  const twdInsufficient = type === 'buy' && fiatValid && fiatNum > balances.twd
  const usdtInsufficient = type === 'sell' && usdtValid && usdtNum > balances.usdt

  let previewText: string | null = null
  let previewWarn = false
  let profitPreview: { text: string; value: number } | null = null

  if (usdtValid && fiatValid) {
    if (type === 'buy') {
      previewText = `−T ${formatTwdTableCompact(fiatNum)} · +P ${formatNumber(usdtNum)}`
      previewWarn = fiatNum > balances.twd
    } else {
      previewText = `−P ${formatNumber(usdtNum)} · +T ${formatTwdTableCompact(fiatNum)}`
      previewWarn = usdtNum > balances.usdt
      const sellProfit = computeUsdtSellProfitPreview(
        openingBalances,
        openingUsdtCost,
        transactions,
        usdtNum,
        fiatNum,
        excludeTransactionId,
      )
      if (sellProfit !== null && sellProfit.unitCost !== null) {
        const marginPct = formatProfitMarginPercent(sellProfit.profit, sellProfit.costBasis)
        profitPreview = {
          text: `PF ${formatProfitCompact(sellProfit.profit)}${
            marginPct ? `（${marginPct}）` : ''
          }`,
          value: sellProfit.profit,
        }
      }
    }
  }

  const showTradeHint = previewText || twdInsufficient || usdtInsufficient

  return (
    <>
      <h2 className={`mb-1 hidden text-xs font-semibold sm:block ${accentClass}`}>
        {isEditing ? editTitle : title}
      </h2>

      <form onSubmit={onSubmit}>
        <div className={TRADE_FORM_GRID_CLASS}>
          <label className="col-start-1 row-start-1 block min-w-0 sm:order-1 sm:flex-1">
            <input
              id={`${prefix}Usdt`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={usdt}
              onChange={(e) => onFieldChange('usdt', e.target.value)}
              disabled={disabled}
              placeholder="P"
              aria-label="P"
              className={`w-full py-0.5 ${inputClass}`}
            />
          </label>
          <label
            className={`col-start-2 row-start-1 ${TRADE_RATE_FIELD_CLASS} sm:order-2`}
          >
            <input
              id={`${prefix}Rate`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => onFieldChange('rate', e.target.value)}
              disabled={disabled}
              placeholder="R"
              aria-label="匯率"
              className={`w-full py-0.5 ${rateInputClass}`}
            />
          </label>
          <label className="col-start-1 row-start-2 block min-w-0 sm:order-3 sm:flex-1">
            <input
              id={`${prefix}Fiat`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={fiat}
              onChange={(e) => onFieldChange('fiat', e.target.value)}
              disabled={disabled}
              placeholder="T"
              aria-label="TWD"
              className={`w-full py-0.5 ${inputClass}`}
            />
          </label>
          <div className="col-start-2 row-start-2 sm:order-4">
            <TradeFormMetaCell
              dateId={`${prefix}Date`}
              tradeDate={tradeDate}
              onTradeDateChange={onTradeDateChange}
              disabled={disabled}
              isEditing={isEditing}
              onClear={onClear}
              onCancel={onCancel}
              buttonClass={buttonClass}
            />
          </div>
        </div>

        {showTradeHint && (
          <p
            className={`mt-0.5 text-[10px] tabular-nums ${
              twdInsufficient || usdtInsufficient || previewWarn
                ? 'text-rose-600'
                : 'text-slate-500'
            }`}
          >
            {previewText ??
              (twdInsufficient ? '台幣餘額不足' : usdtInsufficient ? 'USDT 餘額不足' : null)}
          </p>
        )}

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

export function DailyWorkTabBar({
  value,
  onChange,
  className = '',
}: {
  value: DailyWorkTab
  onChange: (tab: DailyWorkTab) => void
  className?: string
}) {
  const tabs: {
    id: DailyWorkTab
    label: string
    ariaLabel: string
    activeClass: string
    idleClass: string
  }[] = [
    {
      id: 'usdt',
      label: 'P',
      ariaLabel: 'P 進出',
      activeClass:
        'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/25',
      idleClass: 'text-slate-500 hover:bg-emerald-50 hover:text-emerald-800',
    },
    {
      id: 'vn',
      label: 'VN',
      ariaLabel: 'VN 進出',
      activeClass:
        'bg-violet-600 text-white shadow-sm ring-1 ring-violet-500/25',
      idleClass: 'text-slate-500 hover:bg-violet-50 hover:text-violet-800',
    },
  ]

  return (
    <div
      className={`mb-2 rounded-xl bg-slate-100/90 p-1.5 sm:mb-2.5 ${className}`}
      role="tablist"
      aria-label="交易類型"
    >
      <div className="grid grid-cols-2 gap-1.5">
        {tabs.map((tab) => {
          const selected = value === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={tab.ariaLabel}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(tab.id)}
              className={`min-w-0 rounded-lg px-4 py-2.5 text-center text-base font-bold tracking-tight transition-all sm:px-8 sm:py-3 sm:text-lg ${
                selected ? tab.activeClass : tab.idleClass
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const MOBILE_TRADE_PANES: {
  id: DailyMobileTradePane
  activeClass: string
  idleClass: string
}[] = [
  {
    id: 'buy_u',
    activeClass:
      'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600/25',
    idleClass: 'text-emerald-800/70 hover:bg-white/70 hover:text-emerald-900',
  },
  {
    id: 'sell_u',
    activeClass: 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-600/25',
    idleClass: 'text-rose-800/70 hover:bg-white/70 hover:text-rose-900',
  },
  {
    id: 'buy_vn',
    activeClass:
      'bg-violet-600 text-white shadow-sm ring-1 ring-violet-600/25',
    idleClass: 'text-violet-800/70 hover:bg-white/70 hover:text-violet-900',
  },
  {
    id: 'sell_vn',
    activeClass: 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-600/25',
    idleClass: 'text-amber-900/70 hover:bg-white/70 hover:text-amber-950',
  },
]

export function DailyMobileTradeTabBar({
  value,
  onChange,
  className = '',
}: {
  value: DailyMobileTradePane
  onChange: (pane: DailyMobileTradePane) => void
  className?: string
}) {
  return (
    <div
      className={`mb-1.5 rounded-xl bg-slate-100/90 p-1 ${className}`}
      role="tablist"
      aria-label="交易功能"
    >
      <div className="grid grid-cols-4 gap-1">
        {MOBILE_TRADE_PANES.map((pane) => {
          const selected = value === pane.id
          return (
            <button
              key={pane.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(pane.id)}
              className={`min-w-0 rounded-lg px-0.5 py-2 text-center transition-all ${
                selected ? pane.activeClass : pane.idleClass
              }`}
            >
              <span className="block text-[13px] font-bold leading-none tracking-tight">
                {TRADE_PANE_CODE[pane.id]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function vnPayCurrencyRowAccent(payCurrency: VnPayCurrency): string {
  return payCurrency === 'usdt' ? 'border-l-2 border-l-sky-400' : 'border-l-2 border-l-emerald-500'
}

export function VnPayCurrencyBadge({
  currency,
  size = 'sm',
}: {
  currency: VnPayCurrency
  size?: 'sm' | 'xs'
}) {
  const isUsdt = currency === 'usdt'
  const sizeClass =
    size === 'xs'
      ? 'min-w-[1.125rem] px-0.5 text-[11px]'
      : 'min-w-[1.25rem] px-1 text-[12px]'

  return (
    <span
      className={`inline-flex items-center justify-center rounded py-px font-bold leading-none tabular-nums ${sizeClass} ${
        isUsdt
          ? 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200/80'
          : 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200/80'
      }`}
      title={isUsdt ? 'USDT (P)' : '台幣 (T)'}
    >
      {assetCode(currency)}
    </span>
  )
}

function vnRateUnitSuffix(payCurrency: VnPayCurrency): string {
  return payCurrency === 'usdt' ? '/P' : '/T'
}

function vnMobileRateCell(rate: number, payCurrency: VnPayCurrency, showSuffix = true) {
  if (!showSuffix) {
    return (
      <span className="tabular-nums text-[12px] text-slate-600">
        {formatVnTradeRateDisplay(rate)}
      </span>
    )
  }

  const unitClass =
    payCurrency === 'usdt' ? 'text-sky-600' : 'text-emerald-600'

  return (
    <span className="inline-flex items-baseline justify-end gap-px tabular-nums leading-tight">
      <span className="text-[12px] text-slate-600">{formatVnTradeRateDisplay(rate)}</span>
      <span className={`text-[9px] font-semibold ${unitClass}`}>
        {vnRateUnitSuffix(payCurrency)}
      </span>
    </span>
  )
}

export function VnPayCurrencyToggle({
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
  const usdtButton = (
    <button
      key="usdt"
      type="button"
      disabled={disabled}
      onClick={() => onChange('usdt')}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
        value === 'usdt'
          ? 'bg-sky-100 text-sky-800 shadow-sm ring-1 ring-sky-200'
          : 'text-slate-600 hover:text-sky-700'
      }`}
    >
      {buySide ? 'OE' : 'IE'}
    </button>
  )
  const twdButton = (
    <button
      key="twd"
      type="button"
      disabled={disabled}
      onClick={() => onChange('twd')}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
        value === 'twd'
          ? 'bg-emerald-100 text-emerald-800 shadow-sm ring-1 ring-emerald-200'
          : 'text-slate-600 hover:text-emerald-700'
      }`}
    >
      {buySide ? 'OT' : 'IT'}
    </button>
  )

  return (
    <div className="inline-flex rounded-md bg-slate-100 p-0.5">
      {buySide ? usdtButton : twdButton}
      {buySide ? twdButton : usdtButton}
    </div>
  )
}

export function VnTradeForm({
  type,
  title,
  editTitle,
  payCurrency,
  onPayCurrencyChange,
  vn,
  pay,
  rate,
  tradeDate,
  error,
  isEditing,
  disabled,
  onFieldChange,
  onTradeDateChange,
  onSubmit,
  onCancel,
  onClear,
  accentClass,
  buttonClass,
  focusClass,
  balances,
  openingBalances,
  openingVnTwdRate,
  openingVnUsdtRate,
  openingUsdtCost,
  transactions,
  excludeTransactionId = null,
}: VnTradeFormProps) {
  const prefix = type === 'buy' ? 'vnBuy' : 'vnSell'
  const inputClass = `${TRADE_INPUT_CLASS} ${focusClass}`
  const rateInputClass = `${TRADE_RATE_INPUT_CLASS} ${focusClass}`
  const payLabel = assetCode(payCurrency)

  const resolvedPreview = useMemo(() => {
    const resolved = resolveVnTradeFields(vn, pay, rate, payCurrency)
    return resolved.ok ? resolved : null
  }, [vn, pay, rate])

  const vnNum = resolvedPreview?.vn ?? NaN
  const payNum = resolvedPreview?.pay ?? NaN
  const vnValid = !Number.isNaN(vnNum) && vnNum > 0
  const payValid = !Number.isNaN(payNum) && payNum > 0
  const payInsufficient =
    type === 'buy' &&
    payValid &&
    (payCurrency === 'twd' ? payNum > balances.twd : payNum > balances.usdt)
  const vnInsufficient = type === 'sell' && vnValid && vnNum > balances.vn

  let previewText: string | null = null
  let previewWarn = false
  let profitPreview: { text: string; value: number } | null = null
  if (vnValid && payValid) {
    const payDisplay =
      payCurrency === 'usdt' ? formatNumber(payNum) : formatTwdTableCompact(payNum)
    if (type === 'buy') {
      previewText = `−${payLabel} ${payDisplay} · +VN ${formatVnTableCompact(vnNum)}`
      previewWarn =
        payCurrency === 'twd' ? payNum > balances.twd : payNum > balances.usdt
    } else {
      previewText = `−VN ${formatVnTableCompact(vnNum)} · +${payLabel} ${payDisplay}`
      previewWarn = vnNum > balances.vn
      const sellProfit = computeVnSellProfitPreview(
        openingBalances,
        openingVnTwdRate,
        openingVnUsdtRate,
        openingUsdtCost,
        transactions,
        vnNum,
        payCurrency,
        payNum,
        excludeTransactionId,
      )
      if (sellProfit !== null) {
        const marginPct = formatProfitMarginPercent(sellProfit.profit, sellProfit.costBasis)
        profitPreview = {
          text: `PF ${formatProfitCompact(sellProfit.profit)}${
            marginPct ? `（${marginPct}）` : ''
          }`,
          value: sellProfit.profit,
        }
      }
    }
  }

  const showVnHint = previewText || payInsufficient || vnInsufficient

  return (
    <>
      <div className="mb-1.5 flex items-center justify-end gap-1.5 sm:mb-1 sm:justify-between">
        <h2 className={`hidden text-sm font-semibold sm:block ${accentClass}`}>
          {isEditing ? editTitle : title}
        </h2>
        <div className="justify-self-end sm:justify-self-auto">
          <VnPayCurrencyToggle
            value={payCurrency}
            onChange={onPayCurrencyChange}
            disabled={disabled}
            buySide={type === 'buy'}
          />
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className={TRADE_FORM_GRID_CLASS}>
          <label className="col-start-1 row-start-1 block min-w-0 sm:order-1 sm:flex-1">
            <input
              id={`${prefix}Vn`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={vn}
              onChange={(e) => onFieldChange('vn', e.target.value)}
              disabled={disabled}
              placeholder="VN"
              aria-label="VN"
              className={`w-full py-0.5 ${inputClass}`}
            />
          </label>
          <label
            className={`col-start-2 row-start-1 ${TRADE_RATE_FIELD_CLASS} sm:order-2`}
          >
            <input
              id={`${prefix}Rate`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={rate}
              onChange={(e) => onFieldChange('rate', e.target.value)}
              disabled={disabled}
              placeholder="R"
              aria-label="匯率"
              className={`w-full py-0.5 ${rateInputClass}`}
            />
          </label>
          <label className="col-start-1 row-start-2 block min-w-0 sm:order-3 sm:flex-1">
            <input
              id={`${prefix}Pay`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={pay}
              onChange={(e) => onFieldChange('pay', e.target.value)}
              disabled={disabled}
              placeholder={payLabel}
              aria-label={payLabel}
              className={`w-full py-0.5 ${inputClass}`}
            />
          </label>
          <div className="col-start-2 row-start-2 sm:order-4">
            <TradeFormMetaCell
              dateId={`${prefix}Date`}
              tradeDate={tradeDate}
              onTradeDateChange={onTradeDateChange}
              disabled={disabled}
              isEditing={isEditing}
              onClear={onClear}
              onCancel={onCancel}
              buttonClass={buttonClass}
            />
          </div>
        </div>

        {showVnHint && (
          <p
            className={`mt-0.5 text-[11px] tabular-nums ${
              payInsufficient || vnInsufficient || previewWarn
                ? 'text-rose-600'
                : 'text-slate-500'
            }`}
          >
            {previewText ??
              (payInsufficient
                ? `${payLabel} 餘額不足`
                : vnInsufficient
                  ? 'VN 餘額不足'
                  : null)}
          </p>
        )}

        {profitPreview && (
          <p
            className={`mt-0.5 rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
              profitPreview.value >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {profitPreview.text}
          </p>
        )}

        {error && (
          <p className="mt-1 text-[11px] text-rose-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

export function VnTradeTable({
  transactions,
  editingId,
  highlightedId = null,
  onEdit,
  onDelete,
  accent,
  sideLabel: _sideLabel,
  sellProfitById,
  visibleRows = 8,
  bodyScrollRef,
  onBodyScroll,
}: VnTradeTableProps) {
  const isBuy = accent === 'buy'
  const isLgUp = useIsLgUp()
  const mobileRowIndex = !isLgUp
  const tableClass = mobileRowIndex
    ? VN_TRANSACTION_TABLE_MOBILE_CLASS
    : VN_TRANSACTION_TABLE_CLASS
  const columnCount = mobileRowIndex ? (isBuy ? 5 : 6) : isBuy ? 6 : 7
  const rateHeader = 'R'
  const vnIndexCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_INDEX_CELL_CLASS} ${extra}`
      : `${TRANSACTION_DATE_CELL_CLASS} ${extra}`
  const vnCoinCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_COIN_CELL_CLASS} ${extra}`
      : `${TRANSACTION_CELL_CLASS} ${extra}`
  const vnAmountCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_VN_CELL_CLASS} ${extra}`
      : `${VN_DESKTOP_VN_CELL_CLASS} ${extra}`
  const vnNumCell = (extra = '') =>
    mobileRowIndex
      ? `${VN_MOBILE_NUM_CELL_CLASS} ${extra}`
      : `${TRANSACTION_CELL_CLASS} text-right tabular-nums ${extra}`
  const totalVn = transactions.reduce((sum, tx) => sum + tx.vnAmount, 0)
  const usdtRowCount = transactions.filter((tx) => tx.payCurrency === 'usdt').length
  const twdRowCount = transactions.filter((tx) => tx.payCurrency === 'twd').length
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

  useEffect(() => {
    if (!highlightedId) return
    const row = document.querySelector(`[data-vn-row="${highlightedId}"]`)
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlightedId])

  const vnColGroup = (
    <VnTradeTableColGroup isBuy={isBuy} mobileRowIndex={mobileRowIndex} />
  )

  const vnMobileHeaderNum = (extra = '') =>
    `${VN_MOBILE_NUM_CELL_CLASS} font-medium text-slate-500 text-center ${extra}`

  const vnTableHeader = (
    <thead>
      <tr
        className={`border-b border-slate-200 text-slate-500 ${
          mobileRowIndex ? 'text-[12px]' : 'text-[13px]'
        }`}
        style={{ height: `${TRANSACTION_HEAD_REM}rem` }}
      >
        <th className={vnIndexCell('font-medium text-slate-500')}>{'\u00a0'}</th>
        <th
          className={vnAmountCell(
            mobileRowIndex
              ? 'whitespace-nowrap font-medium text-center'
              : 'whitespace-nowrap font-medium text-right',
          )}
        >
          VN
        </th>
        {!mobileRowIndex && (
          <th className={vnCoinCell('whitespace-nowrap text-center font-medium')}>幣</th>
        )}
        <th
          className={
            mobileRowIndex
              ? vnMobileHeaderNum('whitespace-nowrap')
              : vnNumCell('whitespace-nowrap font-medium')
          }
        >
          {mobileRowIndex ? 'Pay' : '金額'}
        </th>
        <th
          className={
            mobileRowIndex
              ? vnMobileHeaderNum('whitespace-nowrap')
              : vnNumCell('whitespace-nowrap font-medium')
          }
        >
          {rateHeader}
        </th>
        {!isBuy && (
          <th
            className={
              mobileRowIndex
                ? vnMobileHeaderNum('whitespace-nowrap')
                : vnNumCell('whitespace-nowrap font-medium')
            }
          >
            PF
          </th>
        )}
        <th
          className={
            mobileRowIndex
              ? `${VN_MOBILE_ACTION_CELL_CLASS} font-medium text-slate-500`
              : `${TRANSACTION_CELL_CLASS} whitespace-nowrap text-right font-medium`
          }
        >
          {mobileRowIndex ? '' : '操作'}
        </th>
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
        <td
          className={`${
            mobileRowIndex ? VN_MOBILE_INDEX_CELL_CLASS : TRANSACTION_CELL_CLASS
          } whitespace-nowrap font-semibold text-slate-800`}
        >
          {mobileRowIndex ? null : (
            <span>
              總結
              <span className="font-normal text-slate-500"> {transactions.length}筆</span>
            </span>
          )}
        </td>
        <td className={vnAmountCell('font-medium text-amber-700')}>
          <div
            className={`flex min-w-0 items-center ${
              mobileRowIndex ? 'justify-end gap-0.5' : 'justify-end'
            }`}
          >
            <span className="block min-w-0 whitespace-nowrap" title={formatNumber(totalVn)}>
              {formatVnTableCompact(totalVn)}
            </span>
            {mobileRowIndex && isBuy && transactions.length > 0 && (
              <div className="flex shrink-0 flex-col items-center gap-0.5">
                {usdtRowCount > 0 && (
                  <span className="inline-flex items-center gap-px">
                    <VnPayCurrencyBadge currency="usdt" size="xs" />
                    <span className="text-[9px] font-medium tabular-nums text-sky-700">
                      {usdtRowCount}
                    </span>
                  </span>
                )}
                {twdRowCount > 0 && (
                  <span className="inline-flex items-center gap-px">
                    <VnPayCurrencyBadge currency="twd" size="xs" />
                    <span className="text-[9px] font-medium tabular-nums text-emerald-700">
                      {twdRowCount}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </td>
        {!mobileRowIndex && (
          <td className={vnCoinCell()}>
            {transactions.length > 0 ? (
              <div className="flex items-center justify-center gap-1">
                {usdtRowCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <VnPayCurrencyBadge currency="usdt" size="xs" />
                    <span className="text-[11px] font-medium tabular-nums text-sky-700">
                      {usdtRowCount}
                    </span>
                  </span>
                )}
                {twdRowCount > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <VnPayCurrencyBadge currency="twd" size="xs" />
                    <span className="text-[11px] font-medium tabular-nums text-emerald-700">
                      {twdRowCount}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </td>
        )}
        <td className={vnNumCell('text-slate-400')}>—</td>
        <td className={vnNumCell('text-slate-400')}>—</td>
        {!isBuy && (
          <td
            className={vnNumCell(
              `font-semibold ${
                hasProfitData ? profitColorClass(totalProfit) : 'text-slate-400'
              }`,
            )}
          >
            {hasProfitData ? formatProfit(totalProfit) : '—'}
          </td>
        )}
        <td className={mobileRowIndex ? VN_MOBILE_ACTION_CELL_CLASS : TRANSACTION_CELL_CLASS} />
      </tr>
    </tfoot>
  )

  const vnTransactionRows = transactions.map((tx) => {
    const profitInfo = sellProfitById?.get(tx.id)
    return (
      <tr
        key={tx.id}
        data-vn-row={tx.id}
        style={TRANSACTION_DATA_ROW_STYLE}
        className={`group border-b border-slate-100 transition-colors hover:bg-slate-100/70 ${vnPayCurrencyRowAccent(tx.payCurrency)} ${transactionDataRowClass(tx.id, editingId, highlightedId)}`}
      >
        <td className={vnIndexCell('text-slate-600')}>
          <span className="inline-flex items-center gap-0.5">
            {formatTransactionTableDate(tx.timestamp)}
          </span>
        </td>
        <td className={vnAmountCell('text-amber-700')}>
          <span className="block min-w-0 whitespace-nowrap" title={formatNumber(tx.vnAmount)}>
            {formatVnTableCompact(tx.vnAmount)}
          </span>
        </td>
        {!mobileRowIndex && (
          <td className={vnCoinCell()}>
            <VnPayCurrencyBadge currency={tx.payCurrency} size="xs" />
          </td>
        )}
        <td
          className={vnNumCell(
            tx.payCurrency === 'usdt'
              ? 'font-medium text-sky-700'
              : 'font-medium text-emerald-700',
          )}
        >
          {mobileRowIndex ? (
            <div className="flex min-w-0 items-center justify-end gap-0.5">
              <span
                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                title={
                  tx.payCurrency === 'usdt'
                    ? formatNumber(tx.usdtAmount)
                    : formatTwd(tx.twdAmount)
                }
              >
                {tx.payCurrency === 'usdt'
                  ? formatNumber(tx.usdtAmount)
                  : formatTwdTableCompact(tx.twdAmount)}
              </span>
              <VnPayCurrencyBadge currency={tx.payCurrency} size="xs" />
            </div>
          ) : (
            <span
              className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
              title={
                tx.payCurrency === 'usdt'
                  ? formatNumber(tx.usdtAmount)
                  : formatTwd(tx.twdAmount)
              }
            >
              {tx.payCurrency === 'usdt'
                ? formatNumber(tx.usdtAmount)
                : formatTwdTableCompact(tx.twdAmount)}
            </span>
          )}
        </td>
        <td className={vnNumCell()}>
          {mobileRowIndex ? (
            vnMobileRateCell(tx.rate, tx.payCurrency, false)
          ) : (
            <>
              <span className="tabular-nums text-slate-600">
                {formatVnTradeRateDisplay(tx.rate)}
              </span>
              <span
                className={`ml-0.5 text-[9px] font-semibold ${
                  tx.payCurrency === 'usdt' ? 'text-sky-600' : 'text-emerald-600'
                }`}
              >
                {vnRateUnitSuffix(tx.payCurrency)}
              </span>
            </>
          )}
        </td>
        {!isBuy && (
          <td
            className={vnNumCell(
              `text-[11px] font-semibold ${
                profitInfo !== undefined
                  ? profitColorClass(profitInfo.profit)
                  : 'text-slate-400'
              }`,
            )}
          >
            {profitInfo?.unitCost !== null && profitInfo !== undefined
              ? formatProfit(profitInfo.profit)
              : '—'}
          </td>
        )}
        <td className={mobileRowIndex ? VN_MOBILE_ACTION_CELL_CLASS : TRANSACTION_ACTION_CELL_CLASS}>
          <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <RowActionButtons
              compact={mobileRowIndex}
              onEdit={() => onEdit(tx)}
              onDelete={() => onDelete(tx.id)}
            />
          </div>
        </td>
      </tr>
    )
  })

  const tableWrapClass = mobileRowIndex ? 'max-w-full overflow-hidden' : 'overflow-x-auto'
  const bodyScrollClass = mobileRowIndex
    ? 'transaction-table-body-scroll--overflow overflow-x-hidden overflow-y-auto'
    : 'transaction-table-body-scroll--overflow overflow-x-auto overflow-y-auto'
  const scrollOuterClass = mobileRowIndex
    ? 'flex shrink-0 flex-col max-w-full overflow-hidden'
    : 'flex shrink-0 flex-col overflow-x-auto'

  if (!hasOverflow) {
    return (
      <div className={tableWrapClass}>
        <table className={tableClass}>
          {vnColGroup}
          {vnTableHeader}
          <tbody>
            {transactions.length === 0 ? (
              <tr style={TRANSACTION_DATA_ROW_STYLE}>
                <td
                  colSpan={columnCount}
                  className={`${TRANSACTION_CELL_CLASS} py-8 text-center`}
                >
                  <p className="text-sm text-slate-400">{EMPTY_DATA_LABEL}</p>
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
    <div className={scrollOuterClass}>
      <div className={mobileRowIndex ? 'max-w-full shrink-0' : undefined}>
        <table className={tableClass}>
          {vnColGroup}
          {vnTableHeader}
        </table>
      </div>
      <div className="relative shrink-0 max-w-full overflow-hidden">
        <div
          ref={scrollRef}
          className={bodyScrollClass}
          style={{ maxHeight: maxBodyHeight }}
          onScroll={(event) => onBodyScroll?.(event.currentTarget.scrollTop)}
        >
          <table className={tableClass}>
            {vnColGroup}
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
      <div className={mobileRowIndex ? 'max-w-full shrink-0' : undefined}>
        <table className={tableClass}>
          {vnColGroup}
          {vnTableFooter}
        </table>
      </div>
    </div>
  )
}

export function ExpenseForm({
  expenseType,
  amount,
  note,
  error,
  isEditing,
  disabled,
  onExpenseTypeChange,
  onAmountChange,
  onNoteChange,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="mb-1 flex flex-wrap items-center gap-0.5">
        {EXPENSE_TYPE_OPTIONS.map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={disabled}
            onClick={() => onExpenseTypeChange(item.value)}
            className={`rounded-full px-2 py-px text-[10px] font-medium transition disabled:opacity-50 ${
              expenseType === item.value
                ? 'bg-orange-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <label className="flex min-w-0 flex-[1.1] items-center gap-1 text-[11px] text-slate-600">
          <span className="shrink-0">AMOUNT</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            disabled={disabled}
            onChange={(e) => onAmountChange(e.target.value)}
            className={`min-w-0 flex-1 ${EXPENSE_INPUT_CLASS}`}
            placeholder="0"
          />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-slate-600">
          <span className="shrink-0">NOTE</span>
          <input
            type="text"
            value={note}
            disabled={disabled}
            onChange={(e) => onNoteChange(e.target.value)}
            className={`min-w-0 flex-1 ${EXPENSE_INPUT_CLASS}`}
          />
        </label>
        <div className="flex shrink-0 gap-1">
          <button
            type="submit"
            disabled={disabled}
            className="rounded bg-orange-600 px-2.5 py-0.5 text-xs font-medium text-white transition hover:bg-orange-700 focus:ring-2 focus:ring-orange-600/30 disabled:opacity-50"
          >
            {isEditing ? '儲存' : 'Add'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-0.5 text-[10px] leading-tight text-rose-600">{error}</p>}
    </form>
  )
}

export function ExpensePageSummary({ transactions }: ExpensePageSummaryProps) {
  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amountTwd, 0)

  return (
    <div className="mt-2 shrink-0 space-y-1.5 border-t border-orange-100 pt-2">
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
      </div>
    </div>
  )
}

export function NotebookPanel({
  entries,
  draft,
  editingId,
  error,
  disabled = false,
  onDraftChange,
  onSubmit,
  onCancelEdit,
  onEdit,
  onDelete,
}: NotebookPanelProps) {
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [entries],
  )

  return (
    <div className="flex flex-col">
      <div className="mb-0.5 hidden shrink-0 lg:block">
        <h1 className="text-sm font-semibold text-slate-800">筆記本</h1>
        <p className="mt-0.5 text-[10px] leading-tight text-slate-500">
          自由記錄備忘，例如資本投入、合作備註等
        </p>
      </div>
      <section className="mx-auto w-full max-w-2xl shrink-0 space-y-1.5">
        <div
          className={`rounded-lg border border-slate-200 border-l-4 border-l-sky-500 bg-white p-2 shadow-sm ${
            editingId ? 'ring-1 ring-amber-100' : ''
          }`}
        >
          <form onSubmit={onSubmit}>
            <textarea
              value={draft}
              disabled={disabled}
              onChange={(e) => onDraftChange(e.target.value)}
              rows={3}
              aria-label={editingId ? '編輯筆記' : '新增筆記'}
              className="w-full resize-y rounded-md border border-slate-200 px-2 py-1.5 text-base leading-relaxed text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-50 sm:text-sm"
            />
            {error && (
              <p className="mt-1 text-[11px] text-rose-600" role="alert">
                {error}
              </p>
            )}
            <div className="mt-1.5 flex justify-end gap-1">
              {editingId && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="rounded px-2.5 py-0.5 text-xs text-slate-600 transition hover:bg-slate-100"
                >
                  取消
                </button>
              )}
              <button
                type="submit"
                disabled={disabled}
                className="rounded bg-sky-600 px-2.5 py-0.5 text-xs font-medium text-white transition hover:bg-sky-700 focus:ring-2 focus:ring-sky-600/30 disabled:opacity-50"
              >
                {editingId ? '儲存' : 'Add'}
              </button>
            </div>
          </form>
        </div>
        <div className="flex flex-col rounded-lg border border-slate-200 border-l-4 border-l-sky-500 bg-white p-1.5 shadow-sm">
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{EMPTY_DATA_LABEL}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sorted.map((entry, index) => (
                <li
                  key={entry.id}
                  className={`group flex gap-2 py-2 ${
                    editingId === entry.id ? 'bg-amber-50/60' : ''
                  }`}
                >
                  <span className="w-5 shrink-0 pt-0.5 text-center text-[10px] tabular-nums text-slate-400">
                    {sorted.length - index}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                      {entry.text}
                    </p>
                  </div>
                  <div className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <RowActionButtons
                      compact
                      onEdit={() => onEdit(entry)}
                      onDelete={() => onDelete(entry.id)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

export function ExpenseTable({
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
      <td className={`w-[3.25rem] whitespace-nowrap ${TRANSACTION_CELL_CLASS} tabular-nums text-[11px] text-slate-600`}>
        {formatSettlementDate(tx.timestamp)}
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
        <th className={`w-[3.25rem] ${TRANSACTION_CELL_CLASS} font-medium`}>DATE</th>
        <th className={`w-14 ${TRANSACTION_CELL_CLASS} font-medium`}>CATEGORY</th>
        <th className={`w-[4.5rem] ${TRANSACTION_CELL_CLASS} text-right font-medium`}>AMOUNT</th>
        <th className={`${TRANSACTION_CELL_CLASS} font-medium`}>NOTE</th>
        <th className={`w-12 ${TRANSACTION_CELL_CLASS} text-right font-medium`} />
      </tr>
    </thead>
  )

  const emptyBody = (
    <tr style={TRANSACTION_DATA_ROW_STYLE}>
      <td
        colSpan={5}
        className={`${TRANSACTION_CELL_CLASS} py-8 text-center`}
      >
        <p className="text-sm text-slate-400">{EMPTY_DATA_LABEL}</p>
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

const SETTLEMENT_METRIC_CLASS =
  'min-w-0 rounded-md border border-slate-100 bg-white px-2 py-1.5'

export function SettlementRecordBody({
  twdBalance,
  usdtBalance,
  vnBalance,
  twdAvg,
  vnPoolRate,
  vnUsdtPoolRate,
  displayAssets,
  dayUsdtProfit,
  dayVnProfit,
  dayTotalProfit,
}: SettlementRecordBodyProps) {
  const showProfit =
    dayUsdtProfit !== undefined || dayVnProfit !== undefined || dayTotalProfit !== 0

  return (
    <div
      className={`grid grid-cols-2 items-stretch gap-1.5 ${
        showProfit ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
      }`}
    >
      <div className={SETTLEMENT_METRIC_CLASS}>
        <p className="text-[10px] font-medium text-slate-500">T</p>
        <p
          className="mt-0.5 text-sm font-bold tabular-nums text-emerald-600"
          title={formatTwd(twdBalance)}
        >
          {formatTwdTableCompact(twdBalance)}
        </p>
      </div>
      <div className={SETTLEMENT_METRIC_CLASS}>
        <p className="text-[10px] font-medium text-slate-500">P</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-0">
          <p className="text-sm font-bold tabular-nums text-sky-600">
            {formatNumber(usdtBalance)}
          </p>
          {usdtBalance > 0 && twdAvg !== null && (
            <span className="text-[10px] tabular-nums text-slate-400">
              @{formatUsdtCostRateDisplay(twdAvg)}
            </span>
          )}
        </div>
        {usdtBalance > 0 && displayAssets.usdtInTwd !== null && (
          <p
            className="mt-0.5 text-[10px] tabular-nums text-sky-600/80"
            title={formatTwd(displayAssets.usdtInTwd)}
          >
            估值 {formatTwdTableCompact(displayAssets.usdtInTwd)}
          </p>
        )}
      </div>
      <div className={SETTLEMENT_METRIC_CLASS}>
        <p className="text-[10px] font-medium text-slate-500">VN</p>
        <p
          className="mt-0.5 text-sm font-bold tabular-nums text-amber-600"
          title={formatNumber(vnBalance)}
        >
          {formatVnTableCompact(vnBalance)}
        </p>
        {vnBalance > 0 && (vnPoolRate !== null || vnUsdtPoolRate !== null) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] tabular-nums text-slate-400">
            {vnPoolRate !== null && (
              <span>{formatVnNtdCostRateCompact(vnPoolRate)}</span>
            )}
            {vnUsdtPoolRate !== null && (
              <span>{formatVnUsdtCostRateCompact(vnUsdtPoolRate)}</span>
            )}
          </div>
        )}
        {vnBalance > 0 && displayAssets.vnInTwd !== null && (
          <p
            className="mt-0.5 text-[10px] tabular-nums text-amber-600/80"
            title={formatTwd(displayAssets.vnInTwd)}
          >
            估值 {formatTwdTableCompact(displayAssets.vnInTwd)}
          </p>
        )}
      </div>
      {showProfit && (
        <div className={`${SETTLEMENT_METRIC_CLASS} bg-slate-50/80`}>
          <p className="text-[10px] font-medium text-slate-500">當日PF</p>
          <div className="mt-0.5">
            <SettlementDayProfit
              compact
              usdtProfit={dayUsdtProfit}
              vnProfit={dayVnProfit}
              totalProfit={dayTotalProfit}
            />
          </div>
        </div>
      )}
      <div className="col-span-2 min-w-0 lg:col-span-1 [&>div]:h-full">
        <TotalAssetsColumn assets={displayAssets} titleLabel="TOTAL" showCurrencySuffix={false} />
      </div>
    </div>
  )
}

export function CollapsibleSection({
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

export function SettlementsPanel({ settlements }: SettlementsPanelProps) {
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
        {EMPTY_DATA_LABEL}
      </p>
    )
  }

  const renderSettlementCard = ({
    id,
    title,
    transactionCount,
    totalProfit,
    body,
  }: {
    id: string
    title: string
    transactionCount: number
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
          <p className="text-xs font-medium text-indigo-900">
            累計總PF
            <span className="ml-1.5 text-[10px] font-normal text-indigo-700/70">
              共 {settlements.length} 次
            </span>
          </p>
          <p
            className={`text-base font-bold tabular-nums ${
              cumulativeTotalProfit > 0
                ? 'text-emerald-600'
                : cumulativeTotalProfit < 0
                  ? 'text-rose-600'
                  : 'text-slate-500'
            }`}
          >
            {formatProfit(cumulativeTotalProfit)}
          </p>
        </div>
        {showCumulativeSplit && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[10px] tabular-nums">
            <span className={profitColorClass(cumulativeUsdtProfit)}>
              P 累計 {formatProfit(cumulativeUsdtProfit)}
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

export function ExpenseSettlementsPanel({ settlements }: ExpenseSettlementsPanelProps) {
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

export function MonthCloseButton({
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

export function MonthlyCloseModal({
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
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 sm:text-sm"
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
          <p className="tabular-nums text-slate-600">
            庫存計價總資產 {formatTwd(preview.closingBookTotalAssets)} TWD
            {preview.expenseTotal > 0 && (
              <>
                {' · '}
                扣開銷後 {formatTwd(preview.closingTotalAssets)} TWD
              </>
            )}
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

export function OpeningBalanceModal({
  open,
  currentBalances,
  form,
  error,
  onFieldChange,
  onCancel,
  onConfirm,
}: OpeningBalanceModalProps) {
  if (!open) return null

  const fieldClass =
    'mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:text-sm'
  const labelClass = 'text-[10px] font-medium text-slate-500'

  const twdAdjust = parseTwdAdjustInput(form.twdAdjust)
  const usdtAdjust = parseUsdtAdjustInput(form.usdtAdjust)
  const vnAdjust = parseVnAdjustInput(form.vnAdjust)
  const hasAdjustInput =
    form.twdAdjust.trim() !== '' ||
    form.usdtAdjust.trim() !== '' ||
    form.vnAdjust.trim() !== ''
  const previewBalances =
    twdAdjust !== 'invalid' && usdtAdjust !== 'invalid' && vnAdjust !== 'invalid'
      ? {
          twd: currentBalances.twd + twdAdjust,
          usdt: currentBalances.usdt + usdtAdjust,
          vn: currentBalances.vn + vnAdjust,
        }
      : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-balance-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 id="opening-balance-title" className="sr-only">
          期初餘額調整
        </h2>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-[13px] tabular-nums text-slate-800 sm:text-sm">
            <div>
              <span className={labelClass}>T</span>
              <p className="font-medium">{formatTwdCompactInput(currentBalances.twd)}</p>
            </div>
            <div>
              <span className={labelClass}>P</span>
              <p className="font-medium">{formatNumber(currentBalances.usdt)}</p>
            </div>
            <div>
              <span className={labelClass}>VN</span>
              <p className="font-medium">{formatVnCompactInput(currentBalances.vn)}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className={labelClass}>
            T +/-
            <input
              type="text"
              inputMode="decimal"
              placeholder="+20"
              value={form.twdAdjust}
              onChange={(event) => onFieldChange('twdAdjust', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            P +/-
            <input
              type="text"
              inputMode="decimal"
              placeholder="+1000"
              value={form.usdtAdjust}
              onChange={(event) => onFieldChange('usdtAdjust', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            VN +/-
            <input
              type="text"
              inputMode="decimal"
              placeholder="+1.2"
              value={form.vnAdjust}
              onChange={(event) => onFieldChange('vnAdjust', event.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        {hasAdjustInput && previewBalances && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2">
            <p className="text-[10px] font-medium text-indigo-700">調整後期初</p>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[13px] tabular-nums text-indigo-900 sm:text-sm">
              <div>
                <span className="text-[10px] font-medium text-indigo-600">T</span>
                <p className="font-medium">{formatTwdCompactInput(previewBalances.twd)}</p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-indigo-600">P</span>
                <p className="font-medium">{formatNumber(previewBalances.usdt)}</p>
              </div>
              <div>
                <span className="text-[10px] font-medium text-indigo-600">VN</span>
                <p className="font-medium">{formatVnCompactInput(previewBalances.vn)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={labelClass}>
            P 成本 (T)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.usdtCostTwd}
              onChange={(event) => onFieldChange('usdtCostTwd', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            P 成本 (VN)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.usdtCostVn}
              onChange={(event) => onFieldChange('usdtCostVn', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            VN 池成本 (VN/T)
            <input
              type="text"
              inputMode="decimal"
              placeholder="選填"
              value={form.vnTwdRate}
              onChange={(event) => onFieldChange('vnTwdRate', event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            VN 池成本 (VN/P)
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

function MonthlyCloseExpandedBody({ monthlyClose }: { monthlyClose: MonthlyClose }) {
  const resolved = useMemo(
    () => normalizeMonthlyCloseRecord(monthlyClose),
    [monthlyClose],
  )

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
        <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] tabular-nums text-slate-700">
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
        <p className="mt-2 text-[10px] tabular-nums text-slate-600">
          月底實際資產 {formatTwd(resolved.closingTotalAssets)} TWD
        </p>
        {resolved.expenseTotal > 0 &&
          resolved.closingBookTotalAssets !== undefined &&
          resolved.closingBookTotalAssets !== resolved.closingTotalAssets && (
            <p className="mt-0.5 text-[9px] tabular-nums text-slate-400">
              庫存計價帳面 {formatTwd(resolved.closingBookTotalAssets)} TWD（未扣開銷）
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

export function MonthlyClosesList({
  closes,
  expandedId,
  onExpandedChange,
  onStartClose,
  onOpeningBalance,
  onResetAll,
}: MonthlyClosesListProps) {
  const toggleExpanded = (id: string) => {
    onExpandedChange(expandedId === id ? null : id)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpeningBalance}
            className="rounded border border-slate-200 bg-white px-1.5 py-px text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 sm:text-xs"
          >
            期初
          </button>
          <button
            type="button"
            onClick={onResetAll}
            className="px-0.5 text-[10px] font-medium text-red-500 transition hover:text-red-700 sm:text-xs"
          >
            清空
          </button>
          <MonthCloseButton onClick={onStartClose} />
        </div>
      </div>

      {closes.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white py-8 text-center text-xs text-slate-400 shadow-sm">
          {EMPTY_DATA_LABEL}
        </p>
      ) : (
        closes.map((item) => {
          const isExpanded = expandedId === item.id
          return (
            <article
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleExpanded(item.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-violet-900">
                    {item.periodLabel}
                    <span className="ml-1.5 text-[10px] font-normal tabular-nums text-violet-800/80">
                      實際封存 {formatArchiveDateRange(item.actualStartDate, item.actualEndDate)}
                      {' · '}
                      {item.closedAt.toLocaleString('zh-TW', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}{' '}
                      月結
                    </span>
                  </p>
                  <p
                    className={`overflow-hidden text-[10px] text-slate-400 transition-all duration-300 ease-in-out motion-reduce:transition-none ${
                      isExpanded ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
                    }`}
                  >
                    交易 {item.tradeSettlements.length} 筆 · 開銷 {item.expenseSettlements.length}{' '}
                    筆
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p
                    className={`text-sm font-bold tabular-nums ${profitColorClass(item.netProfit)}`}
                  >
                    {formatProfit(item.netProfit)}
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
                  <MonthlyCloseExpandedBody monthlyClose={item} />
                </div>
              </CollapsibleSection>
            </article>
          )
        })
      )}
    </div>
  )
}

export function AppNav({
  activeTab,
  settlementsCount,
  onSelect,
  layout,
  onNavigate,
}: AppNavProps) {
  const isDrawer = layout === 'drawer'

  const navItems: {
    tab: PageTab
    label: string
    icon: (active: boolean) => ReactNode
  }[] = [
    {
      tab: 'cabins',
      label: 'POS',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      ),
    },
    {
      tab: 'daily',
      label: 'TRANS',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
      ),
    },
    {
      tab: 'settlements',
      label: 'SET.',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
    {
      tab: 'expenses',
      label: 'EXP',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a4.5 4.5 0 0 0 4.5 4.5h10.5a4.5 4.5 0 0 0 4.5-4.5v-9a4.5 4.5 0 0 0-4.5-4.5H6.75a4.5 4.5 0 0 0-4.5 4.5v9Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9h7.5M8.25 12.75h4.5" />
        </svg>
      ),
    },
    {
      tab: 'notes',
      label: 'NOTE',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 18H15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 15 4.5h-4.5A2.25 2.25 0 0 0 8.25 6.75v11.25A2.25 2.25 0 0 0 10.5 20.25Z" />
        </svg>
      ),
    },
    {
      tab: 'monthly',
      label: 'MONTH',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      ),
    },
  ]

  const drawerButtonClass = (tab: PageTab) => {
    const active = activeTab === tab
    return `group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
      active
        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
        : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
    }`
  }

  const sidebarButtonClass = (tab: PageTab) =>
    `w-full rounded-md px-1.5 py-2 text-center text-xs font-medium leading-snug transition ${
      activeTab === tab
        ? 'bg-slate-900 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100'
    }`

  const selectTab = (tab: PageTab) => {
    onSelect(tab)
    onNavigate?.()
  }

  if (isDrawer) {
    return (
      <nav className="flex flex-1 flex-col gap-1.5 px-3 py-4">
        {navItems.map(({ tab, label, icon }) => {
          const active = activeTab === tab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => selectTab(tab)}
              className={drawerButtonClass(tab)}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700'
                }`}
              >
                {icon(active)}
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              {tab === 'settlements' && settlementsCount > 0 && (
                <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-indigo-700">
                  {settlementsCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="space-y-1">
      {navItems.map(({ tab, label }) => (
        <button key={tab} type="button" onClick={() => selectTab(tab)} className={sidebarButtonClass(tab)}>
          {label}
          {tab === 'settlements' && settlementsCount > 0 && (
            <span className="block text-[10px] opacity-70">({settlementsCount})</span>
          )}
        </button>
      ))}
    </nav>
  )
}

export function MobileNavCloseIcon() {
  return (
    <svg
      className="h-4 w-4"
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

export function MobileNavMenuIcon() {
  return (
    <svg
      className="h-4 w-4"
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
