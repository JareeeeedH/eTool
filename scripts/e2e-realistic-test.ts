/**
 * 贴近实操的 API 联调：
 * 每轮：USDT 买卖 20 + VN 买卖 20 + 开销 10 → 日结 → 月结
 * 前 5 轮完整月结；第 6 轮同样操作但只做日结、不做月结（保留进行中开销 + 待月结日结）
 *
 * 用法：npx tsx scripts/e2e-realistic-test.ts
 */

import type {
  Balances,
  ExpenseTransaction,
  ExpenseType,
  MonthlyClose,
  PersistedAppState,
  Transaction,
  UsdtInventoryCost,
  UsdtTransaction,
  VnTradeTransaction,
} from '../src/types/index.ts'
import { EMPTY_USDT_COST, INITIAL_BALANCES } from '../src/constants/index.ts'
import {
  assembleExpenseSettlementsForMonthlyClose,
  buildMonthlyClose,
  calculateBuyDayAverageRate,
  calculateVnBuyDayAverageRate,
  computeInventoryCost,
  computeTotalAssetsTwd,
  computeUsdtDayTotalProfit,
  computeVnDayTotalProfit,
  filterExpenseTransactions,
  filterTradeTransactions,
  filterUsdtTransactions,
  isExpenseTransaction,
  recalculateBalances,
  settlementFromTotalAssets,
  validateTransactions,
} from '../src/domain/index.ts'
import { formatSettlementDateTime } from '../src/utils/format.ts'

const API_BASE = (process.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const API_TOKEN = process.env.VITE_API_TOKEN ?? 'dev-secret'

const USDT_BUY_RATES = [31.42, 31.55, 31.68, 31.75, 31.88, 31.95]
const USDT_SELL_RATES = [32.15, 32.28, 32.35, 32.48, 32.6, 32.72]
const USDT_BUY_AMOUNTS = [500, 800, 1000, 1200, 1500, 2000, 600, 750]
const USDT_SELL_AMOUNTS = [200, 300, 400, 500, 600, 350, 450]

const VN_BUY_TWD = [
  { vn: 52000, twd: 650 },
  { vn: 78000, twd: 975 },
  { vn: 64000, twd: 800 },
  { vn: 96000, twd: 1200 },
]
const VN_SELL_TWD = [
  { vn: 30000, twd: 390 },
  { vn: 45000, twd: 585 },
  { vn: 25000, twd: 325 },
]
const VN_BUY_USDT = [
  { vn: 85000, usdt: 2600 },
  { vn: 110000, usdt: 3350 },
  { vn: 72000, usdt: 2200 },
]
const VN_SELL_USDT = [
  { vn: 40000, usdt: 1280 },
  { vn: 55000, usdt: 1760 },
]

const EXPENSE_SAMPLES: { type: ExpenseType; amount: number; note: string }[] = [
  { type: 'fuel', amount: 350, note: '加油' },
  { type: 'parking', amount: 120, note: '停車' },
  { type: 'meal', amount: 280, note: '午餐' },
  { type: 'fuel', amount: 420, note: '加油' },
  { type: 'telecom', amount: 599, note: '門號' },
  { type: 'misc', amount: 150, note: '雜支' },
  { type: 'fuel', amount: 380, note: '加油' },
  { type: 'parking', amount: 80, note: '停車' },
  { type: 'meal', amount: 320, note: '晚餐' },
  { type: 'other', amount: 200, note: '其他' },
]

type SimState = {
  activeTab: PersistedAppState['activeTab']
  dailyWorkTab: PersistedAppState['dailyWorkTab']
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
  transactions: Transaction[]
  settlements: PersistedAppState['settlements']
  expenseSettlements: PersistedAppState['expenseSettlements']
  monthlyCloses: MonthlyClose[]
}

const report = {
  rounds: 0,
  usdtBuy: 0,
  usdtSell: 0,
  vnBuyTwd: 0,
  vnBuyUsdt: 0,
  vnSellTwd: 0,
  vnSellUsdt: 0,
  expense: 0,
  tradeSettles: 0,
  monthlyCloses: 0,
  skipped: 0,
}

function freshState(): SimState {
  return {
    activeTab: 'daily',
    dailyWorkTab: 'usdt',
    openingBalances: { ...INITIAL_BALANCES },
    openingUsdtCost: { ...EMPTY_USDT_COST },
    openingVnTwdRate: null,
    openingVnUsdtRate: null,
    transactions: [],
    settlements: [],
    expenseSettlements: [],
    monthlyCloses: [],
  }
}

function tryAdd(state: SimState, tx: Transaction): boolean {
  const err = validateTransactions([...state.transactions, tx], state.openingBalances)
  if (err) {
    report.skipped++
    return false
  }
  state.transactions.push(tx)
  return true
}

function makeUsdtBuy(at: Date, usdt: number, rate: number): UsdtTransaction {
  report.usdtBuy++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'usdt',
    type: 'buy',
    fiatCurrency: 'twd',
    usdtAmount: usdt,
    fiatAmount: Math.round(usdt * rate * 100) / 100,
    rate,
  }
}

