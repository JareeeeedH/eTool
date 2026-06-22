import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const legacy = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8').split('\n')
const body = legacy.slice(4431).join('\n') // function App() ...

const header = `import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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

import {
  EMPTY_USDT_COST,
  INITIAL_BALANCES,
} from './constants'

import { assembleExpenseSettlementsForMonthlyClose } from './domain/expense'
import {
  buildDeleteConfirmLines,
  buildTradeSettleConfirmLines,
} from './domain/confirm'
import { computeVnTradeAnalytics } from './domain/analytics'
import { computeInventoryCost, computeTotalAssetsTwd } from './domain/inventory'
import { computeSellProfitById } from './domain/profit'
import {
  buildMonthlyClose,
  buildMonthlyClosePreview,
  normalizeLoadedSettlement,
  suggestMonthlyPeriodLabel,
} from './domain/settlement'
import { getBusinessDayLabel } from './domain/labels'
import {
  normalizeLoadedTransactions,
  normalizeMonthlyClose,
} from './domain/normalize'
import {
  filterExpenseTransactions,
  filterTradeTransactions,
  filterUsdtTransactions,
  filterVnTradeTransactions,
  isExpenseTransaction,
  isUsdtTransaction,
  isVnTradeTransaction,
  recalculateBalances,
  validateTransactions,
} from './domain/transactions'
import { calculateVnTwdRate } from './domain/inventory'
import { openingBalanceToForm } from './domain/openingBalance'
import { formatRateCalc } from './utils/form'
import { syncFormFields, syncVnTradeFormFields } from './utils/form'
import { formCardClass, recordCardClass } from './utils/uiClasses'

import { ConfirmModal } from './components/ConfirmModal'
import { EditingBanner } from './components/EditingBanner'
import { UndoBanner } from './components/UndoBanner'
import { AppNav } from './components/layout/AppNav'
import { MobileNavCloseIcon, MobileNavMenuIcon } from './components/layout/MobileNavIcons'
import { DailyBalanceStrip } from './components/daily/DailyBalanceStrip'
import { DailyTradeSettleBar } from './components/daily/DailyTradeSettleBar'
import { DailyWorkTabBar } from './components/daily/DailyWorkTabBar'
import { TradeForm } from './components/daily/TradeForm'
import { TransactionTable } from './components/daily/TransactionTable'
import { VnTradeForm } from './components/daily/VnTradeForm'
import { VnTradeTable } from './components/daily/VnTradeTable'
import { ExpenseForm } from './components/expenses/ExpenseForm'
import { ExpensePageSummary } from './components/expenses/ExpensePageSummary'
import { ExpenseTable } from './components/expenses/ExpenseTable'
import { SettlementsPanel } from './components/settlements/SettlementsPanel'
import { MonthlyCloseModal } from './components/monthly/MonthlyCloseModal'
import { MonthlyCloseDetail } from './components/monthly/MonthlyCloseDetail'
import { MonthlyClosesList } from './components/monthly/MonthlyClosesList'
import { OpeningBalanceModal } from './components/opening/OpeningBalanceModal'
import { useTransactionVisibleRows } from './hooks/useTransactionVisibleRows'

`

fs.writeFileSync(path.join(ROOT, 'src', 'App.legacy.tsx'), legacy.join('\n'))
fs.writeFileSync(path.join(ROOT, 'src', 'App.tsx'), header + body)
console.log('App.tsx rewritten, legacy saved as App.legacy.tsx')
