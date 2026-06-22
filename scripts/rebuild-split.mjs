import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const lines = fs.readFileSync(path.join(ROOT, 'src', 'App.legacy.tsx'), 'utf8').replace(/\r\n/g, '\n').split('\n')

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n')
}

function write(rel, content) {
  const full = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content.trimEnd() + '\n')
  console.log('wrote', rel)
}

// Remove old broken dirs
for (const dir of ['components', 'domain', 'hooks']) {
  const p = path.join(ROOT, 'src', dir)
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

// --- types ---
write(
  'src/types/index.ts',
  `import type { FormEvent, RefObject } from 'react'

export type TransactionType = 'buy' | 'sell'
export type EditingCategory = TransactionType | 'vn_buy' | 'vn_sell' | 'expense'
export type DailyWorkTab = 'usdt' | 'vn'
export type FiatCurrency = 'twd' | 'vn'
export type VnPayCurrency = 'twd' | 'usdt'
export type ExpenseType = 'rent' | 'fuel' | 'parking' | 'meal' | 'telecom' | 'misc' | 'other'
export type PageTab = 'daily' | 'expenses' | 'settlements' | 'monthly'
export type AccentColor = 'emerald' | 'rose' | 'violet' | 'orange'

${slice(31, 65).replace(/^interface /gm, 'export interface ').replace(/^type Transaction =/m, 'export type Transaction =')}

${slice(125, 198).replace(/^interface /gm, 'export interface ')}

${slice(210, 214).replace(/^interface /gm, 'export interface ')}

${slice(223, 226).replace(/^interface /gm, 'export interface ')}

${slice(231, 240).replace(/^interface /gm, 'export interface ')}

${slice(347, 355).replace(/^interface /gm, 'export interface ')}

${slice(491, 496).replace(/^interface /gm, 'export interface ')}

${slice(1085, 1090).replace(/^interface /gm, 'export interface ')}

${slice(698, 707).replace(/^interface /gm, 'export interface ')}

${slice(882, 887).replace(/^interface /gm, 'export interface ')}

${slice(931, 936).replace(/^interface /gm, 'export interface ')}

export interface MonthlyClosePreview {
  tradeCount: number
  expenseBatchCount: number
  expenseItemCount: number
  grossProfit: number
  expenseTotal: number
  netProfit: number
  dateRangeLabel: string
  pendingTradeCount: number
  pendingExpenseCount: number
}

${slice(1597, 1609).replace(/^interface /gm, 'export interface ')}

${slice(1703, 1710).replace(/^interface /gm, 'export interface ')}

${slice(1758, 1762).replace(/^interface /gm, 'export interface ')}

${slice(1910, 1925).replace(/^interface /gm, 'export interface ')}

${slice(2305, 2326).replace(/^interface /gm, 'export interface ')}

${slice(2590, 2613).replace(/^interface /gm, 'export interface ')}

${slice(2847, 2866).replace(/^interface /gm, 'export interface ')}

${slice(3173, 3188).replace(/^interface /gm, 'export interface ')}

${slice(3324, 3327).replace(/^interface /gm, 'export interface ')}

${slice(3363, 3370).replace(/^interface /gm, 'export interface ')}

${slice(3475, 3493).replace(/^interface /gm, 'export interface ')}

${slice(3758, 3761).replace(/^interface /gm, 'export interface ')}

${slice(3907, 3915).replace(/^interface /gm, 'export interface ').replace(/preview: ReturnType<typeof buildMonthlyClosePreview>/, 'preview: MonthlyClosePreview')}

${slice(4001, 4009).replace(/^interface /gm, 'export interface ')}

${slice(4028, 4035).replace(/^interface /gm, 'export interface ')}

${slice(4168, 4173).replace(/^interface /gm, 'export interface ')}

${slice(4215, 4219).replace(/^interface /gm, 'export interface ')}

${slice(4323, 4330).replace(/^interface /gm, 'export interface ')}

export interface UndoBannerProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export interface ConfirmModalProps {
  dialog: ConfirmDialogState | null
  onCancel: () => void
}
`,
)

// --- domain (pure TS) ---
const domainHeader = `import type {
  Balances,
  DailySettlement,
  ExpenseSettlement,
  ExpenseTransaction,
  ExpenseType,
  FiatCurrency,
  MonthlyClose,
  OpeningBalanceForm,
  Transaction,
  TotalAssetsTwd,
  UsdtInventoryCost,
  UsdtInventoryState,
  UsdtTransaction,
  VnPayCurrency,
  VnTradeAnalytics,
  VnTradeTransaction,
  SellProfitInfo,
} from '../types'
import {
  EMPTY_EXPENSE_BY_CATEGORY,
  INITIAL_BALANCES,
} from '../constants'
import {
  expenseTypeLabel,
  floorTwd,
  formatArchiveDateRange,
  formatNumber,
  formatProfit,
  formatRateDisplay,
  formatSettlementDate,
  formatTwd,
  formatVnNtdCostRateCompact,
  formatVnUsdtCostRateCompact,
} from '../utils/format'

`

function stripInterfaces(code) {
  return code.replace(/^interface \w+[\s\S]*?\n}\n+/gm, '')
}