function makeUsdtSell(at: Date, usdt: number, rate: number): UsdtTransaction {
  report.usdtSell++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'usdt',
    type: 'sell',
    fiatCurrency: 'twd',
    usdtAmount: usdt,
    fiatAmount: Math.round(usdt * rate * 100) / 100,
    rate,
  }
}

function makeVnBuyTwd(at: Date, vn: number, twd: number): VnTradeTransaction {
  report.vnBuyTwd++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'vn_trade',
    type: 'buy',
    payCurrency: 'twd',
    vnAmount: vn,
    twdAmount: twd,
    usdtAmount: 0,
    rate: vn / twd,
  }
}

function makeVnSellTwd(at: Date, vn: number, twd: number): VnTradeTransaction {
  report.vnSellTwd++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'vn_trade',
    type: 'sell',
    payCurrency: 'twd',
    vnAmount: vn,
    twdAmount: twd,
    usdtAmount: 0,
    rate: vn / twd,
  }
}

function makeVnBuyUsdt(at: Date, vn: number, usdt: number): VnTradeTransaction {
  report.vnBuyUsdt++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'vn_trade',
    type: 'buy',
    payCurrency: 'usdt',
    vnAmount: vn,
    twdAmount: 0,
    usdtAmount: usdt,
    rate: vn / usdt,
  }
}

function makeVnSellUsdt(at: Date, vn: number, usdt: number): VnTradeTransaction {
  report.vnSellUsdt++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'vn_trade',
    type: 'sell',
    payCurrency: 'usdt',
    vnAmount: vn,
    twdAmount: 0,
    usdtAmount: usdt,
    rate: vn / usdt,
  }
}

function makeExpense(at: Date, sample: (typeof EXPENSE_SAMPLES)[number]): ExpenseTransaction {
  report.expense++
  return {
    id: crypto.randomUUID(),
    timestamp: at,
    category: 'expense',
    expenseType: sample.type,
    amountTwd: sample.amount,
    note: sample.note,
  }
}

function addWithFallback(state: SimState, tx: Transaction, fallback?: () => Transaction) {
  if (tryAdd(state, tx)) return
  if (fallback && tryAdd(state, fallback())) return
}

