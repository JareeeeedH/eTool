/**
 * 持久化：僅 exchange-api（GET/PUT /api/state）。
 * 需在 .env 設定 VITE_API_BASE_URL；Bearer 來自 PIN 登入後的短效 session。
 */

import { apiAuthHeaders, noteUnauthorizedStatus } from './api/http'
import { getApiSessionToken } from './auth/sessionToken'

const STORAGE_VERSION = 1

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function getPersistenceConfigError(): string | null {
  if (!API_BASE_URL) return '請在 .env 設定 VITE_API_BASE_URL'
  if (!getApiSessionToken()) return '請先登入'
  return null
}

/** 開發環境且本機 API 已設定時，可顯示「從正式站拉取」按鈕 */
export function canPullProdStateToLocal(): boolean {
  return Boolean(import.meta.env.DEV && !getPersistenceConfigError())
}

/** 僅本機開發顯示「清空」，正式站不露出以免誤清 */
export function canResetAllLocally(): boolean {
  return Boolean(import.meta.env.DEV)
}

function apiHeaders(): HeadersInit {
  return apiAuthHeaders()
}

export type LoadPersistedResult =
  | { ok: true; state: PersistedAppState | null }
  | { ok: false; error: string }

type PageTab =
  | 'daily'
  | 'expenses'
  | 'cumulative_expenses'
  | 'settlements'
  | 'monthly'
  | 'notes'
type DailyWorkTab = 'usdt' | 'vn'
type FiatCurrency = 'twd' | 'vn'
type TransactionType = 'buy' | 'sell'
type VnPayCurrency = 'twd' | 'usdt'
type UsdtCabin = 'A' | 'B' | 'C'
type ExpenseType = 'fuel' | 'parking' | 'meal' | 'traffic' | 'other'

interface Balances {
  twd: number
  usdt: number
  vn: number
}

interface UsdtInventoryCost {
  twd: number | null
  vn: number | null
}

interface UsdtTransaction {
  id: string
  timestamp: Date
  tradeDate?: string
  category: 'usdt'
  type: TransactionType
  fiatCurrency: FiatCurrency
  usdtAmount: number
  fiatAmount: number
  rate: number
  cabinAAmount?: number
  cabinBAmount?: number
  cabin?: UsdtCabin
  note?: string
}