function stripLegacyConsts(code) {
  return code
    .replace(/^const TRANSACTION_VISIBLE_ROWS_MOBILE = 8\nconst TRANSACTION_VISIBLE_ROWS_DESKTOP = 12\n+/gm, '')
    .replace(/^const TRANSACTION_ROW_HEIGHT_REM = [\s\S]*?^const TRANSACTION_CELL_CLASS[^\n]+\n+/gm, '')
    .replace(/^const VN_TRANSACTION_TABLE_CLASS[^\n]+\n+/gm, '')
    .replace(/^const EXPENSE_TABLE_CLASS[^\n]+\n+/gm, '')
}

function cleanDomain(code) {
  return stripInterfaces(code).replace(/^const EMPTY_EXPENSE_BY_CATEGORY[\s\S]*?\n}\n\n/gm, '')
}

write(
  'src/domain/index.ts',
  cleanDomain(
    domainHeader +
      slice(67, 124).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(431, 495).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(497, 881).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(980, 1206).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(1217, 1259).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(1267, 1387).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(1399, 1401).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(1475, 1595).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(1787, 1908).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(4011, 4026).replace(/^function /gm, 'export function ') +
      '\n' +
      slice(4411, 4430).replace(/^function /gm, 'export function '),
  ),
)

// --- components ---
const compHeader2 = `import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type {
  AppNavProps,
  ConfirmModalProps,
  DailyBalanceStripProps,
  DailyTradeSettleBarProps,
  ExpenseFormProps,
  ExpensePageSummaryProps,
  ExpenseTableProps,
  MonthlyCloseDetailProps,
  MonthlyClosesListProps,
  MonthlyCloseModalProps,
  OpeningBalanceModalProps,
  SettlementsPanelProps,
  ExpenseSettlementsPanelProps,
  SettlementRecordBodyProps,
  TradeFormProps,
  TransactionTableProps,
  UndoBannerProps,
  VnTradeFormProps,
  VnTradeTableProps,
  DailyWorkTab,
  PageTab,
  TotalAssetsTwd,
  UsdtTransaction,
  VnPayCurrency,
  ExpenseType,
} from '../types'
import {
  EXPENSE_INPUT_CLASS,
  EXPENSE_QUICK_TYPES,
  EXPENSE_TABLE_CLASS,
  EXPENSE_TYPE_OPTIONS,
  TRADE_INPUT_CLASS,
  TRANSACTION_CELL_CLASS,
  TRANSACTION_DATA_ROW_STYLE,
  TRANSACTION_FOOT_REM,
  TRANSACTION_HEAD_REM,
  TRANSACTION_ROW_HEIGHT_REM,
  TRANSACTION_TABLE_CLASS,
  TRANSACTION_VISIBLE_ROWS_DESKTOP,
  TRANSACTION_VISIBLE_ROWS_MOBILE,
  VN_TRANSACTION_TABLE_CLASS,
} from '../constants'
import {
  expenseTypeLabel,
  formatArchiveDateRange,
  formatCompactNumber,
  formatNumber,
  formatProfit,
  formatRateDisplay,
  formatSettlementDateTime,
  formatTableDateTime,
  formatTwd,
  formatVnNtdCostRate,
  formatVnNtdCostRateCompact,
  formatVnUsdtCostRate,
  formatVnUsdtCostRateCompact,
  profitColorClass,
} from '../utils/format'
import {
  calculateAverageRate,
  calculateBuyDayAverageRate,
  calculateVnBuyDayAverageRate,
  calculateVnBuyDayAverageUsdtRate,
  computePendingExpenseBreakdown,
  computeVnSellDayAverageRate,
  normalizeMonthlyCloseRecord,
  settlementHasSplitProfit,
  totalAssetsFromSettlement,
} from '../domain'

`