function runUsdtRound(state: SimState, round: number, baseTime: number) {
  // 贴近实操：先买后卖，汇率有价差
  const plan: Array<() => Transaction> = [
    () => makeUsdtBuy(new Date(baseTime + 1), USDT_BUY_AMOUNTS[0], USDT_BUY_RATES[0]),
    () => makeUsdtBuy(new Date(baseTime + 2), USDT_BUY_AMOUNTS[1], USDT_BUY_RATES[1]),
    () => makeUsdtBuy(new Date(baseTime + 3), USDT_BUY_AMOUNTS[2], USDT_BUY_RATES[2]),
    () => makeUsdtBuy(new Date(baseTime + 4), USDT_BUY_AMOUNTS[3], USDT_BUY_RATES[3]),
    () => makeUsdtSell(new Date(baseTime + 5), USDT_SELL_AMOUNTS[0], USDT_SELL_RATES[0]),
    () => makeUsdtSell(new Date(baseTime + 6), USDT_SELL_AMOUNTS[1], USDT_SELL_RATES[1]),
    () => makeUsdtBuy(new Date(baseTime + 7), USDT_BUY_AMOUNTS[4], USDT_BUY_RATES[4]),
    () => makeUsdtSell(new Date(baseTime + 8), USDT_SELL_AMOUNTS[2], USDT_SELL_RATES[2]),
    () => makeUsdtBuy(new Date(baseTime + 9), USDT_BUY_AMOUNTS[5], USDT_BUY_RATES[5]),
    () => makeUsdtSell(new Date(baseTime + 10), USDT_SELL_AMOUNTS[3], USDT_SELL_RATES[3]),
    () => makeUsdtBuy(new Date(baseTime + 11), USDT_BUY_AMOUNTS[6] + round * 20, USDT_BUY_RATES[2]),
    () => makeUsdtSell(new Date(baseTime + 12), USDT_SELL_AMOUNTS[4], USDT_SELL_RATES[4]),
    () => makeUsdtBuy(new Date(baseTime + 13), USDT_BUY_AMOUNTS[7], USDT_BUY_RATES[3]),
    () => makeUsdtSell(new Date(baseTime + 14), USDT_SELL_AMOUNTS[5], USDT_SELL_RATES[5]),
    () => makeUsdtBuy(new Date(baseTime + 15), 900, USDT_BUY_RATES[1]),
    () => makeUsdtSell(new Date(baseTime + 16), 250, USDT_SELL_RATES[1]),
    () => makeUsdtBuy(new Date(baseTime + 17), 1100, USDT_BUY_RATES[4]),
    () => makeUsdtSell(new Date(baseTime + 18), 320, USDT_SELL_RATES[3]),
    () => makeUsdtBuy(new Date(baseTime + 19), 700, USDT_BUY_RATES[0]),
    () => makeUsdtSell(new Date(baseTime + 20), 280, USDT_SELL_RATES[2]),
  ]

  for (const mk of plan) {
    const tx = mk()
    addWithFallback(
      state,
      tx,
      tx.type === 'sell'
        ? () =>
            makeUsdtBuy(
              tx.timestamp,
              USDT_BUY_AMOUNTS[0],
              USDT_BUY_RATES[round % USDT_BUY_RATES.length],
            )
        : undefined,
    )
  }
}

function runVnRound(state: SimState, round: number, baseTime: number) {
  const t = baseTime + 100
  const samples: Array<() => Transaction> = [
    () => {
      const s = VN_BUY_TWD[0]
      return makeVnBuyTwd(new Date(t + 1), s.vn, s.twd)
    },
    () => {
      const s = VN_BUY_TWD[1]
      return makeVnBuyTwd(new Date(t + 2), s.vn, s.twd)
    },
    () => {
      const s = VN_BUY_USDT[0]
      return makeVnBuyUsdt(new Date(t + 3), s.vn, s.usdt)
    },
    () => {
      const s = VN_SELL_TWD[0]
      return makeVnSellTwd(new Date(t + 4), s.vn, s.twd)
    },
    () => {
      const s = VN_BUY_TWD[2]
      return makeVnBuyTwd(new Date(t + 5), s.vn + round * 1000, s.twd)
    },
    () => {
      const s = VN_SELL_USDT[0]
      return makeVnSellUsdt(new Date(t + 6), s.vn, s.usdt)
    },
    () => {
      const s = VN_BUY_USDT[1]
      return makeVnBuyUsdt(new Date(t + 7), s.vn, s.usdt)
    },
    () => {
      const s = VN_SELL_TWD[1]
      return makeVnSellTwd(new Date(t + 8), s.vn, s.twd)
    },
    () => {
      const s = VN_BUY_TWD[3]
      return makeVnBuyTwd(new Date(t + 9), s.vn, s.twd)
    },
    () => {
      const s = VN_SELL_USDT[1]
      return makeVnSellUsdt(new Date(t + 10), s.vn, s.usdt)
    },
    () => {
      const s = VN_BUY_USDT[2]
      return makeVnBuyUsdt(new Date(t + 11), s.vn, s.usdt)
    },
    () => {
      const s = VN_SELL_TWD[2]
      return makeVnSellTwd(new Date(t + 12), s.vn, s.twd)
    },
    () => {
      const s = VN_BUY_TWD[0]
      return makeVnBuyTwd(new Date(t + 13), s.vn + 5000, s.twd + 60)
    },
    () => {
      const s = VN_BUY_TWD[1]
      return makeVnBuyTwd(new Date(t + 14), s.vn, s.twd + 30)
    },
    () => {
      const s = VN_SELL_TWD[0]
      return makeVnSellTwd(new Date(t + 15), Math.min(s.vn, 20000), Math.round(s.twd * 0.65))
    },
    () => {
      const s = VN_BUY_USDT[0]
      return makeVnBuyUsdt(new Date(t + 16), s.vn + 8000, s.usdt + 240)
    },
    () => {
      const s = VN_SELL_USDT[0]
      return makeVnSellUsdt(new Date(t + 17), 35000, 1120)
    },
    () => {
      const s = VN_BUY_TWD[2]
      return makeVnBuyTwd(new Date(t + 18), s.vn, s.twd)
    },
    () => {
      const s = VN_SELL_TWD[1]
      return makeVnSellTwd(new Date(t + 19), 38000, 494)
    },
    () => {
      const s = VN_BUY_USDT[1]
      return makeVnBuyUsdt(new Date(t + 20), 95000, 2900)
    },
  ]

  for (const mk of samples) {
    const tx = mk()
    addWithFallback(
      state,
      tx,
      tx.category === 'vn_trade' && tx.type === 'sell'
        ? () => {
            const s = VN_BUY_TWD[0]
            return makeVnBuyTwd(tx.timestamp, s.vn, s.twd)
          }
        : undefined,
    )
  }
}