interface VnTradeTransaction {
  id: string
  timestamp: Date
  tradeDate?: string
  category: 'vn_trade'
  type: TransactionType
  payCurrency: VnPayCurrency
  vnAmount: number
  twdAmount: number
  usdtAmount: number
  rate: number
  cabinAAmount?: number
  cabinBAmount?: number
  cabin?: UsdtCabin
  note?: string
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

interface DailySettlement {
  id: string
  settledAt: Date
  dateLabel: string
  twdBalance: number
  usdtBalance: number
  vnBalance: number
  usdtInventoryAvgTwd: number | null
  usdtInventoryAvgVn: number | null
  dayBuyAvgTwd: number | null
  dayBuyAvgVn: number | null
  totalAssetsTwd: number
  totalAssetsTwdCash: number
  totalAssetsUsdtInTwd: number | null
  totalAssetsVnInTwd: number | null
  dayVnTwdRate: number | null
  dayVnUsdtRate: number | null
  totalAssetsComplete: boolean
  totalAssetsMissingNotes: string
  transactionCount: number
  dayUsdtProfit?: number
  dayVnProfit?: number
  dayTotalProfit: number
  /** 舊版合併結算欄位，僅供歷史資料相容 */
  dayExpenseTotal?: number
  dayNetProfit?: number
  expenseCount?: number
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

interface CumulativeExpenseItem {
  amountTwd: number
  note: string
  timestamp: Date
}

interface CumulativeExpenseEntry {
  id: string
  timestamp: Date
  amountTwd: number
  note: string
  items?: CumulativeExpenseItem[]
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
  closingTotalAssets: number
  closingBookTotalAssets?: number
  tradeSettlements: DailySettlement[]
  expenseSettlements: ExpenseSettlement[]
}

export interface PersistedAppState {
  activeTab: PageTab
  dailyWorkTab?: DailyWorkTab
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  /** 期初 P 歸 A 艙數量 */
  openingUsdtCabinA?: number
  /** 期初 P 歸 B 艙數量；C = openingBalances.usdt − A − B（可含互轉偏移） */
  openingUsdtCabinB?: number
  /**
   * 目前 A/B/C 絕對數量快照（戶轉分倉／日常存檔都會更新）。
   * 重整後用來校正期初分倉，避免互轉結果遺失。
   */
  usdtCabinSnapshot?: { a: number; b: number; c: number }
  /** 期初 VN 庫存的 VN/TWD 成本均價（來自上次結算） */
  openingVnTwdRate?: number | null
  /** 期初 VN 庫存的 VN/USDT 成本均價（來自上次結算） */
  openingVnUsdtRate?: number | null
  transactions: Transaction[]
  settlements: DailySettlement[]
  expenseSettlements?: ExpenseSettlement[]
  cumulativeExpenses?: CumulativeExpenseEntry[]
  monthlyCloses?: MonthlyClose[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseUsdtCabinSnapshot(
  value: unknown,
): { a: number; b: number; c: number } | undefined {
  if (!isRecord(value)) return undefined
  const a = parseNumber(value.a, NaN)
  const b = parseNumber(value.b, NaN)
  const c = parseNumber(value.c, NaN)
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return undefined
  return { a, b, c }
}

function parseVnPayCurrency(value: unknown): VnPayCurrency {
  return value === 'usdt' ? 'usdt' : 'twd'
}

function parseUsdtCabin(value: unknown): UsdtCabin | undefined {
  return value === 'A' || value === 'B' || value === 'C' ? value : undefined
}

function parseExpenseType(value: unknown): ExpenseType {
  if (value === 'fuel' || value === 'parking' || value === 'meal' || value === 'traffic') {
    return value
  }
  if (value === 'other' || value === 'rent' || value === 'telecom' || value === 'misc') {
    return 'other'
  }
  return 'other'
}

function parseTradeDate(value: unknown): string | undefined {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return undefined
}

function parseTradeNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const note = value.trim()
  return note ? note : undefined
}

function parseVnTradeRecord(
  id: string,
  timestamp: Date,
  type: TransactionType,
  value: Record<string, unknown>,
): VnTradeTransaction {
  const payCurrency = parseVnPayCurrency(value.payCurrency)
  const twdAmount = parseNumber(value.twdAmount)
  const usdtAmount = parseNumber(value.usdtAmount)
  const tradeDate = parseTradeDate(value.tradeDate)

  if (payCurrency === 'usdt') {
    return {
      id,
      timestamp,
      tradeDate,
      category: 'vn_trade',
      type,
      payCurrency: 'usdt',
      vnAmount: parseNumber(value.vnAmount),
      twdAmount: 0,
      usdtAmount: usdtAmount > 0 ? usdtAmount : twdAmount,
      rate: parseNumber(value.rate),
      cabin: parseUsdtCabin(value.cabin),
      cabinAAmount: parseNullableNumber(value.cabinAAmount) ?? undefined,
      cabinBAmount: parseNullableNumber(value.cabinBAmount) ?? undefined,
      note: parseTradeNote(value.note),
    }
  }

  return {
    id,
    timestamp,
    tradeDate,
    category: 'vn_trade',
    type,
    payCurrency: 'twd',
    vnAmount: parseNumber(value.vnAmount),
    twdAmount,
    usdtAmount: 0,
    rate: parseNumber(value.rate),
    note: parseTradeNote(value.note),
  }
}

function parseTransaction(value: unknown): Transaction | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null

  const timestamp = new Date(String(value.timestamp))
  if (Number.isNaN(timestamp.getTime())) return null

