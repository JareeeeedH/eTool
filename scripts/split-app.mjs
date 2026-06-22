/**
 * One-time refactor: split src/App.tsx into modules.
 * Run: node scripts/split-app.mjs
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src', 'App.tsx')
const lines = fs.readFileSync(SRC, 'utf8').split('\n')

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n')
}

function write(relPath, content) {
  const full = path.join(ROOT, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content.trimEnd() + '\n')
  console.log('wrote', relPath)
}

// --- types ---
write(
  'src/types/index.ts',
  `export type TransactionType = 'buy' | 'sell'
export type EditingCategory = TransactionType | 'vn_buy' | 'vn_sell' | 'expense'
export type DailyWorkTab = 'usdt' | 'vn'
export type FiatCurrency = 'twd' | 'vn'
export type VnPayCurrency = 'twd' | 'usdt'
export type ExpenseType = 'rent' | 'fuel' | 'parking' | 'meal' | 'telecom' | 'misc' | 'other'

${slice(31, 65)}

${slice(125, 199)}

export type PageTab =
  | 'daily'
  | 'expenses'
  | 'settlements'
  | 'monthly'

${slice(210, 241)}

${slice(347, 355)}

${slice(491, 496)}

${slice(698, 707)}

${slice(882, 887)}

${slice(931, 936)}

${slice(1085, 1090)}

${slice(1597, 1610)}

export type AccentColor = 'emerald' | 'rose' | 'violet' | 'orange'

${slice(1703, 1710)}

${slice(1758, 1762)}

${slice(1910, 1925)}

${slice(2305, 2326)}

${slice(2590, 2613)}

${slice(2847, 2866)}

${slice(3173, 3188)}

${slice(3324, 3327)}

${slice(3363, 3370)}

${slice(3475, 3493)}

${slice(3758, 3761)}

${slice(3907, 3915)}

${slice(4001, 4036)}

${slice(4168, 4173)}

${slice(4215, 4219)}

${slice(4323, 4330)}
`,
)

// --- constants ---
write(
  'src/constants/index.ts',
  `import type { ExpenseType } from '../types'

${slice(12, 26)}

export const INITIAL_TWD = 5_000_000
export const INITIAL_USDT = 0
export const INITIAL_VN = 0

${slice(216, 229)}

${slice(1207, 1216)}

${slice(1983, 2008)}

export const VN_TRANSACTION_TABLE_CLASS = 'w-full min-w-[340px] table-fixed text-left text-xs'
export const EXPENSE_TABLE_CLASS = 'w-full min-w-[300px] table-fixed text-left text-xs'
`,
)

// --- utils/format.ts ---
write(
  'src/utils/format.ts',
  `${slice(27, 29)}

${slice(242, 327)}

${slice(1388, 1398)}

${slice(1460, 1474)}

${slice(1641, 1649)}

${slice(1260, 1266)}
`,
)

// --- utils/form.ts ---
write(
  'src/utils/form.ts',
  `${slice(328, 346)}

${slice(426, 429)}

${slice(889, 978)}
`,
)

// --- domain/transactions.ts ---
write(
  'src/domain/transactions.ts',
  `import type {
  Balances,
  ExpenseTransaction,
  Transaction,
  UsdtTransaction,
  VnTradeTransaction,
} from '../types'
import { INITIAL_BALANCES } from '../constants'

${slice(67, 124)}

${slice(1787, 1908)}
`,
)

// --- domain/inventory.ts ---
write(
  'src/domain/inventory.ts',
  `import type {
  Balances,
  Transaction,
  UsdtInventoryCost,
  UsdtTransaction,
  VnTradeTransaction,
} from '../types'
import { EMPTY_USDT_COST } from '../constants'
import { filterUsdtTransactions, filterVnTradeTransactions, isUsdtTransaction, isVnTradeTransaction, vnTradePayAmount } from './transactions'
import { calculateRate, formatRateDisplay, formatTwd, roundMoney } from '../utils/format'

${slice(431, 485)}

${slice(486, 490)}

${slice(497, 697)}

${slice(980, 1010)}

${slice(1011, 1084)}
`,
)

// --- domain/analytics.ts ---
write(
  'src/domain/analytics.ts',
  `import type { Balances, Transaction, UsdtInventoryCost } from '../types'
import { filterUsdtTransactions, filterVnTradeTransactions, isUsdtTransaction } from './transactions'
import {
  calculateVnBuyDayAverageRate,
  calculateVnBuyDayAverageUsdtRate,
  computeVnSellDayAverageRate,
  computeVnTwdCostAverageRate,
  computeVnUsdtCostAverageRate,
} from './inventory'
import { computeSellProfitById } from './profit'

${slice(708, 824)}

${slice(825, 843)}
`,
)

// --- domain/profit.ts ---
write(
  'src/domain/profit.ts',
  `import type { Balances, Transaction, UsdtInventoryCost, UsdtTransaction } from '../types'
import { filterUsdtTransactions } from './transactions'
import { usdtUnitCostTwd, createUsdtInventoryState, applyUsdtInventoryTransaction } from './inventory'

${slice(1091, 1147)}
`,
)

// --- domain/assets.ts ---
write(
  'src/domain/assets.ts',
  `import type { DailySettlement, TotalAssetsTwd } from '../types'

${slice(844, 881)}
`,
)

// --- domain/expense.ts ---
write(
  'src/domain/expense.ts',
  `import type { Balances, ExpenseTransaction, ExpenseType, Transaction } from '../types'
import { EMPTY_EXPENSE_BY_CATEGORY } from '../constants'
import { filterExpenseTransactions } from './transactions'
import { computeDayExpenseTotal } from './expenseTotals'
import { expenseTypeLabel } from '../utils/format'
import { formatSettlementDate, formatTwd } from '../utils/format'

${slice(1155, 1206)}
`,
)

write(
  'src/domain/expenseTotals.ts',
  `import type { Transaction } from '../types'
import { filterExpenseTransactions } from './transactions'

${slice(1148, 1154)}
`,
)

// --- domain/settlement.ts ---
write(
  'src/domain/settlement.ts',
  `import type {
  Balances,
  DailySettlement,
  ExpenseSettlement,
  ExpenseTransaction,
  ExpenseType,
  MonthlyClose,
  Transaction,
  UsdtInventoryCost,
} from '../types'
import { EMPTY_EXPENSE_BY_CATEGORY } from '../constants'
import { assembleExpenseSettlementsForMonthlyClose, buildExpenseSettlementFromPending } from './expense'
import { formatArchiveDateRange, formatProfit, formatTwd } from '../utils/format'
import { formatSettlementDate } from '../utils/format'

${slice(1217, 1231)}

${slice(1232, 1243)}

${slice(1244, 1259)}

${slice(1267, 1270)}

${slice(1271, 1300)}

${slice(1301, 1314)}

${slice(1315, 1328)}

${slice(1329, 1336)}

${slice(1337, 1387)}
`,
)

// Fix settlement.ts - buildExpenseSettlementFromPending is IN expense.ts chunk 1155-1206, not separate import from expense for assemble - already in expense.ts

// --- domain/confirm.ts ---
write(
  'src/domain/confirm.ts',
  `import type { Balances, DailySettlement, ExpenseTransaction, Transaction, UsdtInventoryCost, UsdtTransaction, VnTradeTransaction } from '../types'
import { isExpenseTransaction, isUsdtTransaction, isVnTradeTransaction, vnTradePayAmount } from './transactions'
import { computeTotalAssetsTwd } from './inventory'
import { computeInventoryCost } from './inventory'
import { computeUsdtDayTotalProfit, computeVnDayTotalProfit } from './analytics'
import { computeSellProfitById } from './profit'
import { expenseTypeLabel, formatNumber, formatProfit, formatRateDisplay, formatTwd, formatVnNtdCostRate, formatVnUsdtCostRate } from '../utils/format'
import { getBusinessDayLabel } from './labels'
import { computeDayExpenseTotal } from './expenseTotals'

${slice(1485, 1596)}
`,
)

write(
  'src/domain/labels.ts',
  `import type { Transaction } from '../types'
import { isExpenseTransaction, isUsdtTransaction, isVnTradeTransaction, vnTradePayAmount } from './transactions'
import { formatSettlementDate } from '../utils/format'

${slice(1475, 1484)}
`,
)

// --- hooks ---
write(
  'src/hooks/useTransactionVisibleRows.ts',
  `import { useEffect, useState } from 'react'
import { TRANSACTION_VISIBLE_ROWS_DESKTOP, TRANSACTION_VISIBLE_ROWS_MOBILE } from '../constants'

${slice(1986, 2001)}
`,
)

write(
  'src/hooks/useTableScrollAffordance.ts',
  `import { useEffect, useState, type RefObject } from 'react'

${slice(2020, 2051)}
`,
)

write(
  'src/hooks/transactionTableLayout.ts',
  `import {
  TRANSACTION_ROW_HEIGHT_REM,
} from '../constants'

${slice(2009, 2018)}
`,
)

// --- ui classes ---
write(
  'src/utils/uiClasses.ts',
  `${slice(1653, 1675)}
`,
)

// --- components: modals & banners ---
write(
  'src/components/ConfirmModal.tsx',
  `import type { ConfirmDialogState } from '../types'

${slice(361, 410)}
`,
)

write(
  'src/components/EditingBanner.tsx',
  `${slice(411, 425)}
`,
)

write(
  'src/components/UndoBanner.tsx',
  `import type { UndoBannerProps } from '../types'

${slice(1617, 1640)}
`,
)

// --- components: shared ---
write(
  'src/components/VnPoolCostLines.tsx',
  `import { formatVnNtdCostRateCompact, formatVnUsdtCostRateCompact } from '../utils/format'

${slice(306, 327)}
`,
)

write(
  'src/components/RowActionButtons.tsx',
  `${slice(1926, 1982)}
`,
)

write(
  'src/components/SettlementDayProfit.tsx',
  `import { formatProfit, formatTwd, profitColorClass } from '../utils/format'
import { settlementHasSplitProfit } from '../domain/settlementUi'

${slice(1399, 1402)}

${slice(1403, 1459)}
`,
)

write(
  'src/domain/settlementUi.ts',
  `import type { DailySettlement } from '../types'

${slice(1399, 1402)}
`,
)

// --- daily components ---
write(
  'src/components/daily/TotalAssetsColumn.tsx',
  `import type { TotalAssetsTwd } from '../../types'
import { formatTwd } from '../../utils/format'

${slice(1676, 1702)}
`,
)

write(
  'src/components/daily/DailyBalanceStrip.tsx',
  `import type { Balances, TotalAssetsTwd, UsdtInventoryCost } from '../../types'
import { formatCompactNumber, formatNumber, formatRateDisplay, formatTwd } from '../../utils/format'
import { VnPoolCostLines } from '../VnPoolCostLines'
import { TotalAssetsColumn } from './TotalAssetsColumn'
import type { DailyBalanceStripProps } from '../../types'

${slice(1711, 1757)}
`,
)

write(
  'src/components/daily/DailyTradeSettleBar.tsx',
  `import type { DailyTradeSettleBarProps } from '../../types'

${slice(1763, 1786)}
`,
)

write(
  'src/components/daily/TransactionTable.tsx',
  `import { useEffect, useRef, type RefObject } from 'react'
import type { TransactionTableProps, UsdtTransaction } from '../../types'
import {
  TRANSACTION_CELL_CLASS,
  TRANSACTION_DATA_ROW_STYLE,
  TRANSACTION_FOOT_REM,
  TRANSACTION_HEAD_REM,
  TRANSACTION_TABLE_CLASS,
} from '../../constants'
import { formatNumber, formatProfit, formatRateDisplay, formatTableDateTime, formatTwd, profitColorClass } from '../../utils/format'
import { calculateAverageRate, calculateBuyDayAverageRate } from '../../domain/inventory'
import { RowActionButtons } from '../RowActionButtons'
import { useTableScrollAffordance } from '../../hooks/useTableScrollAffordance'
import { transactionTableLayout } from '../../hooks/transactionTableLayout'

${slice(2052, 2075)}

${slice(2076, 2142)}

${slice(2143, 2304)}
`,
)

write(
  'src/components/daily/TradeForm.tsx',
  `import { useEffect, useRef, type FormEvent } from 'react'
import type { TradeFormProps } from '../../types'
import { TRADE_INPUT_CLASS } from '../../constants'
import {
  formatNumber,
  formatProfit,
  formatRateDisplay,
  formatTwd,
} from '../../utils/format'

${slice(2327, 2522)}
`,
)

write(
  'src/components/daily/DailyWorkTabBar.tsx',
  `import type { DailyWorkTab } from '../../types'

${slice(2523, 2548)}
`,
)

write(
  'src/components/daily/VnPayCurrencyToggle.tsx',
  `import type { VnPayCurrency } from '../../types'

${slice(2549, 2589)}
`,
)

write(
  'src/components/daily/VnTradeForm.tsx',
  `import { useEffect, useRef, type FormEvent } from 'react'
import type { VnTradeFormProps } from '../../types'
import { TRADE_INPUT_CLASS } from '../../constants'
import {
  formatCompactNumber,
  formatNumber,
  formatProfit,
  formatTwd,
  formatVnNtdCostRate,
  formatVnUsdtCostRate,
} from '../../utils/format'
import { VnPayCurrencyToggle } from './VnPayCurrencyToggle'

${slice(2614, 2844)}
`,
)

write(
  'src/components/daily/VnTradeTable.tsx',
  `import { useEffect, useRef, type RefObject } from 'react'
import type { VnTradeTableProps } from '../../types'
import {
  TRANSACTION_CELL_CLASS,
  TRANSACTION_DATA_ROW_STYLE,
  TRANSACTION_FOOT_REM,
  TRANSACTION_HEAD_REM,
  VN_TRANSACTION_TABLE_CLASS,
} from '../../constants'
import {
  formatNumber,
  formatProfit,
  formatRateDisplay,
  formatTableDateTime,
  formatTwd,
  formatVnNtdCostRate,
  formatVnNtdCostRateCompact,
  formatVnUsdtCostRateCompact,
  profitColorClass,
} from '../../utils/format'
import {
  calculateVnBuyDayAverageRate,
  calculateVnBuyDayAverageUsdtRate,
  computeVnSellDayAverageRate,
} from '../../domain/inventory'
import { RowActionButtons } from '../RowActionButtons'
import { useTableScrollAffordance } from '../../hooks/useTableScrollAffordance'
import { transactionTableLayout } from '../../hooks/transactionTableLayout'

${slice(2867, 3170)}
`,
)

// --- expense ---
write(
  'src/components/expenses/ExpenseForm.tsx',
  `import { useEffect, useRef, type FormEvent } from 'react'
import type { ExpenseFormProps, ExpenseType } from '../../types'
import { EXPENSE_INPUT_CLASS, EXPENSE_QUICK_TYPES, EXPENSE_TYPE_OPTIONS } from '../../constants'
import { expenseTypeLabel, formatTwd } from '../../utils/format'

${slice(3189, 3323)}
`,
)

write(
  'src/components/expenses/ExpensePageSummary.tsx',
  `import type { ExpensePageSummaryProps } from '../../types'
import { computePendingExpenseBreakdown } from '../../domain/expense'
import { formatTwd } from '../../utils/format'

${slice(3328, 3362)}
`,
)

write(
  'src/components/expenses/ExpenseTable.tsx',
  `import { useEffect } from 'react'
import type { ExpenseTableProps } from '../../types'
import {
  EXPENSE_TABLE_CLASS,
  TRANSACTION_CELL_CLASS,
  TRANSACTION_DATA_ROW_STYLE,
  TRANSACTION_HEAD_REM,
} from '../../constants'
import { expenseTypeLabel, formatTableDateTime, formatTwd } from '../../utils/format'
import { RowActionButtons } from '../RowActionButtons'
import { transactionTableLayout } from '../../hooks/transactionTableLayout'

${slice(3371, 3474)}
`,
)

// --- settlements ---
write(
  'src/components/settlements/SettlementRecordBody.tsx',
  `import type { SettlementRecordBodyProps } from '../../types'
import { formatNumber, formatRateDisplay, formatTwd, formatVnNtdCostRateCompact, formatVnUsdtCostRateCompact } from '../../utils/format'
import { TotalAssetsColumn } from '../daily/TotalAssetsColumn'
import { totalAssetsFromSettlement } from '../../domain/assets'
import { SettlementDayProfit } from '../SettlementDayProfit'
import { VnPoolCostLines } from '../VnPoolCostLines'

${slice(3494, 3591)}
`,
)

write(
  'src/components/settlements/CollapsibleSection.tsx',
  `${slice(3592, 3609)}
`,
)

write(
  'src/components/settlements/SettlementsPanel.tsx',
  `import { useState } from 'react'
import type { SettlementsPanelProps } from '../../types'
import { formatSettlementDateTime, formatTwd } from '../../utils/format'
import { settlementHasSplitProfit } from '../../domain/settlementUi'
import { CollapsibleSection } from './CollapsibleSection'
import { SettlementRecordBody } from './SettlementRecordBody'
import { SettlementDayProfit } from '../SettlementDayProfit'

${slice(3610, 3757)}
`,
)

write(
  'src/components/settlements/ExpenseSettlementsPanel.tsx',
  `import { useState } from 'react'
import type { ExpenseSettlementsPanelProps } from '../../types'
import { formatTwd } from '../../utils/format'

${slice(3762, 3884)}
`,
)

// --- monthly ---
write(
  'src/components/monthly/MonthCloseButton.tsx',
  `${slice(3885, 3906)}
`,
)

write(
  'src/components/monthly/MonthlyCloseModal.tsx',
  `import type { MonthlyCloseModalProps } from '../../types'
import { buildMonthlyClosePreview } from '../../domain/settlement'
import { formatProfit, formatTwd } from '../../utils/format'

${slice(3916, 4000)}
`,
)

write(
  'src/components/opening/OpeningBalanceModal.tsx',
  `import type { OpeningBalanceModalProps } from '../../types'
import { formatNumber, formatRateDisplay, formatTwd } from '../../utils/format'
import { openingBalanceToForm } from '../../domain/openingBalance'

${slice(4011, 4027)}

${slice(4037, 4167)}
`,
)

write(
  'src/domain/openingBalance.ts',
  `import type { Balances, OpeningBalanceForm, UsdtInventoryCost } from '../types'
import { formatNumber, formatRateDisplay, formatTwd } from '../utils/format'

${slice(4011, 4027)}
`,
)

write(
  'src/components/monthly/MonthlyClosesList.tsx',
  `import type { MonthlyClosesListProps } from '../../types'
import { formatArchiveDateRange, formatProfit, formatTwd } from '../../utils/format'
import { normalizeMonthlyCloseRecord } from '../../domain/settlement'
import { MonthCloseButton } from './MonthCloseButton'

${slice(4174, 4214)}
`,
)

write(
  'src/components/monthly/MonthlyCloseDetail.tsx',
  `import { useMemo } from 'react'
import type { MonthlyCloseDetailProps } from '../../types'
import { EXPENSE_TYPE_OPTIONS } from '../../constants'
import {
  formatArchiveDateRange,
  formatProfit,
  formatTwd,
} from '../../utils/format'
import { normalizeMonthlyCloseRecord } from '../../domain/settlement'
import { ExpenseSettlementsPanel } from '../settlements/ExpenseSettlementsPanel'
import { SettlementsPanel } from '../settlements/SettlementsPanel'

${slice(4220, 4322)}
`,
)

// --- layout ---
write(
  'src/components/layout/AppNav.tsx',
  `import type { AppNavProps } from '../../types'

${slice(4331, 4380)}
`,
)

write(
  'src/components/layout/MobileNavIcons.tsx',
  `${slice(4381, 4410)}
`,
)

write(
  'src/domain/normalize.ts',
  `import type { DailySettlement, ExpenseType, MonthlyClose, Transaction } from '../types'
import { EMPTY_EXPENSE_BY_CATEGORY } from '../constants'
import { cloneDailySettlement, cloneExpenseSettlement } from './settlement'
import { isUsdtTransaction, isVnTradeTransaction, normalizeVnTradeTransaction } from './transactions'
import { normalizeMonthlyCloseRecord } from './settlement'

${slice(4411, 4430)}
`,
)

console.log('Done. Next: rewrite App.tsx imports manually or run patch script.')