function runExpenseRound(state: SimState, baseTime: number) {
  for (let i = 0; i < 10; i++) {
    const sample = EXPENSE_SAMPLES[i]
    tryAdd(state, makeExpense(new Date(baseTime + 200 + i), sample))
  }
}

/** 与 App.tsx executeTradeSettle 相同 */
function executeTradeSettle(state: SimState) {
  const { transactions, openingBalances, openingUsdtCost, openingVnTwdRate, openingVnUsdtRate } =
    state
  const tradeTxs = filterTradeTransactions(transactions)
  if (tradeTxs.length === 0) return

  const balances = recalculateBalances(transactions, openingBalances)
  const usdtTransactions = filterUsdtTransactions(transactions)
  const inventoryAtSettle = computeInventoryCost(openingBalances, openingUsdtCost, transactions)
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

  state.settlements.unshift({
    id: crypto.randomUUID(),
    settledAt: new Date(),
    dateLabel: formatSettlementDateTime(new Date()),
    twdBalance: balances.twd,
    usdtBalance: balances.usdt,
    vnBalance: balances.vn,
    usdtInventoryAvgTwd: inventoryAtSettle.twd,
    usdtInventoryAvgVn: inventoryAtSettle.vn,
    dayBuyAvgTwd: calculateBuyDayAverageRate(usdtTransactions, 'twd'),
    dayBuyAvgVn: calculateVnBuyDayAverageRate(openingBalances, openingUsdtCost, transactions),
    ...settlementFromTotalAssets(assetsAtSettle),
    transactionCount: tradeTxs.length,
    dayUsdtProfit: settledDayUsdtProfit,
    dayVnProfit: settledDayVnProfit,
    dayTotalProfit: settledDayUsdtProfit + settledDayVnProfit,
  })

  state.openingBalances = balances
  state.openingUsdtCost = inventoryAtSettle
  state.openingVnTwdRate = assetsAtSettle.dayVnTwdRate
  state.openingVnUsdtRate = assetsAtSettle.dayVnUsdtRate
  state.transactions = transactions.filter(isExpenseTransaction)
  report.tradeSettles++
}

/** 与 App.tsx executeMonthlyClose 相同 */
function executeMonthlyClose(state: SimState, periodLabel: string) {
  const balances = recalculateBalances(state.transactions, state.openingBalances)
  const inventoryCost = computeInventoryCost(
    state.openingBalances,
    state.openingUsdtCost,
    state.transactions,
  )
  const totalAssets = computeTotalAssetsTwd(
    balances,
    inventoryCost,
    state.openingBalances,
    state.openingUsdtCost,
    state.openingVnTwdRate,
    state.openingVnUsdtRate,
    state.transactions,
  )
  const pendingExpenses = filterExpenseTransactions(state.transactions)
  const assembledExpenses = assembleExpenseSettlementsForMonthlyClose(
    state.expenseSettlements ?? [],
    pendingExpenses,
    balances,
  )
  const monthlyClose = buildMonthlyClose(
    periodLabel,
    state.settlements,
    assembledExpenses,
    balances,
    inventoryCost,
    state.openingVnTwdRate,
    state.openingVnUsdtRate,
    totalAssets.total,
  )

  state.monthlyCloses.unshift(monthlyClose)
  state.settlements = []
  state.expenseSettlements = []
  if (pendingExpenses.length > 0) {
    state.transactions = state.transactions.filter((tx) => !isExpenseTransaction(tx))
    state.openingBalances = balances
  }
  report.monthlyCloses++
}