  if (value.category === 'expense') {
    return {
      id: value.id,
      timestamp,
      category: 'expense',
      expenseType: parseExpenseType(value.expenseType),
      amountTwd: parseNumber(value.amountTwd),
      note: typeof value.note === 'string' ? value.note : '',
    }
  }

  if (value.category === 'vn_twd') {
    return parseVnTradeRecord(value.id, timestamp, 'sell', value)
  }

  if (value.category === 'vn_trade') {
    if (value.type !== 'buy' && value.type !== 'sell') return null
    return parseVnTradeRecord(value.id, timestamp, value.type, value)
  }

  if (value.category !== 'usdt') return null
  if (value.type !== 'buy' && value.type !== 'sell') return null
  if (value.fiatCurrency !== 'twd' && value.fiatCurrency !== 'vn') return null

  return {
    id: value.id,
    timestamp,
    tradeDate: parseTradeDate(value.tradeDate),
    category: 'usdt',
    type: value.type,
    fiatCurrency: value.fiatCurrency,
    usdtAmount: parseNumber(value.usdtAmount),
    fiatAmount: parseNumber(value.fiatAmount),
    rate: parseNumber(value.rate),
    cabin: parseUsdtCabin(value.cabin),
    cabinAAmount: parseNullableNumber(value.cabinAAmount) ?? undefined,
    cabinBAmount: parseNullableNumber(value.cabinBAmount) ?? undefined,
    note: parseTradeNote(value.note),
  }
}

function parseCumulativeExpenseItem(value: unknown): CumulativeExpenseItem | null {
  if (!isRecord(value)) return null
  const timestamp = new Date(String(value.timestamp))
  if (Number.isNaN(timestamp.getTime())) return null
  const amountTwd = parseNumber(value.amountTwd)
  if (amountTwd <= 0) return null
  return {
    amountTwd,
    note: typeof value.note === 'string' ? value.note : '',
    timestamp,
  }
}

function parseCumulativeExpenseEntry(value: unknown): CumulativeExpenseEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const timestamp = new Date(String(value.timestamp))
  if (Number.isNaN(timestamp.getTime())) return null
  const amountTwd = parseNumber(value.amountTwd)
  if (amountTwd <= 0) return null

  const items = Array.isArray(value.items)
    ? value.items
        .map(parseCumulativeExpenseItem)
        .filter((item): item is CumulativeExpenseItem => item !== null)
    : undefined

  return {
    id: value.id,
    timestamp,
    amountTwd,
    note: typeof value.note === 'string' ? value.note : '',
    items: items && items.length > 0 ? items : undefined,
  }
}

function parseSettlement(value: unknown): DailySettlement | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null

  const settledAt = new Date(String(value.settledAt))
  if (Number.isNaN(settledAt.getTime())) return null
  if (typeof value.dateLabel !== 'string') return null

  const twdBalance = parseNumber(value.twdBalance)
  const usdtBalance = parseNumber(value.usdtBalance)
  const vnBalance = parseNumber(value.vnBalance)

