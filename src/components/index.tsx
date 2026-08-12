import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import type {
  AppNavProps,
  CabinAllocModalProps,
  CabinRebalanceModalProps,
  OpeningUsdtCabinPickModalProps,
  ConfirmModalProps,
  DailyBalanceStripProps,
  DailyTradeSettleBarProps,
  CumulativeExpensesPanelProps,
  CumulativeExpenseEntry,
  ExpenseFormProps,
  ExpensePageSummaryProps,
  ExpenseTableProps,
  MonthlyClosesListProps,
  MonthlyArchivePanelProps,
  NotebookPanelProps,
  OpeningBalanceModalProps,
  SettlementsPanelProps,
  SettlementNoteSearchPanelProps,
  ExpenseSettlementsPanelProps,
  SettlementRecordBodyProps,
  TradeSettleConfirmSummary,
  MonthlyCloseConfirmSummary,
  TradeFormProps,
  TransactionTableProps,
  UndoBannerProps,
  VnTradeFormProps,
  VnTradeTableProps,
  DailyWorkTab,
  DailyMobileTradePane,
  PageTab,
  TotalAssetsTwd,
  UsdtTransaction,
  VnTradeTransaction,
  VnPayCurrency,
  UsdtCabin,
  TwdCabinNoteKey,
} from '../types'
import {
  EMPTY_TWD_CABIN_NOTES,
  TWD_CABIN_NOTE_KEYS,
  TWD_CABIN_NOTE_LABELS,
  TWD_CABIN_NOTE_ROW1_KEYS,
  TWD_CABIN_NOTE_ROW2_KEYS,
  TWD_CABIN_NOTE_ROW3_KEYS,
  TWD_CABIN_NOTE_SUM_KEYS,
} from '../types'
import {
  EXPENSE_INPUT_CLASS,
  EMPTY_DATA_LABEL,
  TRADE_FORM_META_CELL_CLASS,
  TRADE_FORM_ACTIONS_CLASS,
  TRADE_FORM_SUBMIT_CLASS,
  TRADE_FORM_GRID_CLASS,
  TRADE_INPUT_CLASS,
  TRADE_NOTE_INPUT_CLASS,
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
  assetCode,
  formatNumber,
  formatArchiveDateRange,
  formatProfit,
  formatProfitFromParts,
  sumRoundedProfitParts,
  formatUsdtTradeRateDisplay,
  formatVnTradeRateDisplay,
  formatUsdtCostRateDisplay,
  roundTwdTableCompact,
  formatSettlementDate,
  formatSettlementDateTime,
  formatSettlementDayLabel,
  formatTableDateTime,
  formatTradeMetaDateDisplay,
  formatTradeListDate,
  compareTradeListOrder,
  formatTwd,
  formatExpenseTwdInput,
  formatTwdCompactInput,
  formatTwdTableCompact,
  formatVnCompactInput,
  formatVnTableCompact,
  parseTwdAdjustInput,
  parseTwdCabinNoteCompactInput,
  parseExpenseTwdInput,
  parseUsdtAdjustInput,
  parseVnAdjustInput,
  formatVnNtdCostRateCompact,
  formatVnUsdtCostRateCompact,
  coerceDisplayZeroBalance,
  formatTwdAdjustToZero,
  dateInputValueFromDate,
  defaultTradeDateInputValue,
  isValidDateInputValue,
  timestampFromDateInput,
  profitColorClass,
} from '../utils/format'
import { resolveUsdtTradeFields, resolveVnTradeFields } from '../utils/form'
import {
  calculateAverageRate,
  calculateBuyDayAverageRate,
  isUsdtTransaction,
  normalizeMonthlyCloseRecord,
  searchSettlementTradesByNote,
  settlementHasSplitProfit,
  settlementDisplaySplitProfits,
  summarizeSettlementTrades,
  totalAssetsFromSettlement,
  transferUsdtBetweenCabins,
  vnTradeDisplayRate,
  vnTradePayAmount,
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
  const [note, setNote] = useState('')
  const [businessDate, setBusinessDate] = useState('')
  const [noteForDialog, setNoteForDialog] = useState(dialog)
  if (dialog !== noteForDialog) {
    setNoteForDialog(dialog)
    setNote('')
    setBusinessDate(dialog?.tradeSettleSummary?.defaultBusinessDate ?? '')
  }

  if (!dialog) return null

  const isTradeSettle = Boolean(dialog.tradeSettleSummary)
  const isMonthlyClose = Boolean(dialog.monthlyCloseSummary)
  const isCardConfirm = isTradeSettle || isMonthlyClose
  /** 無標題、僅短內容：刪除確認等，用小卡 */
  const isCompactConfirm =
    !isCardConfirm &&
    !dialog.noteInput &&
    (!dialog.title.trim() || dialog.lines.length === 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        className={`w-full rounded-lg bg-white shadow-lg ${
          isCardConfirm
            ? 'max-w-[16.5rem] p-3.5'
            : isCompactConfirm
              ? 'max-w-[13.5rem] px-3 py-2.5'
              : 'max-w-sm p-4'
        }`}
      >
        <h2
          id="confirm-dialog-title"
          className={
            isCardConfirm || isCompactConfirm || !dialog.title
              ? 'sr-only'
              : 'text-sm font-semibold text-slate-900'
          }
        >
          {dialog.title || dialog.confirmLabel}
        </h2>
        {dialog.tradeSettleSummary ? (
          <TradeSettleConfirmBody
            summary={dialog.tradeSettleSummary}
            businessDate={businessDate}
            onBusinessDateChange={setBusinessDate}
          />
        ) : dialog.monthlyCloseSummary ? (
          <MonthlyCloseConfirmBody summary={dialog.monthlyCloseSummary} />
        ) : dialog.lines.length > 0 ? (
          <div
            className={`${dialog.title ? 'mt-2' : 'mt-0'} ${
              isCompactConfirm ? 'space-y-0.5 text-[13px]' : 'space-y-1 text-sm'
            } text-slate-700`}
          >
            {dialog.lines.map((line, i) =>
              line === '' ? (
                <div key={i} className="h-1" />
              ) : (
                <p
                  key={i}
                  className={
                    isCompactConfirm && i === 0
                      ? 'font-semibold tabular-nums text-slate-900'
                      : isCompactConfirm
                        ? 'truncate text-[12px] text-slate-500'
                        : undefined
                  }
                >
                  {line}
                </p>
              ),
            )}
          </div>
        ) : null}
        {dialog.noteInput && (
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="NOTE"
            aria-label="備註"
            autoFocus
            className="mt-3 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        )}
        <div
          className={`flex justify-end gap-1.5 ${
            isCardConfirm ? 'mt-2.5' : isCompactConfirm ? 'mt-2.5' : 'mt-4'
          }`}
        >
          {!dialog.alertOnly && (
            <button
              type="button"
              onClick={onCancel}
              className={`rounded-md border border-slate-300 bg-white font-medium text-slate-600 hover:bg-slate-50 ${
                isCardConfirm || isCompactConfirm
                  ? 'px-2 py-1 text-[11px]'
                  : 'px-3 py-1.5 text-sm'
              }`}
            >
              {dialog.cancelLabel ?? (isCardConfirm || isCompactConfirm ? 'C' : '取消')}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              dialog.onConfirm(
                dialog.tradeSettleSummary
                  ? businessDate
                  : dialog.noteInput
                    ? note.trim()
                    : undefined,
              )
            }
            className={`rounded-md font-medium text-white ${
              isCardConfirm || isCompactConfirm
                ? 'px-2.5 py-1 text-[11px]'
                : 'px-3 py-1.5 text-sm'
            } ${
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

function MonthlyCloseConfirmBody({ summary }: { summary: MonthlyCloseConfirmSummary }) {
  return (
    <div className="space-y-2">
      {summary.dateRangeLabel ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center">
          <p className="text-[11px] tabular-nums text-slate-600">{summary.dateRangeLabel}</p>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 px-2 py-1.5 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">SET</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
          {summary.tradeCount}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 px-2.5 py-2">
        <div className="space-y-0.5 text-xs tabular-nums">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-500">PF</span>
            <span className={`font-medium ${profitColorClass(summary.grossProfit)}`}>
              {formatProfit(summary.grossProfit)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-slate-500">EXP</span>
            <span className="font-medium text-rose-600">
              {formatTwdTableCompact(summary.expenseTotal)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-1.5">
            <span className="text-slate-500">nPF</span>
            <span className={`text-sm font-bold ${profitColorClass(summary.netProfit)}`}>
              {formatProfit(summary.netProfit)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TradeSettleConfirmBody({
  summary,
  businessDate,
  onBusinessDateChange,
}: {
  summary: TradeSettleConfirmSummary
  businessDate: string
  onBusinessDateChange: (value: string) => void
}) {
  const dateValue = isValidDateInputValue(businessDate)
    ? businessDate
    : summary.defaultBusinessDate
  const [year, month, day] = dateValue.split('-').map((part) => Number(part))
  const daysInMonth = new Date(year, month, 0).getDate()
  const dayOptions = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            #{summary.tradeCount}
          </span>
          <label className="flex min-w-0 items-center gap-1">
            <span className="sr-only">帳務日</span>
            <select
              value={day}
              onChange={(event) => {
                const nextDay = Number(event.target.value)
                const m = String(month).padStart(2, '0')
                const d = String(nextDay).padStart(2, '0')
                onBusinessDateChange(`${year}-${m}-${d}`)
              }}
              aria-label="帳務日"
              className="w-[3.25rem] rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-[11px] tabular-nums text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
            >
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={`grid gap-1.5 ${summary.showVn ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="rounded-lg border border-slate-200 px-2 py-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">P</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-slate-700">
            IN <span className="font-semibold text-slate-900">{summary.usdtBuy}</span>
            <span className="mx-1 text-slate-300">·</span>
            OUT <span className="font-semibold text-slate-900">{summary.usdtSell}</span>
          </p>
        </div>
        {summary.showVn && (
          <div className="rounded-lg border border-slate-200 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">VN</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-700">
              IN <span className="font-semibold text-slate-900">{summary.vnBuy}</span>
              <span className="mx-1 text-slate-300">·</span>
              OUT <span className="font-semibold text-slate-900">{summary.vnSell}</span>
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 px-2.5 py-2">
        {summary.hasSells ? (
          <div className="space-y-0.5 text-xs tabular-nums">
            {summary.dayUsdtProfit !== null && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500">P</span>
                <span className={`font-medium ${profitColorClass(summary.dayUsdtProfit)}`}>
                  {formatProfit(summary.dayUsdtProfit)}
                </span>
              </div>
            )}
            {summary.dayVnProfit !== null && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500">VN</span>
                <span className={`font-medium ${profitColorClass(summary.dayVnProfit)}`}>
                  {formatProfit(summary.dayVnProfit)}
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-end gap-2 border-t border-slate-100 pt-1.5">
              <span
                className={`text-sm font-bold ${profitColorClass(
                  sumRoundedProfitParts(summary.dayUsdtProfit, summary.dayVnProfit),
                )}`}
              >
                {formatProfitFromParts(summary.dayUsdtProfit, summary.dayVnProfit)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400">—</p>
        )}
      </div>

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
  /** 僅顯示 P/VN 拆分（不重複總計，總計改放卡片右上） */
  splitOnly = false,
}: {
  usdtProfit: number | undefined
  vnProfit: number | undefined
  totalProfit: number
  expenseTotal?: number
  netProfit?: number
  compact?: boolean
  splitOnly?: boolean
}) {
  const showSplit = usdtProfit !== undefined && vnProfit !== undefined
  const showNet = expenseTotal !== undefined && expenseTotal > 0
  const textClass = compact ? 'text-[11px] leading-tight' : 'text-xs leading-tight'
  const formatSigned = (value: number) =>
    formatProfit(value) === '0' ? '+0' : formatProfit(value)
  const displayTotal = showSplit ? sumRoundedProfitParts(usdtProfit, vnProfit) : totalProfit
  const displayTotalLabel = showSplit
    ? formatProfitFromParts(usdtProfit, vnProfit)
    : formatProfit(totalProfit)

  if (!showSplit && !showNet) {
    return (
      <p className={`${textClass} font-semibold tabular-nums ${profitColorClass(totalProfit)}`}>
        {formatProfit(totalProfit)}
      </p>
    )
  }

  if (compact) {
    const splitClass = splitOnly ? 'text-emerald-600' : null
    return (
      <span className={`${textClass} inline whitespace-nowrap font-semibold tabular-nums`}>
        {showSplit ? (
          <>
            <span className={splitClass ?? profitColorClass(usdtProfit!)}>
              P{formatSigned(usdtProfit!)}
            </span>
            <span className="text-slate-300">/</span>
            <span className={splitClass ?? profitColorClass(vnProfit!)}>
              VN{formatSigned(vnProfit!)}
            </span>
            {!splitOnly && (
              <span className={`ml-1.5 ${profitColorClass(displayTotal)}`}>
                {displayTotalLabel}
              </span>
            )}
          </>
        ) : (
          <span className={profitColorClass(totalProfit)}>{formatProfit(totalProfit)}</span>
        )}
        {showNet && (
          <>
            <span className="ml-1.5 text-rose-600">開銷 −{formatTwd(expenseTotal!)}</span>
            <span className={`ml-1.5 ${profitColorClass(netProfit ?? totalProfit - expenseTotal!)}`}>
              淨利 {formatProfit(netProfit ?? totalProfit - expenseTotal!)}
            </span>
          </>
        )}
      </span>
    )
  }

  return (
    <div className={`${textClass} tabular-nums`}>
      {showSplit ? (
        <>
          <p className={profitColorClass(usdtProfit!)}>P {formatProfit(usdtProfit!)}</p>
          <p className={profitColorClass(vnProfit!)}>VN {formatProfit(vnProfit!)}</p>
          <p className={`font-semibold ${profitColorClass(displayTotal)}`}>
            {displayTotalLabel}
          </p>
        </>
      ) : (
        <p className={`font-semibold ${profitColorClass(totalProfit)}`}>
          {formatProfit(totalProfit)}
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
  'rounded-md border border-slate-200 bg-white px-1 py-0.5 text-center leading-tight shadow-sm sm:rounded-lg sm:px-2 sm:py-1.5'
const BALANCE_LABEL_CLASS = 'shrink-0 text-[9px] font-medium leading-tight text-slate-500 sm:text-[10px]'
const BALANCE_VALUE_CLASS =
  'min-w-0 text-xs font-bold tabular-nums leading-tight text-slate-800 sm:text-sm'
const BALANCE_SUB_CLASS = 'text-[9px] tabular-nums leading-tight text-slate-400 sm:mt-0.5 sm:text-[10px]'

const TOTAL_ASSETS_DENSE_CARD_CLASS =
  'flex h-full min-h-0 flex-col items-center justify-center rounded-md border border-indigo-200 bg-indigo-50/70 px-1 py-0.5 text-center shadow-sm sm:rounded-lg sm:px-2 sm:py-1.5'

const TOTAL_ASSETS_CARD_CLASS =
  'rounded-lg border border-indigo-200 bg-indigo-50/50 px-2 py-1.5 text-center leading-tight shadow-sm'

/** 數字異動時由舊值滾動至新值 */
function useAnimatedNumber(target: number, durationMs = 800): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = displayRef.current
    const to = target
    if (Object.is(from, to)) return

    const start = performance.now()
    const integerOnly = Number.isInteger(from) && Number.isInteger(to)
    cancelAnimationFrame(rafRef.current)

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - progress) ** 3
      let next = from + (to - from) * eased
      if (integerOnly) next = Math.round(next)
      displayRef.current = next
      setDisplay(next)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        displayRef.current = to
        setDisplay(to)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return display
}

function AnimatedAmount({
  value,
  format = formatNumber,
  className,
  title,
  as: Tag = 'span',
}: {
  value: number
  format?: (n: number) => string
  className?: string
  title?: string
  as?: 'span' | 'p'
}) {
  const display = useAnimatedNumber(value)
  const prevRef = useRef(value)
  const [tone, setTone] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (Object.is(value, prevRef.current)) return
    setTone(value > prevRef.current ? 'up' : 'down')
    prevRef.current = value
    const timer = window.setTimeout(() => setTone(null), 850)
    return () => window.clearTimeout(timer)
  }, [value])

  const toneClass =
    tone === 'up'
      ? 'text-emerald-700 transition-colors duration-300'
      : tone === 'down'
        ? 'text-rose-700 transition-colors duration-300'
        : 'transition-colors duration-300'

  return (
    <Tag className={[className, toneClass].filter(Boolean).join(' ')} title={title}>
      {format(display)}
    </Tag>
  )
}

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
        <AnimatedAmount value={assets.total} format={formatTwdTableCompact} />
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



export function DailyBalanceStrip({
  balances,
  inventoryCost,
  usdtCabinBalances,
  twdCabinNotes,
  onTwdCabinNoteChange,
  totalAssets,
  vnTwdRate,
  vnUsdtRate,
}: DailyBalanceStripProps) {
  const [twdCabinModalOpen, setTwdCabinModalOpen] = useState(false)
  const usdtCabins = usdtCabinBalances ?? { a: 0, b: 0, c: 0 }
  const notes = twdCabinNotes ?? { ...EMPTY_TWD_CABIN_NOTES }
  /** O/B/T/F/W/H/J/C/#：萬位縮寫 → 台幣後加總（含備用 #） */
  const twdNoteSumActual = TWD_CABIN_NOTE_SUM_KEYS.reduce((sum, key) => {
    return sum + parseTwdCabinNoteCompactInput(notes[key])
  }, 0)
  const showUsdtCost = balances.usdt > 0 && inventoryCost.twd !== null
  const showVnRates =
    balances.vn > 0 && (vnTwdRate !== null || vnUsdtRate !== null)
  const showUsdtCabinSplit = balances.usdt > 0
  const cabinTone: Record<UsdtCabin, string> = {
    A: 'bg-sky-50 text-sky-800 ring-sky-200',
    B: 'bg-violet-50 text-violet-800 ring-violet-200',
    C: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }
  const twdNoteLetterTone: Record<TwdCabinNoteKey, string> = {
    a: 'text-sky-600',
    b: 'text-violet-600',
    t: 'text-cyan-600',
    g: 'text-teal-600',
    c: 'text-emerald-600',
    d: 'text-amber-600',
    e: 'text-rose-600',
    f: 'text-indigo-600',
    n1: 'text-slate-400',
    n2: 'text-slate-400',
    n3: 'text-slate-400',
    n4: 'text-slate-400',
  }
  const twdNoteFieldTone: Record<TwdCabinNoteKey, string> = {
    a: 'border-sky-200 focus-within:border-sky-400 focus-within:ring-sky-200',
    b: 'border-violet-200 focus-within:border-violet-400 focus-within:ring-violet-200',
    t: 'border-cyan-200 focus-within:border-cyan-400 focus-within:ring-cyan-200',
    g: 'border-teal-200 focus-within:border-teal-400 focus-within:ring-teal-200',
    c: 'border-emerald-200 focus-within:border-emerald-400 focus-within:ring-emerald-200',
    d: 'border-amber-200 focus-within:border-amber-400 focus-within:ring-amber-200',
    e: 'border-rose-200 focus-within:border-rose-400 focus-within:ring-rose-200',
    f: 'border-indigo-200 focus-within:border-indigo-400 focus-within:ring-indigo-200',
    n1: 'border-dashed border-slate-200 focus-within:border-slate-400 focus-within:ring-slate-200',
    n2: 'border-dashed border-slate-200 focus-within:border-slate-400 focus-within:ring-slate-200',
    n3: 'border-dashed border-slate-200 focus-within:border-slate-400 focus-within:ring-slate-200',
    n4: 'border-dashed border-slate-200 focus-within:border-slate-400 focus-within:ring-slate-200',
  }
  const twdNoteSumMismatch =
    Math.abs(twdNoteSumActual - balances.twd) > 0.5
  const hasAnyTwdNote = TWD_CABIN_NOTE_KEYS.some((key) => notes[key].trim() !== '')
  const renderCabinPills = (cabins: { a: number; b: number; c: number }, format?: (n: number) => string) =>
    (['A', 'B', 'C'] as const).map((cabin) => (
      <span
        key={cabin}
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-semibold tabular-nums ring-1 ring-inset sm:text-[10px] ${cabinTone[cabin]}`}
      >
        <span className="opacity-70">{cabin}</span>
        <AnimatedAmount
          value={cabin === 'A' ? cabins.a : cabin === 'B' ? cabins.b : cabins.c}
          format={format}
        />
      </span>
    ))

  return (
    <div className="mb-0.5 grid grid-cols-2 items-stretch gap-0.5 sm:mb-1.5 sm:grid-cols-4 sm:gap-1.5">
      <div
        className={`${BALANCE_CARD_CLASS} flex flex-col items-center justify-center gap-y-0.5 sm:gap-y-1`}
      >
        <div className="flex flex-wrap items-baseline justify-center gap-x-1">
          <p className={BALANCE_LABEL_CLASS}>T</p>
          <AnimatedAmount
            as="p"
            className={`${BALANCE_VALUE_CLASS} text-[13px] sm:text-base`}
            value={balances.twd}
            format={formatTwdTableCompact}
            title={formatTwd(balances.twd)}
          />
        </div>
        {onTwdCabinNoteChange && (
          <button
            type="button"
            onClick={() => setTwdCabinModalOpen(true)}
            className={`mt-0.5 inline-flex max-w-full items-center justify-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-medium leading-none ring-1 ring-inset transition hover:bg-slate-50 sm:text-[9px] ${
              twdNoteSumMismatch
                ? 'bg-amber-50 text-amber-800 ring-amber-200'
                : hasAnyTwdNote
                  ? 'bg-slate-50 text-slate-600 ring-slate-200'
                  : 'bg-white text-slate-400 ring-slate-200'
            }`}
            title="編輯 T 分倉 O/B/T/W/H/J/C"
          >
            <span className="tracking-wide">O–C</span>
            {hasAnyTwdNote && (
              <span className="tabular-nums">Σ {formatTwdTableCompact(twdNoteSumActual)}</span>
            )}
            {twdNoteSumMismatch && <span>≠T</span>}
          </button>
        )}
      </div>
      <div
        className={`${BALANCE_CARD_CLASS} flex flex-wrap items-baseline justify-center gap-x-1 gap-y-0 sm:block`}
      >
        <p className={BALANCE_LABEL_CLASS}>P</p>
        <div className="flex flex-wrap items-baseline justify-center gap-x-1">
          <AnimatedAmount as="p" className={BALANCE_VALUE_CLASS} value={balances.usdt} />
          {totalAssets.usdtInTwd !== null && balances.usdt > 0 && (
            <AnimatedAmount
              as="p"
              className={`${BALANCE_SUB_CLASS} font-medium text-slate-500`}
              value={totalAssets.usdtInTwd}
              format={(n) => `≈T ${formatTwdTableCompact(n)}`}
              title={`兌換台幣 ${formatTwd(totalAssets.usdtInTwd)}`}
            />
          )}
        </div>
        {showUsdtCost && (
          <AnimatedAmount
            as="p"
            className={BALANCE_SUB_CLASS}
            value={inventoryCost.twd!}
            format={(n) => `@${formatUsdtCostRateDisplay(n)}`}
          />
        )}
        {showUsdtCabinSplit && (
          <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-1">
            {renderCabinPills(usdtCabins)}
          </div>
        )}
      </div>
      <div className={BALANCE_CARD_CLASS}>
        <p className={BALANCE_LABEL_CLASS}>V</p>
        <div className="flex flex-wrap items-baseline justify-center gap-x-1">
          <AnimatedAmount
            as="p"
            className={`${BALANCE_VALUE_CLASS} text-[10px] sm:text-sm`}
            value={balances.vn}
            format={formatVnTableCompact}
            title={formatNumber(balances.vn)}
          />
          {totalAssets.vnInTwd !== null && balances.vn > 0 && (
            <AnimatedAmount
              as="p"
              className={`${BALANCE_SUB_CLASS} font-medium text-slate-500`}
              value={totalAssets.vnInTwd}
              format={(n) => `≈T ${formatTwdTableCompact(n)}`}
              title={`兌換台幣 ${formatTwd(totalAssets.vnInTwd)}`}
            />
          )}
        </div>
        {showVnRates && (
          <>
            <div className="mt-0.5 flex items-center justify-center gap-1.5 sm:hidden">
              {vnTwdRate !== null && (
                <AnimatedAmount
                  as="p"
                  className={BALANCE_SUB_CLASS}
                  value={vnTwdRate}
                  format={formatVnNtdCostRateCompact}
                />
              )}
              {vnUsdtRate !== null && (
                <AnimatedAmount
                  as="p"
                  className={BALANCE_SUB_CLASS}
                  value={vnUsdtRate}
                  format={formatVnUsdtCostRateCompact}
                />
              )}
            </div>
            <div className={`${BALANCE_SUB_CLASS} mt-0.5 hidden items-baseline justify-center gap-1.5 sm:flex`}>
              {vnTwdRate !== null && (
                <AnimatedAmount value={vnTwdRate} format={formatVnNtdCostRateCompact} />
              )}
              {vnUsdtRate !== null && (
                <AnimatedAmount value={vnUsdtRate} format={formatVnUsdtCostRateCompact} />
              )}
            </div>
          </>
        )}
      </div>
      <TotalAssetsColumn assets={totalAssets} dense />

      {onTwdCabinNoteChange && twdCabinModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="T 分倉備註"
          onClick={(event) => {
            if (event.target === event.currentTarget) setTwdCabinModalOpen(false)
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-start justify-end">
              <button
                type="button"
                onClick={() => setTwdCabinModalOpen(false)}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="關閉"
              >
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
              </button>
            </div>

            <div className="mt-1 space-y-1.5">
              {(
                [
                  TWD_CABIN_NOTE_ROW1_KEYS,
                  TWD_CABIN_NOTE_ROW2_KEYS,
                  TWD_CABIN_NOTE_ROW3_KEYS,
                ] as const
              ).map((rowKeys, rowIdx) => (
                  <div key={rowIdx} className="grid grid-cols-4 gap-1.5">
                    {rowKeys.map((key) => {
                      const label = TWD_CABIN_NOTE_LABELS[key]
                      return (
                        <label
                          key={key}
                          className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg border px-0.5 py-1.5 focus-within:ring-2 ${twdNoteFieldTone[key]}`}
                        >
                          <span
                            className={`text-[11px] font-bold leading-none ${twdNoteLetterTone[key]}`}
                          >
                            {label}
                          </span>
                          <input
                            type="text"
                            value={notes[key]}
                            onChange={(e) => onTwdCabinNoteChange(key, e.target.value)}
                            placeholder="0"
                            className="min-w-0 w-full border-0 bg-transparent p-0 text-center text-[12px] font-medium tabular-nums leading-tight text-slate-800 outline-none placeholder:text-slate-300 sm:text-[13px]"
                            inputMode="decimal"
                            aria-label={`T 備註 ${label}（萬）`}
                          />
                        </label>
                      )
                    })}
                  </div>
                ))}
            </div>

            <p
              className={`mt-3 mb-3 text-center text-[13px] tabular-nums ${
                twdNoteSumMismatch ? 'font-semibold text-amber-700' : 'text-slate-500'
              }`}
              title={formatTwd(twdNoteSumActual)}
            >
              Σ {formatTwdTableCompact(twdNoteSumActual)}
              {twdNoteSumMismatch ? ' ≠ T' : ' = T'}
            </p>

            <div className="flex items-end justify-start">
              <label className="flex w-[4.5rem] min-w-0 flex-col items-center gap-0.5 rounded-lg border border-slate-300 px-1 py-1.5 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
                <span className="text-[11px] font-bold leading-none text-slate-600">PF</span>
                <input
                  type="text"
                  value={notes.pf}
                  onChange={(e) => onTwdCabinNoteChange('pf', e.target.value)}
                  placeholder="0"
                  className="min-w-0 w-full border-0 bg-transparent p-0 text-center text-[13px] font-medium tabular-nums leading-tight text-slate-800 outline-none placeholder:text-slate-300"
                  inputMode="decimal"
                  aria-label="T 備註 PF（獨立記錄，不入加總）"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** A/B/C 內部調度：選出倉 → 收倉，並顯示三艙現況 */
export function CabinRebalanceModal({
  open,
  currencyLabel = 'P',
  cabins,
  onCancel,
  onConfirm,
}: CabinRebalanceModalProps) {
  if (!open) return null
  return (
    <CabinRebalanceModalContent
      currencyLabel={currencyLabel}
      cabins={cabins}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

export function OpeningUsdtCabinPickModal({
  open,
  adjust,
  currencyLabel = 'P',
  cabins,
  onCancel,
  onConfirm,
}: OpeningUsdtCabinPickModalProps) {
  const [selected, setSelected] = useState<UsdtCabin | null>(null)
  const [localError, setLocalError] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setSelected(null)
      setLocalError('')
    }
  }

  if (!open) return null

  const isOut = adjust < 0
  const absAdjust = Math.abs(adjust)
  const cabinBal = (cabin: UsdtCabin) =>
    cabin === 'A' ? cabins.a : cabin === 'B' ? cabins.b : cabins.c
  const canUse = (cabin: UsdtCabin) => !isOut || cabinBal(cabin) + adjust >= -1e-9

  const cabinTone: Record<UsdtCabin, string> = {
    A: 'border-sky-200 bg-sky-50 text-sky-800',
    B: 'border-violet-200 bg-violet-50 text-violet-800',
    C: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
  const cabinSelectedTone: Record<UsdtCabin, string> = {
    A: 'border-sky-500 ring-2 ring-sky-500/30',
    B: 'border-violet-500 ring-2 ring-violet-500/30',
    C: 'border-emerald-500 ring-2 ring-emerald-500/30',
  }

  const handleConfirm = () => {
    if (!selected) {
      setLocalError('請選擇艙位')
      return
    }
    if (!canUse(selected)) {
      setLocalError(`${selected} 不夠扣（目前 ${formatNumber(cabinBal(selected))}）`)
      return
    }
    onConfirm(selected)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="選擇艙位"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-900">選擇艙位</h2>
        <p className="mt-1 text-[13px] tabular-nums text-slate-600">
          {currencyLabel} {adjust > 0 ? '+' : adjust < 0 ? '−' : ''}
          {currencyLabel === 'T' ? formatTwdTableCompact(absAdjust) : formatNumber(absAdjust)}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['A', 'B', 'C'] as const).map((cabin) => {
            const bal = cabinBal(cabin)
            const enabled = canUse(cabin)
            const isSelected = selected === cabin
            const nextBal = bal + adjust
            return (
              <button
                key={cabin}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  setSelected(cabin)
                  setLocalError('')
                }}
                className={`rounded-lg border px-2 py-2.5 text-left transition ${
                  enabled ? cabinTone[cabin] : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                } ${isSelected && enabled ? cabinSelectedTone[cabin] : ''} ${
                  enabled && !isSelected ? 'hover:brightness-[0.98]' : ''
                }`}
              >
                <span className="block text-[11px] font-semibold">{cabin}</span>
                <span className="mt-0.5 block text-[12px] font-medium tabular-nums">
                  {formatNumber(bal)}
                </span>
                {enabled && (
                  <span className="mt-0.5 block text-[10px] tabular-nums opacity-70">
                    → {formatNumber(nextBal)}
                  </span>
                )}
                {!enabled && (
                  <span className="mt-0.5 block text-[10px] text-rose-500">不夠</span>
                )}
              </button>
            )
          })}
        </div>

        {localError && <p className="mt-2 text-[11px] text-rose-600">{localError}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            C
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

function CabinRebalanceModalContent({
  currencyLabel = 'P',
  cabins,
  onCancel,
  onConfirm,
}: {
  currencyLabel?: 'P' | 'T'
  cabins: CabinRebalanceModalProps['cabins']
  onCancel: CabinRebalanceModalProps['onCancel']
  onConfirm: CabinRebalanceModalProps['onConfirm']
}) {
  const totalP = Math.max(0, cabins.a + cabins.b + cabins.c)
  const [fromCabin, setFromCabin] = useState<UsdtCabin>('A')
  const [toCabin, setToCabin] = useState<UsdtCabin>('B')
  const [amountStr, setAmountStr] = useState('')
  const [rebalanceError, setRebalanceError] = useState('')
  const [pendingTransfer, setPendingTransfer] = useState<{
    from: UsdtCabin
    to: UsdtCabin
    amount: number
    next: { a: number; b: number; c: number }
  } | null>(null)

  const cabinBalance = (cabin: UsdtCabin) =>
    cabin === 'A' ? cabins.a : cabin === 'B' ? cabins.b : cabins.c

  const cabinTone: Record<UsdtCabin, string> = {
    A: 'text-sky-700',
    B: 'text-violet-700',
    C: 'text-emerald-700',
  }

  const cabinSelectClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10'

  const handleTransferClick = () => {
    const trimmed = amountStr.trim()
    const amount = trimmed === '' ? NaN : Number(trimmed)
    const result = transferUsdtBetweenCabins(cabins, fromCabin, toCabin, amount)
    if (!result.ok) {
      setRebalanceError(result.error)
      return
    }
    setRebalanceError('')
    setPendingTransfer({
      from: fromCabin,
      to: toCabin,
      amount,
      next: result.next,
    })
  }

  const confirmPendingTransfer = () => {
    if (!pendingTransfer) return
    onConfirm(pendingTransfer.next)
    setPendingTransfer(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="艙位調度"
    >
      <div
        className={`w-full rounded-xl bg-white shadow-xl ${
          pendingTransfer ? 'max-w-[13.5rem] px-3 py-2.5' : 'max-w-sm p-5'
        }`}
      >
        {pendingTransfer ? (
          <>
            <h2 className="sr-only">確認調度</h2>
            <p className="text-[13px] font-semibold tabular-nums text-slate-900">
              {pendingTransfer.from}
              <span className="mx-1.5 font-normal text-slate-400">→</span>
              {pendingTransfer.to}
              <span className="ml-1.5">{formatNumber(pendingTransfer.amount)}</span>
            </p>
            <div className="mt-1 space-y-0.5 text-[12px] tabular-nums text-slate-500">
              {(
                [
                  ['A', cabins.a, pendingTransfer.next.a],
                  ['B', cabins.b, pendingTransfer.next.b],
                  ['C', cabins.c, pendingTransfer.next.c],
                ] as const
              )
                .filter(([, before, after]) => before !== after)
                .map(([label, before, after]) => (
                  <p key={label}>
                    {label} {formatNumber(before)}
                    <span className="mx-1 text-slate-300">→</span>
                    {formatNumber(after)}
                  </p>
                ))}
            </div>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPendingTransfer(null)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                C
              </button>
              <button
                type="button"
                onClick={confirmPendingTransfer}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
              >
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {currencyLabel} 合計{' '}
              {currencyLabel === 'T' ? formatTwdTableCompact(totalP) : formatNumber(totalP)}
            </p>

            <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] tabular-nums">
              {(['A', 'B', 'C'] as UsdtCabin[]).map((cabin) => (
                <span key={cabin} className={cabinTone[cabin]}>
                  {cabin} {formatNumber(cabinBalance(cabin))}
                </span>
              ))}
            </div>

            {totalP <= 0 ? (
              <p className="mt-4 text-center text-sm text-slate-400">目前無 P 可調度</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <label className="block">
                    <select
                      value={fromCabin}
                      onChange={(e) => {
                        setFromCabin(e.target.value as UsdtCabin)
                        setRebalanceError('')
                      }}
                      className={cabinSelectClass}
                    >
                      {(['A', 'B', 'C'] as UsdtCabin[]).map((cabin) => (
                        <option key={cabin} value={cabin}>
                          {cabin}（{formatNumber(cabinBalance(cabin))}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-500"
                    aria-hidden
                  >
                    →
                  </span>
                  <label className="block">
                    <select
                      value={toCabin}
                      onChange={(e) => {
                        setToCabin(e.target.value as UsdtCabin)
                        setRebalanceError('')
                      }}
                      className={cabinSelectClass}
                    >
                      {(['A', 'B', 'C'] as UsdtCabin[]).map((cabin) => (
                        <option key={cabin} value={cabin}>
                          {cabin}（{formatNumber(cabinBalance(cabin))}）
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold tracking-wide text-slate-400">
                    AMT
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={amountStr}
                    onChange={(e) => {
                      setAmountStr(e.target.value)
                      setRebalanceError('')
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm tabular-nums text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10"
                    placeholder="0"
                    autoFocus
                  />
                </label>

                {rebalanceError && (
                  <p className="text-xs text-rose-600">{rebalanceError}</p>
                )}
              </div>
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
                disabled={totalP <= 0}
                onClick={handleTransferClick}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function CabinAllocModal({
  open,
  totalUsdt,
  currencyLabel = 'P',
  direction,
  initialCabinA,
  initialCabinB,
  cabinBalances,
  error,
  onCancel,
  onConfirm,
  onDismissError,
}: CabinAllocModalProps) {
  const seedA = Math.min(Math.max(0, initialCabinA), totalUsdt)
  const seedB = Math.min(Math.max(0, initialCabinB), Math.max(0, totalUsdt - seedA))
  // 取消 C：剩餘併入 B，確保 A+B = total
  const seedBAll = seedB + Math.max(0, totalUsdt - seedA - seedB)
  const [cabinAStr, setCabinAStr] = useState(seedA === 0 ? '' : String(seedA))
  const [cabinBStr, setCabinBStr] = useState(seedBAll === 0 ? '' : String(seedBAll))
  const [localError, setLocalError] = useState('')

  if (!open) return null

  const parseAmt = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return 0
    const n = Number(trimmed)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  }

  const clearErrors = () => {
    setLocalError('')
    onDismissError?.()
  }

  const syncAB = (a: number, b: number) => {
    const clampedA = Math.min(Math.max(0, a), totalUsdt)
    const clampedB = Math.min(Math.max(0, b), Math.max(0, totalUsdt - clampedA))
    setCabinAStr(clampedA === 0 ? '' : String(clampedA))
    setCabinBStr(clampedB === 0 ? '' : String(clampedB))
    clearErrors()
  }

  const applyA = (raw: string) => {
    setCabinAStr(raw)
    clearErrors()
    const a = parseAmt(raw)
    if (a === null) return
    const clampedA = Math.min(Math.max(0, a), totalUsdt)
    setCabinBStr(totalUsdt - clampedA === 0 ? '' : String(totalUsdt - clampedA))
  }

  const applyB = (raw: string) => {
    setCabinBStr(raw)
    clearErrors()
    const b = parseAmt(raw)
    if (b === null) return
    const clampedB = Math.min(Math.max(0, b), totalUsdt)
    setCabinAStr(totalUsdt - clampedB === 0 ? '' : String(totalUsdt - clampedB))
  }

  const setPreset = (a: number, b: number) => {
    syncAB(a, b)
  }

  const handleConfirm = () => {
    const a = parseAmt(cabinAStr)
    const b = parseAmt(cabinBStr)
    if (a === null || b === null) {
      setLocalError('請輸入有效的非負數量')
      return
    }
    if (Math.abs(a + b - totalUsdt) > 1e-9) {
      setLocalError(
        `A+B 須等於 ${
          currencyLabel === 'T' ? formatTwdTableCompact(totalUsdt) : formatNumber(totalUsdt)
        }`,
      )
      return
    }
    onConfirm(a, b)
  }

  const signLabel = direction === 'in' ? '+' : '−'
  const displayError = localError || error

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="本筆分倉"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <p className="text-xs text-slate-500">
          {currencyLabel}{' '}
          {currencyLabel === 'T' ? formatTwdTableCompact(totalUsdt) : formatNumber(totalUsdt)}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-slate-500">
          <span>A {formatNumber(cabinBalances.a)}</span>
          <span className="text-slate-300">·</span>
          <span>B {formatNumber(cabinBalances.b)}</span>
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
            onClick={() => setPreset(totalUsdt, 0)}
            className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
          >
            A
          </button>
          <button
            type="button"
            onClick={() => setPreset(0, totalUsdt)}
            className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"
          >
            B
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

export function DailyTradeSettleBar({
  tradeCount,
  onSettle,
}: DailyTradeSettleBarProps) {
  if (tradeCount <= 0) return null

  return (
    <div className="mt-1 flex justify-end sm:mt-1.5">
      <button
        type="button"
        onClick={onSettle}
        className="w-full rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100 sm:w-auto sm:bg-indigo-600 sm:py-0.5 sm:text-xs sm:text-white sm:shadow-sm sm:hover:bg-indigo-700"
      >
        AL
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
          <col style={{ width: '12%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '30%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '14%' }} />
        </colgroup>
      )
    }
    return (
      <colgroup>
        <col style={{ width: '10%' }} />
        <col style={{ width: '14%' }} />
        <col style={{ width: '22%' }} />
        <col style={{ width: '24%' }} />
        <col style={{ width: '16%' }} />
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
    ? isBuy
      ? calculateBuyDayAverageRate(transactions, 'twd')
      : calculateAverageRate(transactions, 'twd')
    : null
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
          <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-0 leading-none">
            <span className="inline-flex items-center gap-0.5">
              {formatTradeListDate(tx)}
            </span>
            {tx.note?.trim() ? (
              <span
                className="max-w-[3.5rem] truncate text-[10px] font-medium text-slate-700"
                title={tx.note.trim()}
              >
                {tx.note.trim()}
              </span>
            ) : null}
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
    <label
      className={`relative inline-flex h-[1.75rem] w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-300 bg-white transition has-[:focus-visible]:border-slate-400 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate-300/40 sm:h-auto sm:w-10 sm:py-0.5 ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none text-[11px] leading-none tabular-nums text-slate-700 sm:text-xs"
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
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
    </label>
  )
}

function TradeFormMetaCell({
  dateId,
  noteId,
  tradeDate,
  note,
  onTradeDateChange,
  onNoteChange,
  disabled,
  isEditing,
  onClear,
  onCancel,
  buttonClass,
}: {
  dateId: string
  noteId: string
  tradeDate: string
  note: string
  onTradeDateChange: (value: string) => void
  onNoteChange: (value: string) => void
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
      />
      <input
        id={noteId}
        type="text"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        disabled={disabled}
        placeholder="備註"
        aria-label="備註"
        autoComplete="off"
        className={TRADE_NOTE_INPUT_CLASS}
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
        {isEditing ? '儲存' : 'OK'}
      </button>
      {isEditing && (
        <button type="button" onClick={onCancel} className={TRADE_FORM_ACTIONS_CLASS}>
          取消
        </button>
      )}
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
  note,
  error,
  isEditing,
  disabled,
  onFieldChange,
  onTradeDateChange,
  onNoteChange,
  onSubmit,
  onCancel,
  onClear,
  accentClass,
  buttonClass,
  focusClass,
  balances,
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
  const twdOverdraft = type === 'buy' && fiatValid && fiatNum > balances.twd
  const usdtInsufficient = type === 'sell' && usdtValid && usdtNum > balances.usdt

  let previewText: string | null = null
  let previewWarn = false

  if (usdtValid && fiatValid) {
    if (type === 'buy') {
      previewText = twdOverdraft
        ? `−T ${formatTwdTableCompact(fiatNum)} · +P ${formatNumber(usdtNum)}（T 透支）`
        : `−T ${formatTwdTableCompact(fiatNum)} · +P ${formatNumber(usdtNum)}`
      previewWarn = false
    } else {
      previewText = `−P ${formatNumber(usdtNum)} · +T ${formatTwdTableCompact(fiatNum)}`
      previewWarn = usdtNum > balances.usdt
    }
  }

  const showTradeHint = previewText || twdOverdraft || usdtInsufficient

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
          <div className="col-start-2 row-start-2 min-w-0 sm:order-4">
            <TradeFormMetaCell
              dateId={`${prefix}Date`}
              noteId={`${prefix}Note`}
              tradeDate={tradeDate}
              note={note}
              onTradeDateChange={onTradeDateChange}
              onNoteChange={onNoteChange}
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
              usdtInsufficient || previewWarn
                ? 'text-rose-600'
                : twdOverdraft
                  ? 'text-amber-700'
                  : 'text-slate-500'
            }`}
          >
            {previewText ??
              (twdOverdraft
                ? '台幣將透支（允許）'
                : usdtInsufficient
                  ? 'USDT 餘額不足'
                  : null)}
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
      className={`mb-1 rounded-lg bg-slate-100/90 p-0.5 ${className}`}
      role="tablist"
      aria-label="主功能"
    >
      <div className="grid grid-cols-4 gap-0.5">
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
              className={`min-w-0 rounded-md px-0.5 py-1 text-center transition-all ${
                selected ? pane.activeClass : pane.idleClass
              }`}
            >
              <span className="block text-[12px] font-bold leading-none tracking-tight">
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
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors disabled:cursor-not-allowed sm:px-2 sm:py-1 sm:text-xs ${
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
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors disabled:cursor-not-allowed sm:px-2 sm:py-1 sm:text-xs ${
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
  note,
  error,
  isEditing,
  disabled,
  onFieldChange,
  onTradeDateChange,
  onNoteChange,
  onSubmit,
  onCancel,
  onClear,
  accentClass,
  buttonClass,
  focusClass,
  balances,
}: VnTradeFormProps) {
  const prefix = type === 'buy' ? 'vnBuy' : 'vnSell'
  const inputClass = `${TRADE_INPUT_CLASS} ${focusClass}`
  const rateInputClass = `${TRADE_RATE_INPUT_CLASS} ${focusClass}`
  const payLabel = assetCode(payCurrency)

  const resolvedPreview = useMemo(() => {
    const resolved = resolveVnTradeFields(vn, pay, rate, payCurrency)
    return resolved.ok ? resolved : null
  }, [vn, pay, rate, payCurrency])

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
    }
  }

  const showVnHint = previewText || payInsufficient || vnInsufficient

  return (
    <>
      <div className="mb-1 flex items-center justify-end gap-1 sm:mb-1 sm:justify-between">
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
          <div className="col-start-2 row-start-2 min-w-0 sm:order-4">
            <TradeFormMetaCell
              dateId={`${prefix}Date`}
              noteId={`${prefix}Note`}
              tradeDate={tradeDate}
              note={note}
              onTradeDateChange={onTradeDateChange}
              onNoteChange={onNoteChange}
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
  showDayAverage = false,
  showSellAverage = false,
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
  const totalUsdtPay = transactions.reduce(
    (sum, tx) => (tx.payCurrency === 'usdt' ? sum + tx.usdtAmount : sum),
    0,
  )
  const totalTwdPay = transactions.reduce(
    (sum, tx) => (tx.payCurrency === 'twd' ? sum + tx.twdAmount : sum),
    0,
  )
  const usdtRowCount = transactions.filter((tx) => tx.payCurrency === 'usdt').length
  const twdRowCount = transactions.filter((tx) => tx.payCurrency === 'twd').length
  const dayBuyUsdtAvg = useMemo(() => {
    if (!isBuy || !showDayAverage) return null
    let totalVnPaid = 0
    let totalUsdt = 0
    for (const tx of transactions) {
      if (tx.payCurrency !== 'usdt') continue
      totalVnPaid += tx.vnAmount
      totalUsdt += tx.usdtAmount
    }
    return totalUsdt > 0 ? totalVnPaid / totalUsdt : null
  }, [isBuy, showDayAverage, transactions])
  const dayBuyTwdAvg = useMemo(() => {
    if (!isBuy || !showDayAverage) return null
    let totalVnPaid = 0
    let totalTwd = 0
    for (const tx of transactions) {
      if (tx.payCurrency !== 'twd') continue
      totalVnPaid += tx.vnAmount
      // 與表列 T 縮寫一致：還原後再加總，避免 footer @ 與畫面金額對不上
      totalTwd += roundTwdTableCompact(tx.twdAmount) * 10_000
    }
    return totalTwd > 0 ? totalVnPaid / totalTwd : null
  }, [isBuy, showDayAverage, transactions])
  const daySellUsdtAvg = useMemo(() => {
    if (isBuy || !showSellAverage) return null
    let totalVn = 0
    let totalUsdt = 0
    for (const tx of transactions) {
      if (tx.payCurrency !== 'usdt') continue
      totalVn += tx.vnAmount
      totalUsdt += tx.usdtAmount
    }
    return totalUsdt > 0 ? totalVn / totalUsdt : null
  }, [isBuy, showSellAverage, transactions])
  const daySellTwdAvg = useMemo(() => {
    if (isBuy || !showSellAverage) return null
    let totalVn = 0
    let totalTwd = 0
    for (const tx of transactions) {
      if (tx.payCurrency !== 'twd') continue
      totalVn += tx.vnAmount
      // 例：620050000 / (39.00+38.94)萬 = 620050000 / 779400
      totalTwd += roundTwdTableCompact(tx.twdAmount) * 10_000
    }
    return totalTwd > 0 ? totalVn / totalTwd : null
  }, [isBuy, showSellAverage, transactions])
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
          {mobileRowIndex ? 'P' : '金額'}
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
        style={{ minHeight: `${TRANSACTION_FOOT_REM}rem`, height: 'auto' }}
      >
        <td
          className={`${
            mobileRowIndex ? VN_MOBILE_INDEX_CELL_CLASS : TRANSACTION_CELL_CLASS
          } overflow-hidden whitespace-nowrap font-semibold text-slate-800`}
        >
          {mobileRowIndex ? (
            transactions.length > 0 ? (
              <div className="flex flex-col items-start gap-0.5 leading-none">
                {usdtRowCount > 0 && (
                  <span className="inline-flex items-center gap-px">
                    <VnPayCurrencyBadge currency="usdt" size="xs" />
                    <span className="text-[8px] font-medium tabular-nums text-sky-700">
                      {usdtRowCount}
                    </span>
                  </span>
                )}
                {twdRowCount > 0 && (
                  <span className="inline-flex items-center gap-px">
                    <VnPayCurrencyBadge currency="twd" size="xs" />
                    <span className="text-[8px] font-medium tabular-nums text-emerald-700">
                      {twdRowCount}
                    </span>
                  </span>
                )}
              </div>
            ) : null
          ) : (
            <span>
              總結
              <span className="font-normal text-slate-500"> {transactions.length}筆</span>
            </span>
          )}
        </td>
        <td className={vnAmountCell('overflow-hidden font-medium text-amber-700')}>
          <span
            className="block min-w-0 truncate whitespace-nowrap"
            title={formatNumber(totalVn)}
          >
            {formatVnTableCompact(totalVn)}
          </span>
        </td>
        {!mobileRowIndex && (
          <td className={vnCoinCell('overflow-hidden')}>
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
        <td className={vnNumCell('overflow-hidden')}>
          {totalUsdtPay > 0 || totalTwdPay > 0 ? (
            <div className="flex min-w-0 max-w-full flex-col items-end gap-0.5 overflow-hidden leading-tight">
              {totalUsdtPay > 0 && (
                <span
                  className="max-w-full truncate font-medium tabular-nums text-sky-700"
                  title={formatNumber(totalUsdtPay)}
                >
                  {formatNumber(totalUsdtPay)}
                </span>
              )}
              {totalTwdPay > 0 && (
                <span
                  className="max-w-full truncate font-medium tabular-nums text-emerald-700"
                  title={formatTwd(totalTwdPay)}
                >
                  {formatTwdTableCompact(totalTwdPay)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className={vnNumCell('overflow-hidden')}>
          {isBuy && showDayAverage ? (
            dayBuyUsdtAvg !== null || dayBuyTwdAvg !== null ? (
              <div className="flex min-w-0 max-w-full flex-col items-end gap-0.5 overflow-hidden leading-tight">
                {dayBuyUsdtAvg !== null && (
                  <span
                    className="max-w-full truncate text-[10px] font-bold tabular-nums text-violet-600 sm:text-[12px]"
                    title={`@${formatVnTradeRateDisplay(dayBuyUsdtAvg)}${vnRateUnitSuffix('usdt')}`}
                  >
                    @{formatVnTradeRateDisplay(dayBuyUsdtAvg)}
                    <span className="ml-0.5 text-[8px] font-semibold text-sky-600 sm:text-[9px]">
                      {vnRateUnitSuffix('usdt')}
                    </span>
                  </span>
                )}
                {dayBuyTwdAvg !== null && (
                  <span
                    className="max-w-full truncate text-[10px] font-bold tabular-nums text-violet-600 sm:text-[12px]"
                    title={`@${formatVnTradeRateDisplay(dayBuyTwdAvg)}${vnRateUnitSuffix('twd')}`}
                  >
                    @{formatVnTradeRateDisplay(dayBuyTwdAvg)}
                    <span className="ml-0.5 text-[8px] font-semibold text-emerald-600 sm:text-[9px]">
                      {vnRateUnitSuffix('twd')}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400">—</span>
            )
          ) : !isBuy && showSellAverage ? (
            daySellUsdtAvg !== null || daySellTwdAvg !== null ? (
              <div className="flex min-w-0 max-w-full flex-col items-end gap-0.5 overflow-hidden leading-tight">
                {daySellUsdtAvg !== null && (
                  <span
                    className="max-w-full truncate text-[10px] font-bold tabular-nums text-amber-600 sm:text-[12px]"
                    title={`@${formatVnTradeRateDisplay(daySellUsdtAvg)}${vnRateUnitSuffix('usdt')}`}
                  >
                    @{formatVnTradeRateDisplay(daySellUsdtAvg)}
                    <span className="ml-0.5 text-[8px] font-semibold text-sky-600 sm:text-[9px]">
                      {vnRateUnitSuffix('usdt')}
                    </span>
                  </span>
                )}
                {daySellTwdAvg !== null && (
                  <span
                    className="max-w-full truncate text-[10px] font-bold tabular-nums text-amber-600 sm:text-[12px]"
                    title={`@${formatVnTradeRateDisplay(daySellTwdAvg)}${vnRateUnitSuffix('twd')}`}
                  >
                    @{formatVnTradeRateDisplay(daySellTwdAvg)}
                    <span className="ml-0.5 text-[8px] font-semibold text-emerald-600 sm:text-[9px]">
                      {vnRateUnitSuffix('twd')}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400">—</span>
            )
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        {!isBuy && (
          <td
            className={vnNumCell(
              `overflow-hidden font-semibold ${
                hasProfitData ? profitColorClass(totalProfit) : 'text-slate-400'
              }`,
            )}
          >
            <span className="block max-w-full truncate">
              {hasProfitData ? formatProfit(totalProfit) : '—'}
            </span>
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
          <span className="inline-flex min-w-0 max-w-full flex-col items-start gap-0 leading-none">
            <span className="inline-flex items-center gap-0.5">
              {formatTradeListDate(tx)}
            </span>
            {tx.note?.trim() ? (
              <span
                className="max-w-[3.5rem] truncate text-[10px] font-medium text-slate-700"
                title={tx.note.trim()}
              >
                {tx.note.trim()}
              </span>
            ) : null}
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
            vnMobileRateCell(vnTradeDisplayRate(tx), tx.payCurrency, false)
          ) : (
            <>
              <span className="tabular-nums text-slate-600">
                {formatVnTradeRateDisplay(vnTradeDisplayRate(tx))}
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

export function ExpensePayCurrencyToggle({
  value,
  onChange,
  disabled,
}: {
  value: VnPayCurrency
  onChange: (currency: VnPayCurrency) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex shrink-0 rounded-md bg-slate-100 p-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('twd')}
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors disabled:cursor-not-allowed sm:px-2 sm:py-1 sm:text-xs ${
          value === 'twd'
            ? 'bg-emerald-100 text-emerald-800 shadow-sm ring-1 ring-emerald-200'
            : 'text-slate-600 hover:text-emerald-700'
        }`}
      >
        T
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('usdt')}
        className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors disabled:cursor-not-allowed sm:px-2 sm:py-1 sm:text-xs ${
          value === 'usdt'
            ? 'bg-sky-100 text-sky-800 shadow-sm ring-1 ring-sky-200'
            : 'text-slate-600 hover:text-sky-700'
        }`}
      >
        U
      </button>
    </div>
  )
}

export function ExpenseForm({
  amount,
  note,
  expenseDate,
  payCurrency,
  onPayCurrencyChange,
  error,
  isEditing,
  disabled,
  onAmountChange,
  onNoteChange,
  onExpenseDateChange,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="flex min-w-0 items-center gap-1.5">
        <TradeMetaDateInput
          id="expenseDate"
          value={expenseDate}
          onChange={onExpenseDateChange}
          disabled={disabled}
        />
        <ExpensePayCurrencyToggle
          value={payCurrency}
          onChange={onPayCurrencyChange}
          disabled={disabled}
        />
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={amount}
          disabled={disabled}
          onChange={(e) => onAmountChange(e.target.value)}
          className={`w-[5rem] shrink-0 ${EXPENSE_INPUT_CLASS}`}
          placeholder={payCurrency === 'usdt' ? 'U' : 'T'}
          aria-label={payCurrency === 'usdt' ? '金額 USDT' : '金額台幣（萬）'}
        />
        <input
          type="text"
          value={note}
          disabled={disabled}
          onChange={(e) => onNoteChange(e.target.value)}
          className={`min-w-0 flex-1 ${EXPENSE_INPUT_CLASS}`}
          placeholder="…"
          aria-label="備註"
        />
        <div className="flex shrink-0 gap-1">
          <button
            type="submit"
            disabled={disabled}
            className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-orange-700 focus:ring-2 focus:ring-orange-600/25 disabled:opacity-50"
          >
            {isEditing ? 'OK' : '+'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[10px] leading-tight text-rose-600">{error}</p>}
    </form>
  )
}

export function ExpensePageSummary({ transactions, onReconcile }: ExpensePageSummaryProps) {
  const twdCash = transactions.reduce(
    (sum, tx) => (tx.payCurrency === 'usdt' ? sum : sum + tx.amountTwd),
    0,
  )
  const usdtTotal = transactions.reduce(
    (sum, tx) => (tx.payCurrency === 'usdt' ? sum + (tx.amountUsdt ?? 0) : sum),
    0,
  )
  if (transactions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2">
      <span className="flex flex-wrap items-center justify-end gap-x-2 text-sm font-semibold tabular-nums tracking-tight text-rose-600">
        {twdCash > 0 && <span>−{formatTwdTableCompact(twdCash)} T</span>}
        {usdtTotal > 0 && <span>−{formatNumber(usdtTotal)} U</span>}
        {twdCash <= 0 && usdtTotal <= 0 && (
          <span>
            −{formatTwdTableCompact(transactions.reduce((s, tx) => s + tx.amountTwd, 0))}
          </span>
        )}
      </span>
      {onReconcile && (
        <button
          type="button"
          onClick={onReconcile}
          className="rounded-md bg-orange-600/90 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white transition hover:bg-orange-700"
        >
          RECON
        </button>
      )}
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

  if (transactions.length === 0) {
    return <div className="py-6" aria-hidden="true" />
  }

  const rows = (
    <ul className="divide-y divide-slate-100/80">
      {transactions.map((tx) => {
        const note = tx.note.trim()
        const isUsdt = tx.payCurrency === 'usdt'
        return (
          <li
            key={tx.id}
            data-expense-row={tx.id}
            className={`group flex items-center gap-2 px-0.5 py-1.5 text-[12px] leading-none transition-colors hover:bg-slate-50/90 ${
              editingId === tx.id ? 'bg-amber-50/80 hover:bg-amber-50' : ''
            }`}
          >
            <span className="w-[2.75rem] shrink-0 tabular-nums text-[11px] text-slate-400">
              {formatSettlementDate(tx.timestamp)}
            </span>
            <span className="flex w-[5.5rem] shrink-0 items-baseline justify-end gap-0.5 font-medium tabular-nums text-rose-600">
              {isUsdt ? (
                <>
                  <span>−{formatNumber(tx.amountUsdt ?? 0)}</span>
                  <span className="text-[9px] font-semibold text-sky-600">U</span>
                </>
              ) : (
                <>
                  <span title={formatTwd(tx.amountTwd)}>−{formatTwdTableCompact(tx.amountTwd)}</span>
                  <span className="text-[9px] font-semibold text-emerald-600">T</span>
                </>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
              {note}
              {isUsdt && tx.amountTwd > 0 ? (
                <span className="ml-1 text-slate-400" title={formatTwd(tx.amountTwd)}>
                  ≈T {formatTwdTableCompact(tx.amountTwd)}
                </span>
              ) : null}
            </span>
            <div className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <RowActionButtons onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} />
            </div>
          </li>
        )
      })}
    </ul>
  )

  if (!hasOverflow) return rows

  return (
    <div
      className="transaction-table-body-scroll--overflow overflow-y-auto"
      style={{ maxHeight: maxBodyHeight }}
    >
      {rows}
    </div>
  )
}

export function SettlementRecordBody({
  twdBalance,
  usdtBalance,
  vnBalance,
  displayAssets,
  dayUsdtProfit,
  dayVnProfit,
  dayTotalProfit,
  usdtCostAvg = null,
  vnTwdRate = null,
  vnUsdtRate = null,
  heading,
}: SettlementRecordBodyProps & { heading?: string }) {
  const showProfit =
    dayUsdtProfit !== undefined || dayVnProfit !== undefined || dayTotalProfit !== 0
  const hasSplit =
    dayUsdtProfit !== undefined && dayVnProfit !== undefined
  const displayTotal = hasSplit
    ? sumRoundedProfitParts(dayUsdtProfit, dayVnProfit)
    : dayTotalProfit
  const displayTotalLabel = hasSplit
    ? formatProfitFromParts(dayUsdtProfit, dayVnProfit)
    : formatProfit(dayTotalProfit)

  const totalBadge = (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums tracking-tight ${
        displayTotal > 0
          ? 'bg-emerald-100 text-emerald-800'
          : displayTotal < 0
            ? 'bg-rose-100 text-rose-800'
            : 'bg-slate-100 text-slate-600'
      }`}
      title="當日總 PF"
    >
      {displayTotalLabel}
    </span>
  )

  const splitBlock = showProfit ? (
    <span className="whitespace-nowrap font-semibold tabular-nums text-emerald-600">
      <SettlementDayProfit
        compact
        splitOnly
        usdtProfit={dayUsdtProfit}
        vnProfit={dayVnProfit}
        totalProfit={dayTotalProfit}
      />
    </span>
  ) : null

  const showVnCost =
    vnBalance > 0 && (vnTwdRate != null || vnUsdtRate != null)

  const balanceBlock = (
    <>
      <span className="tabular-nums">
        <span className="text-slate-400">T </span>
        <span className="font-semibold text-emerald-600" title={formatTwd(twdBalance)}>
          {formatTwdTableCompact(twdBalance)}
        </span>
      </span>
      <span className="tabular-nums">
        <span className="text-slate-400">P </span>
        <span className="font-semibold text-sky-600">{formatNumber(usdtBalance)}</span>
        {usdtCostAvg != null && usdtBalance > 0 ? (
          <span
            className="ml-0.5 text-[10px] tabular-nums text-slate-400"
            title="結帳成本價"
          >
            @{formatUsdtTradeRateDisplay(usdtCostAvg)}
          </span>
        ) : null}
      </span>
      <span className="tabular-nums">
        <span className="text-slate-400">VN </span>
        <span className="font-semibold text-amber-600" title={formatNumber(vnBalance)}>
          {formatVnTableCompact(vnBalance)}
        </span>
        {showVnCost ? (
          <span className="ml-0.5 text-[10px] tabular-nums text-slate-400" title="結帳 VN 成本">
            {[
              vnTwdRate != null ? formatVnNtdCostRateCompact(vnTwdRate) : null,
              vnUsdtRate != null ? formatVnUsdtCostRateCompact(vnUsdtRate) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </span>
    </>
  )

  const assetsBlock = (
    <span
      className="shrink-0 font-bold tabular-nums text-indigo-800"
      title={formatTwd(displayAssets.total)}
    >
      {formatTwdTableCompact(displayAssets.total)}
      {!displayAssets.isComplete && (
        <span className="ml-1 text-[9px] font-medium text-amber-700">部分</span>
      )}
    </span>
  )

  return (
    <>
      {/* 手機：兩行，避免擠爆／重疊 */}
      <div className="space-y-1.5 text-[12px] leading-none sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {heading ? (
              <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{heading}</span>
            ) : null}
            {splitBlock}
          </div>
          {totalBadge}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
            {balanceBlock}
          </div>
          {assetsBlock}
        </div>
      </div>

      {/* 桌面：單列＋豎線分區 */}
      <div className="hidden items-center gap-3 text-[12px] leading-none sm:flex">
        {heading ? (
          <span className="shrink-0 tabular-nums text-[11px] text-slate-400">{heading}</span>
        ) : null}

        <div className="flex shrink-0 items-center gap-2">
          {splitBlock}
          {totalBadge}
        </div>

        <span className="h-3.5 w-px shrink-0 bg-slate-300" aria-hidden />

        <div className="flex min-w-0 flex-1 items-center gap-x-3.5">{balanceBlock}</div>

        {assetsBlock}
      </div>
    </>
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

const SETTLEMENT_TRADE_PANE_TONE: Record<'IE' | 'OE' | 'IV' | 'OV', string> = {
  IE: 'text-emerald-700',
  OE: 'text-rose-700',
  IV: 'text-sky-700',
  OV: 'text-amber-700',
}

function SettlementGroupFooter({
  code,
  rows,
  sellProfitById,
}: {
  code: 'IE' | 'OE' | 'IV' | 'OV'
  rows: Array<UsdtTransaction | VnTradeTransaction>
  sellProfitById?: Record<string, number>
}) {
  if (rows.length === 0) return null

  const footerRowClass =
    code === 'IE'
      ? 'border-b border-emerald-200/80 bg-emerald-100/90'
      : code === 'OE'
        ? 'border-b border-rose-200/80 bg-rose-100/90'
        : code === 'IV'
          ? 'border-b border-sky-200/80 bg-sky-100/90'
          : 'border-b border-amber-200/80 bg-amber-100/90'
  const spacer = (
    <tr aria-hidden="true" className="h-2 border-0">
      <td colSpan={5} className="border-0 p-0" />
    </tr>
  )

  if (code === 'IE' || code === 'OE') {
    const usdtRows = rows.filter(isUsdtTransaction)
    const lTotal = usdtRows.reduce((sum, tx) => sum + tx.usdtAmount, 0)
    const giTotal = usdtRows.reduce((sum, tx) => sum + tx.fiatAmount, 0)
    const rAvg = calculateAverageRate(usdtRows, 'twd')
    const pfParts =
      code === 'OE' ? usdtRows.map((tx) => sellProfitById?.[tx.id]) : []
    const hasPf = pfParts.some((p) => p != null)
    const pfSum = hasPf ? sumRoundedProfitParts(...pfParts) : null
    return (
      <>
        {spacer}
        <tr className={footerRowClass}>
          <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-800">
            {formatNumber(lTotal)}
          </td>
          <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-800">
            {formatTwdTableCompact(giTotal)}
          </td>
          <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-800">
            {rAvg != null ? formatUsdtTradeRateDisplay(rAvg) : '—'}
          </td>
          <td
            className={`py-1.5 pr-2 font-semibold tabular-nums ${
              pfSum == null ? 'text-slate-300' : profitColorClass(pfSum)
            }`}
          >
            {pfSum == null ? '' : formatProfitFromParts(...pfParts)}
          </td>
          <td />
        </tr>
      </>
    )
  }

  const lTotal = rows.reduce(
    (sum, tx) => sum + ('vnAmount' in tx ? tx.vnAmount : 0),
    0,
  )
  const giUsdtTotal = rows.reduce((sum, tx) => {
    if (!('payCurrency' in tx) || tx.payCurrency !== 'usdt') return sum
    return sum + vnTradePayAmount(tx)
  }, 0)
  const giTwdTotal = rows.reduce((sum, tx) => {
    if (!('payCurrency' in tx) || tx.payCurrency !== 'twd') return sum
    return sum + vnTradePayAmount(tx)
  }, 0)
  const vol = summarizeSettlementTrades(rows)
  const rAvg = code === 'IV' ? vol.buyVnAvg : vol.sellVnAvg
  const pfParts = code === 'OV' ? rows.map((tx) => sellProfitById?.[tx.id]) : []
  const hasPf = pfParts.some((p) => p != null)
  const pfSum = hasPf ? sumRoundedProfitParts(...pfParts) : null

  return (
    <>
      {spacer}
      <tr className={footerRowClass}>
        <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-800">
          {formatVnTableCompact(lTotal)}
        </td>
        <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-800">
          <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
            {giUsdtTotal > 0 ? (
              <span>
                {formatNumber(giUsdtTotal)}
                <span className="ml-0.5 text-[9px] font-medium text-slate-500">P</span>
              </span>
            ) : null}
            {giTwdTotal > 0 ? (
              <span>
                {formatTwdTableCompact(giTwdTotal)}
                <span className="ml-0.5 text-[9px] font-medium text-slate-500">T</span>
              </span>
            ) : null}
            {giUsdtTotal <= 0 && giTwdTotal <= 0 ? '—' : null}
          </span>
        </td>
        <td className="py-1.5 pr-2 font-semibold tabular-nums text-slate-800">
          {rAvg != null ? formatVnTradeRateDisplay(rAvg) : '—'}
        </td>
        <td
          className={`py-1.5 pr-2 font-semibold tabular-nums ${
            pfSum == null ? 'text-slate-300' : profitColorClass(pfSum)
          }`}
        >
          {pfSum == null ? '' : formatProfitFromParts(...pfParts)}
        </td>
        <td />
      </tr>
    </>
  )
}

export function SettlementNoteSearchPanel({
  settlements,
  monthlyCloses,
}: SettlementNoteSearchPanelProps) {
  const [query, setQuery] = useState('')

  const hits = useMemo(
    () => searchSettlementTradesByNote(settlements, monthlyCloses, query),
    [settlements, monthlyCloses, query],
  )

  const trimmedQuery = query.trim()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
        <input
          id="settlement-note-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="備註"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {trimmedQuery === '' ? null : hits.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white py-10 text-center text-xs text-slate-400">
          無符合「{trimmedQuery}」的交易
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 shadow-sm">
            <p className="text-xs font-medium text-indigo-900">
              共 {hits.length} 筆
              <span className="ml-1.5 font-normal text-indigo-700/80">「{trimmedQuery}」</span>
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[32rem] text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="px-2 py-2 font-medium">SET</th>
                  <th className="px-2 py-2 font-medium">類</th>
                  <th className="px-2 py-2 font-medium">L</th>
                  <th className="px-2 py-2 font-medium">GI</th>
                  <th className="px-2 py-2 font-medium">R</th>
                  <th className="px-2 py-2 font-medium">PF</th>
                  <th className="px-2 py-2 font-medium">備註</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => {
                  const tx = hit.trade
                  const qty = isUsdtTransaction(tx)
                    ? formatNumber(tx.usdtAmount)
                    : formatVnTableCompact(tx.vnAmount)
                  const pay = isUsdtTransaction(tx)
                    ? formatTwdTableCompact(tx.fiatAmount)
                    : tx.payCurrency === 'usdt'
                      ? formatNumber(vnTradePayAmount(tx))
                      : formatTwdTableCompact(vnTradePayAmount(tx))
                  const rateText = isUsdtTransaction(tx)
                    ? formatUsdtTradeRateDisplay(tx.rate)
                    : formatVnTradeRateDisplay(vnTradeDisplayRate(tx))
                  const note = tx.note?.trim() || '—'

                  return (
                    <tr
                      key={`${hit.settlementId}-${tx.id}`}
                      className="border-b border-slate-50 last:border-b-0"
                    >
                      <td className="px-2 py-1.5 align-top tabular-nums text-slate-700">
                        <div className="font-medium text-slate-800">
                          {formatSettlementDayLabel(hit.settlementDateLabel, hit.settledAt)}
                        </div>
                        {hit.monthlyClosePeriodLabel ? (
                          <div className="mt-0.5 text-[9px] text-violet-600">
                            {hit.monthlyClosePeriodLabel}
                          </div>
                        ) : null}
                      </td>
                      <td
                        className={`px-2 py-1.5 align-top text-[10px] font-semibold ${SETTLEMENT_TRADE_PANE_TONE[hit.pane]}`}
                      >
                        {hit.pane}
                      </td>
                      <td className="px-2 py-1.5 align-top tabular-nums text-slate-800">{qty}</td>
                      <td className="px-2 py-1.5 align-top tabular-nums text-slate-700">
                        {pay}
                        {!isUsdtTransaction(tx) ? (
                          <span className="ml-0.5 text-[9px] text-slate-400">
                            {assetCode(tx.payCurrency)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 align-top tabular-nums text-slate-600">
                        {rateText}
                      </td>
                      <td
                        className={`px-2 py-1.5 align-top tabular-nums ${
                          hit.profit == null ? 'text-slate-300' : profitColorClass(hit.profit)
                        }`}
                      >
                        {hit.profit == null ? '—' : formatProfit(hit.profit)}
                      </td>
                      <td
                        className="max-w-[8rem] px-2 py-1.5 align-top font-medium text-slate-800"
                        title={note}
                      >
                        {note}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
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
  const cumulativeUsdtProfit = settlements.reduce((sum, item) => {
    const split = settlementDisplaySplitProfits(item)
    return sum + (split.usdt ?? 0)
  }, 0)
  const cumulativeVnProfit = settlements.reduce((sum, item) => {
    const split = settlementDisplaySplitProfits(item)
    return sum + (split.vn ?? 0)
  }, 0)
  const showCumulativeSplit = settlements.some(settlementHasSplitProfit)

  if (settlements.length === 0) {
    return <div className="py-8" aria-hidden="true" />
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-2">
      <div className="rounded-xl border-2 border-indigo-400/70 bg-gradient-to-r from-indigo-100/90 via-indigo-50 to-emerald-50/80 px-3 py-2.5 shadow-md shadow-indigo-200/40 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="shrink-0 rounded-md bg-indigo-600/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700">
            Σ#{settlements.length}
          </span>
          {showCumulativeSplit ? (
            <div className="flex min-w-0 flex-1 items-baseline justify-center gap-4 text-[13px] font-semibold tabular-nums sm:gap-5 sm:text-sm">
              <span className={profitColorClass(cumulativeUsdtProfit)}>
                P{formatProfit(cumulativeUsdtProfit) === '0' ? '+0' : formatProfit(cumulativeUsdtProfit)}
              </span>
              <span className="text-indigo-300/80">·</span>
              <span className={profitColorClass(cumulativeVnProfit)}>
                VN{formatProfit(cumulativeVnProfit) === '0' ? '+0' : formatProfit(cumulativeVnProfit)}
              </span>
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <p
            className={`shrink-0 text-lg font-bold tabular-nums tracking-tight ${profitColorClass(
              showCumulativeSplit
                ? sumRoundedProfitParts(cumulativeUsdtProfit, cumulativeVnProfit)
                : cumulativeTotalProfit,
            )}`}
          >
            {showCumulativeSplit
              ? formatProfitFromParts(cumulativeUsdtProfit, cumulativeVnProfit)
              : formatProfit(cumulativeTotalProfit)}
          </p>
        </div>
      </div>

      {settlements.map((item) => {
        const displayAssets = totalAssetsFromSettlement(item)
        const displaySplit = settlementDisplaySplitProfits(item)
        const isExpanded = expandedIds.has(item.id)
        const trades = item.trades
          ? [...item.trades].sort(compareTradeListOrder)
          : []
        const settlementTradePane = (
          tx: (typeof trades)[number],
        ): 'IE' | 'OE' | 'IV' | 'OV' =>
          isUsdtTransaction(tx)
            ? tx.type === 'buy'
              ? 'IE'
              : 'OE'
            : tx.type === 'buy'
              ? 'IV'
              : 'OV'
        const tradeGroups: Array<{
          code: 'IE' | 'OE' | 'IV' | 'OV'
          tone: string
          rows: typeof trades
        }> = (
          [
            { code: 'IE', tone: 'text-emerald-700' },
            { code: 'OE', tone: 'text-rose-700' },
            { code: 'IV', tone: 'text-sky-700' },
            { code: 'OV', tone: 'text-amber-700' },
          ] as const
        )
          .map((group) => ({
            ...group,
            rows: trades.filter((tx) => settlementTradePane(tx) === group.code),
          }))
          .filter((group) => group.rows.length > 0)
        const dayHeading = formatSettlementDayLabel(
          item.dateLabel || formatSettlementDateTime(item.settledAt),
          item.settledAt,
        )

        return (
          <article
            key={item.id}
            className="w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => toggleExpanded(item.id)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-slate-50/90"
              aria-expanded={isExpanded}
              aria-label={`${dayHeading} 日結${isExpanded ? '收合' : '展開'}明細`}
            >
              <div className="min-w-0 flex-1">
                <SettlementRecordBody
                  heading={dayHeading}
                  twdBalance={item.twdBalance}
                  usdtBalance={item.usdtBalance}
                  vnBalance={item.vnBalance}
                  displayAssets={displayAssets}
                  dayUsdtProfit={displaySplit.usdt}
                  dayVnProfit={displaySplit.vn}
                  dayTotalProfit={
                    displaySplit.usdt !== undefined && displaySplit.vn !== undefined
                      ? sumRoundedProfitParts(displaySplit.usdt, displaySplit.vn) *
                        10_000
                      : item.dayTotalProfit
                  }
                  usdtCostAvg={item.dayBuyAvgTwd ?? item.usdtInventoryAvgTwd}
                  vnTwdRate={item.dayVnTwdRate}
                  vnUsdtRate={item.dayVnUsdtRate}
                />
              </div>
              <svg
                className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
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
            </button>

            <CollapsibleSection open={isExpanded}>
              <div className="border-t border-slate-100 px-3 pb-3 pt-2">
                {!item.trades || item.trades.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-slate-400">
                    此結算未封存明細（升級後新結帳才會保留）
                  </p>
                ) : (
                  <>
                    <table className="w-full table-fixed text-left text-[11px]">
                      <colgroup>
                        <col className="w-[22%]" />
                        <col className="w-[22%]" />
                        <col className="w-[18%]" />
                        <col className="w-[14%]" />
                        <col className="w-[24%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="py-1 pr-2 font-medium">L</th>
                          <th className="py-1 pr-2 font-medium">GI</th>
                          <th className="py-1 pr-2 font-medium">R</th>
                          <th className="py-1 pr-2 font-medium">PF</th>
                          <th className="py-1 font-medium">{'\u00a0'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradeGroups.map((group) => (
                          <Fragment key={group.code}>
                            <tr className="border-b border-slate-100 bg-slate-50/90">
                              <td
                                colSpan={5}
                                className={`py-1 pr-1 text-[10px] font-semibold tracking-wide ${group.tone}`}
                              >
                                {group.code}
                                <span className="ml-1.5 font-normal text-slate-400">
                                  {group.rows.length}
                                </span>
                              </td>
                            </tr>
                            {group.rows.map((tx) => {
                              const qty = isUsdtTransaction(tx)
                                ? formatNumber(tx.usdtAmount)
                                : formatVnTableCompact(tx.vnAmount)
                              const pay = isUsdtTransaction(tx)
                                ? formatTwdTableCompact(tx.fiatAmount)
                                : tx.payCurrency === 'usdt'
                                  ? formatNumber(vnTradePayAmount(tx))
                                  : formatTwdTableCompact(vnTradePayAmount(tx))
                              const rateText = isUsdtTransaction(tx)
                                ? formatUsdtTradeRateDisplay(tx.rate)
                                : formatVnTradeRateDisplay(vnTradeDisplayRate(tx))
                              const profit =
                                tx.type === 'sell'
                                  ? item.sellProfitById?.[tx.id]
                                  : undefined
                              const note = tx.note?.trim() || '—'

                              return (
                                <tr key={tx.id} className="border-b border-slate-50">
                                  <td className="py-1 pr-2 tabular-nums text-slate-800">
                                    {qty}
                                  </td>
                                  <td className="py-1 pr-2 tabular-nums text-slate-700">
                                    {pay}
                                    {!isUsdtTransaction(tx) ? (
                                      <span className="ml-0.5 text-[9px] text-slate-400">
                                        {assetCode(tx.payCurrency)}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="py-1 pr-2 tabular-nums text-slate-600">
                                    {rateText}
                                  </td>
                                  <td
                                    className={`py-1 pr-2 tabular-nums ${
                                      profit === undefined
                                        ? 'text-slate-300'
                                        : profitColorClass(profit)
                                    }`}
                                  >
                                    {profit === undefined ? '—' : formatProfit(profit)}
                                  </td>
                                  <td
                                    className="truncate py-1 font-medium text-slate-700"
                                    title={note}
                                  >
                                    {note}
                                  </td>
                                </tr>
                              )
                            })}
                            <SettlementGroupFooter
                              code={group.code}
                              rows={group.rows}
                              sellProfitById={item.sellProfitById}
                            />
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </CollapsibleSection>
          </article>
        )
      })}
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
                        <td className="py-1 text-right tabular-nums text-rose-700">
                          {row.payCurrency === 'usdt' ? (
                            <>
                              −{formatNumber(row.amountUsdt ?? 0)} U
                              {row.amountTwd > 0 ? (
                                <span className="ml-1 text-[10px] text-slate-400">
                                  ≈T {formatTwd(row.amountTwd)}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <>−{formatTwd(row.amountTwd)} T</>
                          )}
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

export function CumulativeExpensesPanel({
  entries,
  onAdd,
  onUpdate,
  onDelete,
}: CumulativeExpensesPanelProps) {
  const [date, setDate] = useState(defaultTradeDateInputValue)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [detailEntry, setDetailEntry] = useState<CumulativeExpenseEntry | null>(null)
  const rows = useMemo(
    () => [...entries].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
    [entries],
  )
  const total = rows.reduce((sum, row) => sum + row.amountTwd, 0)

  const resetForm = () => {
    setDate(defaultTradeDateInputValue())
    setAmount('')
    setNote('')
    setEditingId(null)
    setError('')
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const amountTwd = parseExpenseTwdInput(amount)
    if (!isValidDateInputValue(date)) {
      setError('請輸入有效日期')
      return
    }
    if (amountTwd === null) {
      setError('請輸入有效的正數金額')
      return
    }
    const timestamp = timestampFromDateInput(date)
    if (editingId) onUpdate(editingId, timestamp, amountTwd, note.trim())
    else onAdd(timestamp, amountTwd, note.trim())
    resetForm()
  }

  const handleEdit = (entry: CumulativeExpenseEntry) => {
    setEditingId(entry.id)
    setDate(dateInputValueFromDate(entry.timestamp))
    setAmount(formatExpenseTwdInput(entry.amountTwd))
    setNote(entry.note)
    setError('')
  }

  const detailItems = detailEntry?.items
    ? [...detailEntry.items].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    : []

  return (
    <section className="mx-auto w-full max-w-sm min-w-0">
      <div
        className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
          editingId ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200/90'
        }`}
      >
        <form onSubmit={handleSubmit} className="border-b border-slate-100 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <TradeMetaDateInput
              id="cumulativeExpenseDate"
              value={date}
              onChange={setDate}
            />
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="T"
              aria-label="金額台幣（萬）"
              className={`w-[5rem] shrink-0 ${EXPENSE_INPUT_CLASS}`}
            />
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="…"
              aria-label="備註"
              className={`min-w-0 flex-1 ${EXPENSE_INPUT_CLASS}`}
            />
            <div className="flex shrink-0 gap-1">
              <button
                type="submit"
                className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-orange-700"
              >
                {editingId ? 'OK' : '+'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          {error && <p className="mt-1 text-[10px] text-rose-600">{error}</p>}
        </form>

        <div className="px-2.5 py-1">
          {rows.length === 0 ? (
            <div className="py-6" aria-hidden="true" />
          ) : (
            <ul className="divide-y divide-slate-100/80">
              {rows.map((row) => {
                const noteText = row.note.trim()
                const hasItems = Boolean(row.items && row.items.length > 0)
                return (
                  <li
                    key={row.id}
                    className={`group flex items-center gap-2 px-0.5 py-1.5 text-[12px] leading-none transition-colors hover:bg-slate-50/90 ${
                      editingId === row.id ? 'bg-amber-50/80 hover:bg-amber-50' : ''
                    } ${hasItems ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (hasItems) setDetailEntry(row)
                    }}
                  >
                    <span className="w-[2.75rem] shrink-0 tabular-nums text-[11px] text-slate-400">
                      {formatSettlementDate(row.timestamp)}
                    </span>
                    <span
                      className="w-[4.25rem] shrink-0 text-right font-medium tabular-nums text-rose-600"
                      title={formatTwd(row.amountTwd)}
                    >
                      −{formatTwdTableCompact(row.amountTwd)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                      {noteText}
                      {hasItems ? (
                        <span className="ml-1 text-orange-400/80">·</span>
                      ) : null}
                    </span>
                    <div
                      className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <RowActionButtons
                        compact
                        onEdit={() => handleEdit(row)}
                        onDelete={() => onDelete(row.id)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {rows.length > 0 && (
          <div className="flex items-center justify-end border-t border-slate-100 bg-slate-50/60 px-3 py-2">
            <span
              className="text-sm font-semibold tabular-nums tracking-tight text-rose-600"
              title={formatTwd(total)}
            >
              −{formatTwdTableCompact(total)}
            </span>
          </div>
        )}
      </div>

      {detailEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cumulative-expense-detail-title"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-3 py-2.5">
              <div>
                <h2
                  id="cumulative-expense-detail-title"
                  className="text-[13px] font-semibold tabular-nums text-slate-800"
                >
                  {formatSettlementDate(detailEntry.timestamp)}
                </h2>
                {detailEntry.note.trim() ? (
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {detailEntry.note.trim()}
                  </p>
                ) : null}
              </div>
              <p
                className="text-sm font-semibold tabular-nums text-rose-600"
                title={formatTwd(detailEntry.amountTwd)}
              >
                −{formatTwdTableCompact(detailEntry.amountTwd)}
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-3 py-1">
              <ul className="divide-y divide-slate-100/80">
                {detailItems.map((item, index) => (
                  <li
                    key={`${detailEntry.id}-${index}`}
                    className="flex items-center gap-2 py-1.5 text-[12px] leading-none"
                  >
                    <span className="w-[2.75rem] shrink-0 tabular-nums text-[11px] text-slate-400">
                      {formatSettlementDate(item.timestamp)}
                    </span>
                    <span
                      className="w-[5.5rem] shrink-0 text-right font-medium tabular-nums text-rose-600"
                      title={
                        item.payCurrency === 'usdt' ? undefined : formatTwd(item.amountTwd)
                      }
                    >
                      {item.payCurrency === 'usdt' ? (
                        <>
                          −{formatNumber(item.amountUsdt ?? 0)} U
                        </>
                      ) : (
                        <>−{formatTwdTableCompact(item.amountTwd)}</>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                      {item.note.trim()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setDetailEntry(null)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                C
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export function OpeningBalanceModal({
  open,
  liveBalances,
  form,
  error,
  onFieldChange,
  onCancel,
  onConfirm,
}: OpeningBalanceModalProps) {
  const [zeroConfirmOpen, setZeroConfirmOpen] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setZeroConfirmOpen(false)
  }

  if (!open) return null

  const fieldClass =
    'mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:text-sm'
  const labelClass = 'text-[10px] font-medium text-slate-500'

  const liveTwd = coerceDisplayZeroBalance(liveBalances.twd, 'twd')
  const liveUsdt = coerceDisplayZeroBalance(liveBalances.usdt, 'usdt')
  const liveVn = coerceDisplayZeroBalance(liveBalances.vn, 'vn')
  const canZeroTwd = liveTwd > 0
  const zeroAdjust = formatTwdAdjustToZero(liveTwd)

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
          // 顯示為 0.00 的微小誤差視為已歸零
          twd: coerceDisplayZeroBalance(liveTwd + twdAdjust, 'twd'),
          usdt: liveUsdt + usdtAdjust,
          vn: liveVn + vnAdjust,
        }
      : null
  const previewNegative =
    previewBalances !== null &&
    ((twdAdjust !== 0 && twdAdjust !== 'invalid' && previewBalances.twd < 0) ||
      (usdtAdjust !== 0 && usdtAdjust !== 'invalid' && previewBalances.usdt < 0) ||
      (vnAdjust !== 0 && vnAdjust !== 'invalid' && previewBalances.vn < 0))

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
              <p className="font-medium">{formatTwdCompactInput(liveTwd)}</p>
            </div>
            <div>
              <span className={labelClass}>P</span>
              <p className="font-medium">{formatNumber(liveUsdt)}</p>
            </div>
            <div>
              <span className={labelClass}>VN</span>
              <p className="font-medium">{formatVnCompactInput(liveVn)}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className={labelClass}>T +/-</span>
              <button
                type="button"
                disabled={!canZeroTwd}
                title={canZeroTwd ? 'T 歸零' : 'T 已是 0'}
                onClick={() => setZeroConfirmOpen(true)}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                歸零
              </button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="+20"
              value={form.twdAdjust}
              onChange={(event) => onFieldChange('twdAdjust', event.target.value)}
              className={fieldClass}
            />
          </div>
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
          <div
            className={`mt-3 rounded-lg border px-3 py-2 ${
              previewNegative
                ? 'border-rose-200 bg-rose-50/60'
                : 'border-indigo-200 bg-indigo-50/60'
            }`}
          >
            <p
              className={`text-[10px] font-medium ${
                previewNegative ? 'text-rose-700' : 'text-indigo-700'
              }`}
            >
              調整後水位
            </p>
            <div
              className={`mt-1 grid grid-cols-3 gap-2 text-[13px] tabular-nums sm:text-sm ${
                previewNegative ? 'text-rose-900' : 'text-indigo-900'
              }`}
            >
              <div>
                <span
                  className={`text-[10px] font-medium ${
                    previewBalances.twd < 0 ? 'text-rose-600' : previewNegative ? 'text-rose-600' : 'text-indigo-600'
                  }`}
                >
                  T
                </span>
                <p className={`font-medium ${previewBalances.twd < 0 ? 'text-rose-600' : ''}`}>
                  {formatTwdCompactInput(previewBalances.twd)}
                </p>
              </div>
              <div>
                <span
                  className={`text-[10px] font-medium ${
                    previewBalances.usdt < 0 ? 'text-rose-600' : previewNegative ? 'text-rose-600' : 'text-indigo-600'
                  }`}
                >
                  P
                </span>
                <p className={`font-medium ${previewBalances.usdt < 0 ? 'text-rose-600' : ''}`}>
                  {formatNumber(previewBalances.usdt)}
                </p>
              </div>
              <div>
                <span
                  className={`text-[10px] font-medium ${
                    previewBalances.vn < 0 ? 'text-rose-600' : previewNegative ? 'text-rose-600' : 'text-indigo-600'
                  }`}
                >
                  VN
                </span>
                <p className={`font-medium ${previewBalances.vn < 0 ? 'text-rose-600' : ''}`}>
                  {formatVnCompactInput(previewBalances.vn)}
                </p>
              </div>
            </div>
            {previewNegative && (
              <p className="mt-1.5 text-[11px] text-rose-600">
                {[
                  twdAdjust !== 0 && previewBalances.twd < 0
                    ? `T 不夠扣（目前 ${formatTwdCompactInput(liveTwd)}）`
                    : null,
                  usdtAdjust !== 0 && previewBalances.usdt < 0
                    ? `P 不夠扣（目前 ${formatNumber(liveUsdt)}）`
                    : null,
                  vnAdjust !== 0 && previewBalances.vn < 0
                    ? `VN 不夠扣（目前 ${formatVnCompactInput(liveVn)}）`
                    : null,
                ]
                  .filter(Boolean)
                  .join('；')}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={labelClass}>
            P 料金 (T)
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
            P 料金 (VN)
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
            VN 池料金 (VN/T)
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
            VN 池料金 (VN/P)
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

      {zeroConfirmOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zero-twd-confirm-title"
        >
          <div className="w-full max-w-[13.5rem] rounded-lg bg-white px-3 py-2.5 shadow-lg">
            <h3 id="zero-twd-confirm-title" className="sr-only">
              確認 T 歸零
            </h3>
            <p className="text-[13px] font-semibold tabular-nums text-slate-900">
              T {formatTwdCompactInput(liveTwd)}
            </p>
            <p className="mt-0.5 text-[12px] text-slate-500">→ 0</p>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setZeroConfirmOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => {
                  onFieldChange('twdAdjust', zeroAdjust)
                  setZeroConfirmOpen(false)
                }}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MonthlyArchivePanel({
  closes,
  selectedId,
  onSelect,
}: MonthlyArchivePanelProps) {
  const selected = useMemo(
    () => closes.find((item) => item.id === selectedId) ?? null,
    [closes, selectedId],
  )

  if (selected) {
    const resolved = normalizeMonthlyCloseRecord(selected)
    const expenseItems = resolved.expenseSettlements.flatMap((batch) => batch.items)

    return (
      <div className="mx-auto w-full max-w-3xl space-y-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs font-medium text-violet-700 hover:text-violet-800"
        >
          ← 返回
        </button>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            利潤
          </p>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs tabular-nums">
            <span className={profitColorClass(resolved.usdtProfit)}>
              P {formatProfit(resolved.usdtProfit)}
            </span>
            <span className={profitColorClass(resolved.vnProfit)}>
              VN {formatProfit(resolved.vnProfit)}
            </span>
            <span className={`text-sm font-bold ${profitColorClass(resolved.grossProfit)}`}>
              PF {formatProfit(resolved.grossProfit)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              EXP
            </p>
            <p className="text-sm font-bold tabular-nums text-rose-600">
              {formatTwdTableCompact(resolved.expenseTotal)}
            </p>
          </div>
          {expenseItems.length === 0 ? (
            <p className="mt-2 text-center text-[11px] text-slate-400">無開銷</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[11px] tabular-nums">
              {expenseItems.map((item, index) => (
                <li
                  key={`${item.timestamp.getTime()}-${index}`}
                  className="flex items-baseline justify-between gap-2 border-b border-slate-50 pb-1 last:border-0"
                >
                  <span className="min-w-0 truncate text-slate-600">
                    {item.note.trim() || '—'}
                  </span>
                  <span className="shrink-0 font-medium text-rose-600">
                    {formatTwdTableCompact(item.amountTwd)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] tabular-nums text-slate-600">
          <div className="flex justify-between gap-2">
            <span>PF</span>
            <span className={`font-semibold ${profitColorClass(resolved.grossProfit)}`}>
              {formatProfit(resolved.grossProfit)}
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <span>EXP</span>
            <span className="font-semibold text-rose-600">
              {formatTwdTableCompact(resolved.expenseTotal)}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between gap-2 border-t border-slate-200 pt-1.5">
            <span>nPF</span>
            <span className={`font-bold ${profitColorClass(resolved.netProfit)}`}>
              {formatProfit(resolved.netProfit)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            SET {resolved.tradeSettlements.length} · EXP {resolved.expenseSettlements.reduce((n, b) => n + b.expenseCount, 0)}
          </p>
        </div>
      </div>
    )
  }

  if (closes.length === 0) {
    return <div className="py-8 text-center text-xs text-slate-400">尚無月結紀錄</div>
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-2">
      {closes.map((item) => {
        const resolved = normalizeMonthlyCloseRecord(item)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{resolved.periodLabel}</p>
              <p className="mt-0.5 text-[10px] tabular-nums text-slate-500">
                {formatArchiveDateRange(resolved.actualStartDate, resolved.actualEndDate)}
                {' · '}
                SET {resolved.tradeSettlements.length}
                {' · '}
                EXP {formatTwdTableCompact(resolved.expenseTotal)}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs tabular-nums">
              <p className={`font-bold ${profitColorClass(resolved.grossProfit)}`}>
                {formatProfit(resolved.grossProfit)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">PF</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function MonthlyClosesList({
  onOpeningBalance,
  onCabinRebalance,
  onMonthlyClose,
  onPullProdState,
  pullProdBusy,
  onResetAll,
}: MonthlyClosesListProps) {
  const btnClass =
    'rounded border border-slate-200 bg-white px-1.5 py-px text-[10px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs'

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button type="button" onClick={onOpeningBalance} className={btnClass}>
        +/-
      </button>
      <button type="button" onClick={onCabinRebalance} className={btnClass}>
        ADJ
      </button>
      <button type="button" onClick={onMonthlyClose} className={btnClass}>
        M
      </button>
      {onPullProdState && (
        <button
          type="button"
          disabled={pullProdBusy}
          onClick={onPullProdState}
          className={btnClass}
        >
          {pullProdBusy ? '…' : 'PULL'}
        </button>
      )}
      {onResetAll && (
        <button
          type="button"
          onClick={onResetAll}
          className="px-0.5 text-[10px] font-medium text-red-500 transition hover:text-red-700 sm:text-xs"
        >
          清空
        </button>
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
    tab: Exclude<PageTab, 'monthly'>
    label: string
    icon: (active: boolean) => ReactNode
  }[] = [
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
      tab: 'set_search',
      label: 'SRCH',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
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
      tab: 'cumulative_expenses',
      label: 'EXP.SUM',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7.5 15.75l3.75-4.5 3 2.25L19.5 7.5" />
        </svg>
      ),
    },
    {
      tab: 'month',
      label: '月結',
      icon: (_active) => (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5M7.5 12h9" />
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
  ]

  const setupActive = activeTab === 'monthly'
  const setupIcon = (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )

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
        <div className="flex flex-col gap-1.5">
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
        </div>
        <div className="mt-auto border-t border-slate-200/80 pt-3">
          <button
            type="button"
            aria-label="SETUP"
            title="SETUP"
            onClick={() => selectTab('monthly')}
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition ${
              setupActive
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}
          >
            {setupIcon}
          </button>
        </div>
      </nav>
    )
  }

  return (
    <nav className="flex h-full flex-col">
      <div className="space-y-1">
        {navItems.map(({ tab, label }) => (
          <button key={tab} type="button" onClick={() => selectTab(tab)} className={sidebarButtonClass(tab)}>
            {label}
            {tab === 'settlements' && settlementsCount > 0 && (
              <span className="block text-[10px] opacity-70">({settlementsCount})</span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-auto border-t border-slate-100 pt-2">
        <button
          type="button"
          aria-label="SETUP"
          title="SETUP"
          onClick={() => selectTab('monthly')}
          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md transition ${
            setupActive
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
          }`}
        >
          {setupIcon}
        </button>
      </div>
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