write(
  'src/components/index.tsx',
  stripInterfaces(
    stripLegacyConsts(
      compHeader2 +
        slice(306, 326).replace(/^function /gm, 'export function ') +
        '\n' +
        slice(361, 425).replace(/^function /gm, 'export function ') +
        '\n' +
        slice(1403, 1458).replace(/^function /gm, 'export function ') +
        '\n' +
        slice(1617, 1640).replace(/^function /gm, 'export function ') +
        '\n' +
        slice(1676, 1785).replace(/^function /gm, 'export function ') +
        '\n' +
        slice(1926, 4010).replace(/^function /gm, 'export function ') +
        '\n' +
        slice(4037, 4410).replace(/^function /gm, 'export function '),
    ),
  ),
)

// hooks in components file - useTransactionVisibleRows and useTableScrollAffordance are in slice 1926+

// uiClasses
write(
  'src/utils/uiClasses.ts',
  `import type { AccentColor } from '../types'

${slice(1653, 1675).replace(/^function /gm, 'export function ').replace(/^type AccentColor[\s\S]*?\n\n/, '')}`,
)

// App.tsx
const appHeader = `import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { loadPersistedAppState, savePersistedAppState } from './persistence'
import type {
  AppSnapshot,
  Balances,
  ConfirmDialogState,
  DailySettlement,
  DailyWorkTab,
  EditingCategory,
  ExpenseSettlement,
  ExpenseTransaction,
  ExpenseType,
  MonthlyClose,
  OpeningBalanceForm,
  PageTab,
  Transaction,
  TransactionType,
  UsdtInventoryCost,
  UsdtTransaction,
  VnPayCurrency,
  VnTradeTransaction,
} from './types'
import { EMPTY_USDT_COST, INITIAL_BALANCES } from './constants'
import { calculateRate, formatRateCalc, syncFormFields, syncVnTradeFormFields } from './utils/form'
import {
  assembleExpenseSettlementsForMonthlyClose,
  buildDeleteConfirmLines,
  buildMonthlyClose,
  buildMonthlyClosePreview,
  buildTradeSettleConfirmLines,
  calculateBuyDayAverageRate,
  calculateVnBuyDayAverageRate,
  computeInventoryCost,
  computeSellProfitById,
  computeTotalAssetsTwd,
  computeUsdtDayTotalProfit,
  computeVnDayTotalProfit,
  computeVnTradeAnalytics,
  filterExpenseTransactions,
  filterTradeTransactions,
  filterUsdtTransactions,
  filterVnTradeTransactions,
  getBusinessDayLabel,
  isExpenseTransaction,
  isUsdtTransaction,
  isVnTradeTransaction,
  normalizeLoadedSettlement,
  normalizeLoadedTransactions,
  normalizeMonthlyClose,
  normalizeVnTradeTransaction,
  openingBalanceToForm,
  recalculateBalances,
  settlementFromTotalAssets,
  suggestMonthlyPeriodLabel,
  validateTransactions,
  calculateVnTwdRate,
  vnTradePayAmount,
} from './domain'
import { formatSettlementDateTime, formatTwd } from './utils/format'
import { formCardClass, recordCardClass } from './utils/uiClasses'
import {
  AppNav,
  ConfirmModal,
  DailyBalanceStrip,
  DailyTradeSettleBar,
  DailyWorkTabBar,
  EditingBanner,
  ExpenseForm,
  ExpensePageSummary,
  ExpenseTable,
  MobileNavCloseIcon,
  MobileNavMenuIcon,
  MonthlyCloseDetail,
  MonthlyCloseModal,
  MonthlyClosesList,
  OpeningBalanceModal,
  SettlementsPanel,
  TradeForm,
  TransactionTable,
  UndoBanner,
  VnTradeForm,
  VnTradeTable,
  useTransactionVisibleRows,
} from './components'

`

write('src/App.tsx', appHeader + slice(4432, lines.length))

console.log('rebuild complete')