  return {
    id: value.id,
    settledAt,
    dateLabel: value.dateLabel,
    twdBalance,
    usdtBalance,
    vnBalance,
    usdtInventoryAvgTwd: parseNullableNumber(value.usdtInventoryAvgTwd),
    usdtInventoryAvgVn: parseNullableNumber(value.usdtInventoryAvgVn),
    dayBuyAvgTwd: parseNullableNumber(value.dayBuyAvgTwd),
    dayBuyAvgVn: parseNullableNumber(value.dayBuyAvgVn),
    totalAssetsTwd: parseNumber(value.totalAssetsTwd),
    totalAssetsTwdCash: parseNumber(value.totalAssetsTwdCash, twdBalance),
    totalAssetsUsdtInTwd: parseNullableNumber(value.totalAssetsUsdtInTwd),
    totalAssetsVnInTwd: parseNullableNumber(value.totalAssetsVnInTwd),
    dayVnTwdRate: parseNullableNumber(value.dayVnTwdRate),
    dayVnUsdtRate: parseNullableNumber(value.dayVnUsdtRate),
    totalAssetsComplete: value.totalAssetsComplete === true,
    totalAssetsMissingNotes:
      typeof value.totalAssetsMissingNotes === 'string'
        ? value.totalAssetsMissingNotes
        : '',
    transactionCount: parseNumber(value.transactionCount),
    dayUsdtProfit:
      value.dayUsdtProfit !== undefined && value.dayUsdtProfit !== null
        ? parseNumber(value.dayUsdtProfit)
        : undefined,
    dayVnProfit:
      value.dayVnProfit !== undefined && value.dayVnProfit !== null
        ? parseNumber(value.dayVnProfit)
        : undefined,
    dayTotalProfit: parseNumber(value.dayTotalProfit),
    dayExpenseTotal:
      value.dayExpenseTotal !== undefined && value.dayExpenseTotal !== null
        ? parseNumber(value.dayExpenseTotal)
        : undefined,
    dayNetProfit:
      value.dayNetProfit !== undefined && value.dayNetProfit !== null
        ? parseNumber(value.dayNetProfit)
        : undefined,
    expenseCount:
      value.expenseCount !== undefined && value.expenseCount !== null
        ? parseNumber(value.expenseCount)
        : undefined,
  }
}

function parseExpenseSettlementItem(value: unknown): ExpenseSettlementItem | null {
  if (!isRecord(value)) return null
  const timestamp = new Date(String(value.timestamp))
  if (Number.isNaN(timestamp.getTime())) return null
  return {
    expenseType: parseExpenseType(value.expenseType),
    amountTwd: parseNumber(value.amountTwd),
    note: typeof value.note === 'string' ? value.note : '',
    timestamp,
  }
}

function parseExpenseSettlement(value: unknown): ExpenseSettlement | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null

  const settledAt = new Date(String(value.settledAt))
  if (Number.isNaN(settledAt.getTime())) return null
  if (typeof value.dateLabel !== 'string') return null

  const items = Array.isArray(value.items)
    ? value.items
        .map(parseExpenseSettlementItem)
        .filter((item): item is ExpenseSettlementItem => item !== null)
    : []

  return {
    id: value.id,
    settledAt,
    dateLabel: value.dateLabel,
    twdBalance: parseNumber(value.twdBalance),
    expenseCount: parseNumber(value.expenseCount, items.length),
    expenseTotal: parseNumber(value.expenseTotal),
    items,
  }
}

function parseBalances(value: unknown): Balances | null {
  if (!isRecord(value)) return null
  return {
    twd: parseNumber(value.twd),
    usdt: parseNumber(value.usdt),
    vn: parseNumber(value.vn),
  }
}