function runOneRound(state: SimState, round: number, options?: { skipMonthlyClose?: boolean }) {
  const baseTime = Date.now() + round * 86_400_000
  report.rounds++

  runUsdtRound(state, round, baseTime)
  runVnRound(state, round, baseTime)
  runExpenseRound(state, baseTime)

  const err = validateTransactions(state.transactions, state.openingBalances)
  if (err) throw new Error(`Round ${round} validation failed: ${err}`)

  executeTradeSettle(state)

  if (!options?.skipMonthlyClose) {
    executeMonthlyClose(state, `${round + 1}月`)
  }
}

function serializeState(state: SimState): PersistedAppState {
  const iso = (d: Date) => d.toISOString()
  return {
    activeTab: state.activeTab,
    dailyWorkTab: state.dailyWorkTab,
    openingBalances: state.openingBalances,
    openingUsdtCost: state.openingUsdtCost,
    openingVnTwdRate: state.openingVnTwdRate,
    openingVnUsdtRate: state.openingVnUsdtRate,
    transactions: state.transactions.map((tx) => ({ ...tx, timestamp: iso(tx.timestamp) })) as unknown as Transaction[],
    settlements: state.settlements.map((s) => ({ ...s, settledAt: iso(s.settledAt) })) as unknown as typeof state.settlements,
    expenseSettlements: (state.expenseSettlements ?? []).map((s) => ({
      ...s,
      settledAt: iso(s.settledAt),
      items: s.items.map((i) => ({ ...i, timestamp: iso(i.timestamp) })),
    })) as unknown as typeof state.expenseSettlements,
    monthlyCloses: state.monthlyCloses.map((m) => ({
      ...m,
      closedAt: iso(m.closedAt),
      actualStartDate: m.actualStartDate ? iso(m.actualStartDate) : null,
      actualEndDate: m.actualEndDate ? iso(m.actualEndDate) : null,
      tradeSettlements: m.tradeSettlements.map((s) => ({ ...s, settledAt: iso(s.settledAt) })),
      expenseSettlements: m.expenseSettlements.map((s) => ({
        ...s,
        settledAt: iso(s.settledAt),
        items: s.items.map((i) => ({ ...i, timestamp: iso(i.timestamp) })),
      })),
    })) as unknown as MonthlyClose[],
  }
}

function parseLoaded(raw: PersistedAppState | null): SimState {
  if (!raw) return freshState()
  const d = (v: string) => new Date(v)
  return {
    activeTab: raw.activeTab,
    dailyWorkTab: raw.dailyWorkTab,
    openingBalances: { ...raw.openingBalances },
    openingUsdtCost: { ...raw.openingUsdtCost },
    openingVnTwdRate: raw.openingVnTwdRate ?? null,
    openingVnUsdtRate: raw.openingVnUsdtRate ?? null,
    transactions: raw.transactions.map((tx) => ({ ...tx, timestamp: d(String(tx.timestamp)) })),
    settlements: raw.settlements.map((s) => ({ ...s, settledAt: d(String(s.settledAt)) })),
    expenseSettlements: (raw.expenseSettlements ?? []).map((s) => ({
      ...s,
      settledAt: d(String(s.settledAt)),
      items: s.items.map((i) => ({ ...i, timestamp: d(String(i.timestamp)) })),
    })),
    monthlyCloses: (raw.monthlyCloses ?? []).map((m) => ({
      ...m,
      closedAt: d(String(m.closedAt)),
      actualStartDate: m.actualStartDate ? d(String(m.actualStartDate)) : null,
      actualEndDate: m.actualEndDate ? d(String(m.actualEndDate)) : null,
      tradeSettlements: m.tradeSettlements.map((s) => ({ ...s, settledAt: d(String(s.settledAt)) })),
      expenseSettlements: m.expenseSettlements.map((s) => ({
        ...s,
        settledAt: d(String(s.settledAt)),
        items: s.items.map((i) => ({ ...i, timestamp: d(String(i.timestamp)) })),
      })),
    })),
  }
}

function summary(state: SimState) {
  const tradeInMonthly = state.monthlyCloses.reduce(
    (n, m) => n + m.tradeSettlements.reduce((s, t) => s + t.transactionCount, 0),
    0,
  )
  const expenseInMonthly = state.monthlyCloses.reduce(
    (n, m) => n + m.expenseSettlements.reduce((s, e) => s + e.expenseCount, 0),
    0,
  )
  const pendingExpenses = state.transactions.filter((t) => t.category === 'expense').length
  const pendingTrades = state.transactions.filter(
    (t) => t.category === 'usdt' || t.category === 'vn_trade',
  ).length
  return {
    pendingTx: state.transactions.length,
    pendingExpenses,
    pendingTrades,
    settlements: state.settlements.length,
    monthlyCloses: state.monthlyCloses.length,
    tradeArchived: tradeInMonthly,
    expenseArchived: expenseInMonthly,
    balances: state.openingBalances,
    lastMonthly: state.monthlyCloses[0]?.periodLabel,
    lastProfit: state.monthlyCloses[0]?.netProfit,
  }
}

