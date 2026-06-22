/**
 * 瀏覽器 localStorage 持久化。
 * 之後接後端時，可改為同一介面：load → GET /state、save → PUT /state（或 WebSocket 同步）。
 */

const STORAGE_KEY = 'exchange-app-state'
const STORAGE_VERSION = 1

type PageTab =
  | 'daily'
  | 'expenses'
  | 'settlements'
  | 'monthly'
type DailyWorkTab = 'usdt' | 'vn'
type FiatCurrency = 'twd' | 'vn'
type TransactionType = 'buy' | 'sell'
type VnPayCurrency = 'twd' | 'usdt'
type ExpenseType = 'rent' | 'fuel' | 'parking' | 'meal' | 'telecom' | 'misc' | 'other'

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

interface VnTradeTransaction {
  id: string
  timestamp: Date
  category: 'vn_trade'
  type: TransactionType
  payCurrency: VnPayCurrency
  vnAmount: number
  twdAmount: number
  usdtAmount: number
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
  /** 期初 VN 庫存的 VN/TWD 成本均價（來自上次結算） */
  openingVnTwdRate?: number | null
  /** 期初 VN 庫存的 VN/USDT 成本均價（來自上次結算） */
  openingVnUsdtRate?: number | null
  transactions: Transaction[]
  settlements: DailySettlement[]
  expenseSettlements?: ExpenseSettlement[]
  monthlyCloses?: MonthlyClose[]
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

function parseVnPayCurrency(value: unknown): VnPayCurrency {
  return value === 'usdt' ? 'usdt' : 'twd'
}

function parseExpenseType(value: unknown): ExpenseType {
  const allowed: ExpenseType[] = [
    'rent',
    'fuel',
    'parking',
    'meal',
    'telecom',
    'misc',
    'other',
  ]
  return allowed.includes(value as ExpenseType) ? (value as ExpenseType) : 'other'
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

  if (payCurrency === 'usdt') {
    return {
      id,
      timestamp,
      category: 'vn_trade',
      type,
      payCurrency: 'usdt',
      vnAmount: parseNumber(value.vnAmount),
      twdAmount: 0,
      usdtAmount: usdtAmount > 0 ? usdtAmount : twdAmount,
      rate: parseNumber(value.rate),
    }
  }

  return {
    id,
    timestamp,
    category: 'vn_trade',
    type,
    payCurrency: 'twd',
    vnAmount: parseNumber(value.vnAmount),
    twdAmount,
    usdtAmount: 0,
    rate: parseNumber(value.rate),
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
    rent: 0,
    fuel: 0,
    parking: 0,
    meal: 0,
    telecom: 0,
    misc: 0,
    other: 0,
  }
  if (!isRecord(value)) return defaults
  for (const key of Object.keys(defaults) as ExpenseType[]) {
    defaults[key] = parseNumber(value[key])
  }
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

    const expenseSettlements = Array.isArray(parsed.expenseSettlements)
      ? parsed.expenseSettlements
          .map(parseExpenseSettlement)
          .filter((item): item is ExpenseSettlement => item !== null)
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
          : parsed.activeTab === 'expense_settlements'
            ? 'expenses'
            : parsed.activeTab === 'monthly'
              ? 'monthly'
              : 'daily'
    const dailyWorkTab: DailyWorkTab = parsed.dailyWorkTab === 'vn' ? 'vn' : 'usdt'

    return {
      activeTab,
      dailyWorkTab,
      openingBalances,
      openingUsdtCost,
      openingVnTwdRate: parseNullableNumber(parsed.openingVnTwdRate),
      openingVnUsdtRate: parseNullableNumber(parsed.openingVnUsdtRate),
      transactions,
      settlements,
      expenseSettlements,
      monthlyCloses,
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