function parseUsdtCost(value: unknown): UsdtInventoryCost | null {
  if (!isRecord(value)) return null
  return {
    twd: parseNullableNumber(value.twd),
    vn: parseNullableNumber(value.vn),
  }
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseExpenseByCategory(value: unknown): Record<ExpenseType, number> {
  const defaults: Record<ExpenseType, number> = {
    fuel: 0,
    parking: 0,
    meal: 0,
    traffic: 0,
    other: 0,
  }
  if (!isRecord(value)) return defaults
  defaults.fuel = parseNumber(value.fuel)
  defaults.parking = parseNumber(value.parking)
  defaults.meal = parseNumber(value.meal)
  defaults.traffic = parseNumber(value.traffic)
  defaults.other =
    parseNumber(value.other) +
    parseNumber(value.rent) +
    parseNumber(value.telecom) +
    parseNumber(value.misc)
  return defaults
}

function parseMonthlyClose(value: unknown): MonthlyClose | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  if (typeof value.periodLabel !== 'string') return null

  const closedAt = new Date(String(value.closedAt))
  if (Number.isNaN(closedAt.getTime())) return null

  const closingBalances = parseBalances(value.closingBalances)
  const closingUsdtCost = parseUsdtCost(value.closingUsdtCost)
  if (!closingBalances || !closingUsdtCost) return null

  const tradeSettlements = Array.isArray(value.tradeSettlements)
    ? value.tradeSettlements
        .map(parseSettlement)
        .filter((item): item is DailySettlement => item !== null)
    : []

  const expenseSettlements = Array.isArray(value.expenseSettlements)
    ? value.expenseSettlements
        .map(parseExpenseSettlement)
        .filter((item): item is ExpenseSettlement => item !== null)
    : []

  return {
    id: value.id,
    periodLabel: value.periodLabel,
    closedAt,
    actualStartDate: parseOptionalDate(value.actualStartDate),
    actualEndDate: parseOptionalDate(value.actualEndDate),
    grossProfit: parseNumber(value.grossProfit),
    usdtProfit: parseNumber(value.usdtProfit),
    vnProfit: parseNumber(value.vnProfit),
    expenseTotal: parseNumber(value.expenseTotal),
    netProfit: parseNumber(value.netProfit),
    expenseByCategory: parseExpenseByCategory(value.expenseByCategory),
    openingTotalAssets:
      value.openingTotalAssets !== undefined && value.openingTotalAssets !== null
        ? parseNumber(value.openingTotalAssets)
        : undefined,
    closingBalances,
    closingUsdtCost,
    closingVnTwdRate: parseNullableNumber(value.closingVnTwdRate),
    closingVnUsdtRate: parseNullableNumber(value.closingVnUsdtRate),
    closingTotalAssets: parseNumber(value.closingTotalAssets),
    closingBookTotalAssets:
      value.closingBookTotalAssets !== undefined && value.closingBookTotalAssets !== null
        ? parseNumber(value.closingBookTotalAssets)
        : undefined,
    tradeSettlements,
    expenseSettlements,
  }
}

function parsePersistedAppState(parsed: unknown): PersistedAppState | null {
  if (!isRecord(parsed)) return null
  if ('version' in parsed && parsed.version !== STORAGE_VERSION) return null

  const openingBalances = parseBalances(parsed.openingBalances)
  const openingUsdtCost = parseUsdtCost(parsed.openingUsdtCost)
  if (!openingBalances || !openingUsdtCost) return null

  const transactions = Array.isArray(parsed.transactions)
    ? parsed.transactions
        .map(parseTransaction)
        .filter((tx): tx is Transaction => tx !== null)
    : []

  const settlements = Array.isArray(parsed.settlements)
    ? parsed.settlements
        .map(parseSettlement)
        .filter((item): item is DailySettlement => item !== null)
    : []

  const expenseSettlements = Array.isArray(parsed.expenseSettlements)
    ? parsed.expenseSettlements
        .map(parseExpenseSettlement)
        .filter((item): item is ExpenseSettlement => item !== null)
    : []

  const cumulativeExpenses = Array.isArray(parsed.cumulativeExpenses)
    ? parsed.cumulativeExpenses
        .map(parseCumulativeExpenseEntry)
        .filter((item): item is CumulativeExpenseEntry => item !== null)
    : []

  const monthlyCloses = Array.isArray(parsed.monthlyCloses)
    ? parsed.monthlyCloses
        .map(parseMonthlyClose)
        .filter((item): item is MonthlyClose => item !== null)
    : []

  const activeTab: PageTab =
    parsed.activeTab === 'settlements'
      ? 'settlements'
      : parsed.activeTab === 'expenses'
        ? 'expenses'
        : parsed.activeTab === 'cumulative_expenses'
          ? 'cumulative_expenses'
        : parsed.activeTab === 'expense_settlements'
          ? 'expenses'
          : parsed.activeTab === 'monthly'
            ? 'monthly'
            : parsed.activeTab === 'notes'
              ? 'notes'
              : parsed.activeTab === 'cabins'
                ? 'daily'
                : 'daily'
  const dailyWorkTab: DailyWorkTab = parsed.dailyWorkTab === 'vn' ? 'vn' : 'usdt'

  return {
    activeTab,
    dailyWorkTab,
    openingBalances,
    openingUsdtCost,
    openingUsdtCabinA:
      parsed.openingUsdtCabinA === undefined || parsed.openingUsdtCabinA === null
        ? undefined
        : parseNumber(parsed.openingUsdtCabinA),
    openingUsdtCabinB:
      parsed.openingUsdtCabinB === undefined || parsed.openingUsdtCabinB === null
        ? undefined
        : parseNumber(parsed.openingUsdtCabinB),
    usdtCabinSnapshot: parseUsdtCabinSnapshot(parsed.usdtCabinSnapshot),
    openingVnTwdRate: parseNullableNumber(parsed.openingVnTwdRate),
    openingVnUsdtRate: parseNullableNumber(parsed.openingVnUsdtRate),
    transactions,
    settlements,
    expenseSettlements,
    cumulativeExpenses,
    monthlyCloses,
  }
}