async function apiPut(state: SimState) {
  const res = await fetch(`${API_BASE}/api/state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(serializeState(state)),
  })
  if (!res.ok) throw new Error(`PUT ${res.status}: ${await res.text()}`)
  return res.json()
}

async function apiGet() {
  const res = await fetch(`${API_BASE}/api/state`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  })
  if (!res.ok) throw new Error(`GET ${res.status}`)
  return res.json() as Promise<PersistedAppState | null>
}

async function main() {
  console.log('=== Realistic E2E: 5 rounds 月结 + 第 6 轮留进行中（不月结）===\n')

  const health = await fetch(`${API_BASE}/health`).then((r) => r.json())
  if (health.status !== 'ok') throw new Error('Backend down')
  console.log('Health:', health)

  const state = freshState()
  for (let r = 0; r < 5; r++) {
    runOneRound(state, r)
    const s = state.monthlyCloses[0]
    console.log(
      `Round ${r + 1} done: ${s?.periodLabel} | 日交易 ${s?.tradeSettlements[0]?.transactionCount} 笔 | 开销 ${s?.expenseSettlements[0]?.expenseCount} 笔 | 净利 ${s?.netProfit?.toFixed(0)} TWD`,
    )
  }

  // 第 6 轮：买卖 + 开销 + 日结，不月结
  runOneRound(state, 5, { skipMonthlyClose: true })
  const pendingExp = state.transactions.filter((t) => t.category === 'expense').length
  console.log(
    `Round 6 done (no 月结): 待月结日结 ${state.settlements.length} 笔 | 进行中开销 ${pendingExp} 笔 | 每日明細交易 0（已日结）`,
  )

  const totalTx =
    report.usdtBuy +
    report.usdtSell +
    report.vnBuyTwd +
    report.vnBuyUsdt +
    report.vnSellTwd +
    report.vnSellUsdt +
    report.expense

  console.log('\n--- 操作统计 ---')
  console.log({
    usdtBuy: report.usdtBuy,
    usdtSell: report.usdtSell,
    vnBuyTwd: report.vnBuyTwd,
    vnBuyUsdt: report.vnBuyUsdt,
    vnSellTwd: report.vnSellTwd,
    vnSellUsdt: report.vnSellUsdt,
    expense: report.expense,
    totalTx,
    tradeSettles: report.tradeSettles,
    monthlyCloses: report.monthlyCloses,
    skippedFallback: report.skipped,
  })

  console.log('\n--- PUT → GET → GET ---')
  await apiPut(state)
  const get1 = parseLoaded(await apiGet())
  const get2 = parseLoaded(await apiGet())

  const s0 = summary(state)
  const s1 = summary(get1)
  const s2 = summary(get2)
  console.log('Local :', s0)
  console.log('GET #1:', s1)
  console.log('GET #2:', s2)

  const checks: [string, boolean][] = [
    ['5 monthly closes (round 6 skipped)', s1.monthlyCloses === 5],
    ['6 trade daily settles (incl. round 6)', report.tradeSettles === 6],
    ['~300 total tx (50×6)', totalTx >= 290 && totalTx <= 310],
    ['trade archived in monthly (~196)', s1.tradeArchived >= 190 && s1.tradeArchived <= 200],
    ['50 expenses archived in monthly (10×5)', s1.expenseArchived === 50],
    ['round 6: 1 pending daily settlement', s1.settlements === 1],
    ['round 6: 10 pending expenses', s1.pendingExpenses === 10],
    ['round 6: no pending trades (日结后)', s1.pendingTrades === 0],
    ['refresh stable', JSON.stringify(s1) === JSON.stringify(s2)],
    ['persist matches', JSON.stringify(s0) === JSON.stringify(s1)],
    ['60 expense entries total', report.expense === 60],
  ]

  console.log('\n=== Results ===')
  let ok = true
  for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`)
    if (!pass) ok = false
  }

  if (!ok) process.exit(1)
  console.log('\nALL CHECKS PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
