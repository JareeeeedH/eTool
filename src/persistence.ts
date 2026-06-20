/**
 * 瀏覽器 localStorage 持久化。
 * 之後接後端時，可改為同一介面：load → GET /state、save → PUT /state（或 WebSocket 同步）。
 */

const STORAGE_KEY = 'exchange-app-state'
const STORAGE_VERSION = 1

type PageTab = 'daily' | 'settlements'
type FiatCurrency = 'twd' | 'vn'
type TransactionType = 'buy' | 'sell'

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
  category: 'usdt'
  type: TransactionType
  fiatCurrency: FiatCurrency
  usdtAmount: number
  fiatAmount: number
  rate: number
}

interface VnTwdTransaction {
  id: string
  timestamp: Date
  category: 'vn_twd'
  vnAmount: number
  twdAmount: number
  rate: number
}

type Transaction = UsdtTransaction | VnTwdTransaction

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
  totalAssetsComplete: boolean
  totalAssetsMissingNotes: string
  transactionCount: number
}

export interface PersistedAppState {
  activeTab: PageTab
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  transactions: Transaction[]
  settlements: DailySettlement[]
}

interface PersistedPayloadV1 extends PersistedAppState {
  version: typeof STORAGE_VERSION
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

function parseTransaction(value: unknown): Transaction | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null

  const timestamp = new Date(String(value.timestamp))
  if (Number.isNaN(timestamp.getTime())) return null

  if (value.category === 'vn_twd') {
    return {
      id: value.id,
      timestamp,
      category: 'vn_twd',
      vnAmount: parseNumber(value.vnAmount),
      twdAmount: parseNumber(value.twdAmount),
      rate: parseNumber(value.rate),
    }
  }

  if (value.category !== 'usdt') return null
  if (value.type !== 'buy' && value.type !== 'sell') return null
  if (value.fiatCurrency !== 'twd' && value.fiatCurrency !== 'vn') return null

  return {
    id: value.id,
    timestamp,
    category: 'usdt',
    type: value.type,
    fiatCurrency: value.fiatCurrency,
    usdtAmount: parseNumber(value.usdtAmount),
    fiatAmount: parseNumber(value.fiatAmount),
    rate: parseNumber(value.rate),
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
    totalAssetsComplete: value.totalAssetsComplete === true,
    totalAssetsMissingNotes:
      typeof value.totalAssetsMissingNotes === 'string'
        ? value.totalAssetsMissingNotes
        : '',
    transactionCount: parseNumber(value.transactionCount),
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

export function loadPersistedAppState(): PersistedAppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null

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

    const activeTab: PageTab = parsed.activeTab === 'settlements' ? 'settlements' : 'daily'

    return {
      activeTab,
      openingBalances,
      openingUsdtCost,
      transactions,
      settlements,
    }
  } catch {
    return null
  }
}

export function savePersistedAppState(state: PersistedAppState): boolean {
  try {
    const payload: PersistedPayloadV1 = {
      version: STORAGE_VERSION,
      ...state,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}