export async function loadPersistedAppStateAsync(): Promise<LoadPersistedResult> {
  const configError = getPersistenceConfigError()
  if (configError) {
    return { ok: false, error: configError }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/state`, {
      headers: apiHeaders(),
    })
    if (!res.ok) {
      noteUnauthorizedStatus(res.status)
      return { ok: false, error: `讀取失敗（HTTP ${res.status}），請確認後端已啟動` }
    }

    const body: unknown = await res.json()
    if (body === null) {
      return { ok: true, state: null }
    }

    const parsed = parsePersistedAppState(body)
    if (!parsed) {
      return { ok: false, error: '後端資料格式錯誤' }
    }
    return { ok: true, state: parsed }
  } catch {
    return { ok: false, error: '無法連線後端，請確認 exchange-api 是否在跑' }
  }
}

export async function savePersistedAppStateAsync(state: PersistedAppState): Promise<boolean> {
  if (getPersistenceConfigError()) return false

  try {
    const res = await fetch(`${API_BASE_URL}/api/state`, {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(state),
    })
    if (!res.ok) {
      noteUnauthorizedStatus(res.status)
      let detail = ''
      try {
        detail = await res.text()
      } catch {
        // ignore
      }
      console.error('[persistence] PUT /api/state failed:', res.status, detail)
      return false
    }
    return true
  } catch (err) {
    console.error('[persistence] PUT /api/state error:', err)
    return false
  }
}

/**
 * 請本機後端從正式站唯讀拉取 /api/state 並寫入本機 DB。
 * 前端不會直接連正式站；正式站金鑰只放在本機 ex_back .env。
 */
export async function pullProdStateToLocalAsync(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!import.meta.env.DEV) {
    return { ok: false, error: '僅本機開發環境可用' }
  }
  const configError = getPersistenceConfigError()
  if (configError) return { ok: false, error: configError }

  try {
    const res = await fetch(`${API_BASE_URL}/api/dev/pull-prod`, {
      method: 'POST',
      headers: apiHeaders(),
    })
    if (res.ok) return { ok: true }

    noteUnauthorizedStatus(res.status)
    let message = `拉取失敗（HTTP ${res.status}）`
    try {
      const body: unknown = await res.json()
      if (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string'
      ) {
        message = (body as { error: string }).error
      }
    } catch {
      // ignore
    }
    return { ok: false, error: message }
  } catch {
    return { ok: false, error: '無法連線本機後端，請確認 exchange-api 是否在跑' }
  }
}

/** @deprecated 僅供 App.legacy；主程式請用 loadPersistedAppStateAsync */
export function loadPersistedAppState(): PersistedAppState | null {
  return null
}

/** @deprecated 僅供 App.legacy；主程式請用 savePersistedAppStateAsync */
export function savePersistedAppState(_state: PersistedAppState): boolean {
  return false
}
