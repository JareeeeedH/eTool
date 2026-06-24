import type {
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
  TradeSettleConfirmSummary,
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
  formatRateDisplay,
  formatSettlementDate,
  formatTwd,
  formatVnTradeRateDisplay,
  roundVnTradeRate,
} from '../utils/format'

export function isExpenseTransaction(tx: Transaction): tx is ExpenseTransaction {
  return tx.category === 'expense'
}

export function isUsdtTransaction(tx: Transaction): tx is UsdtTransaction {
  return tx.category === 'usdt'
}

export function isVnTradeTransaction(tx: Transaction): tx is VnTradeTransaction {
  return tx.category === 'vn_trade'
}

export function filterUsdtTransactions(transactions: Transaction[]): UsdtTransaction[] {
  return transactions.filter(isUsdtTransaction)
}

export function filterVnTradeTransactions(transactions: Transaction[]): VnTradeTransaction[] {
  return transactions.filter(isVnTradeTransaction)
}

export function filterExpenseTransactions(transactions: Transaction[]): ExpenseTransaction[] {
  return transactions.filter(isExpenseTransaction)
}

export function filterTradeTransactions(transactions: Transaction[]): Array<
  UsdtTransaction | VnTradeTransaction
> {
  return transactions.filter(
    (tx): tx is UsdtTransaction | VnTradeTransaction =>
      isUsdtTransaction(tx) || isVnTradeTransaction(tx),
  )
}

/** 最近一次交易日結時間；該時間點前的流水已納入 openingBalances */
export function getLastTradeSettlementAt(
  settlements: DailySettlement[],
): Date | null {
  return settlements[0]?.settledAt ?? null
}

export function filterBalanceAffectingTransactions(
  transactions: Transaction[],
  lastTradeSettledAt: Date | null,
): Transaction[] {
  if (!lastTradeSettledAt) return transactions
  const cutoff = lastTradeSettledAt.getTime()
  return transactions.filter((tx) => tx.timestamp.getTime() > cutoff)
}

export function normalizeVnTradeTransaction(tx: VnTradeTransaction): VnTradeTransaction {
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

export function vnTradePayAmount(tx: VnTradeTransaction): number {
  return tx.payCurrency === 'usdt' ? tx.usdtAmount : tx.twdAmount
}

export function computeTotalAssetsTwd(
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

export function calculateVnTwdRate(vnAmount: number, twdAmount: number): number {
  if (twdAmount <= 0) return 0
  return roundVnTradeRate(vnAmount / twdAmount)
}

export function createUsdtInventoryState(
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

export function usdtUnitCostTwd(
  state: UsdtInventoryState,
  openingCost: UsdtInventoryCost,
): number | null {
  if (state.usdtQty > 0 && state.twdCostTotal > 0) {
    return state.twdCostTotal / state.usdtQty
  }
  return openingCost.twd
}

export function applyUsdtInventoryTransaction(
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
export function computeVnTwdCostAverageRate(
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

export function calculateVnBuyDayAverageRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  return computeVnTwdCostAverageRate(openingBalances, openingCost, transactions)
}

/** 當日 VN 買入加權均價（1 USDT = ? VN） */
export function computeVnUsdtCostAverageRate(
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

export function calculateVnBuyDayAverageUsdtRate(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number | null {
  return computeVnUsdtCostAverageRate(openingBalances, openingCost, transactions)
}

/** 當日 VN 賣出成交均價（VN/TWD 加權；USDT 收款依當下 U 池成本換算） */
export function computeVnSellDayAverageRate(
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

export function computeVnTradeAnalytics(
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

export function computeVnDayTotalProfit(
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

export function settlementFromTotalAssets(assets: TotalAssetsTwd): Pick<
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

export function totalAssetsFromSettlement(item: DailySettlement): TotalAssetsTwd {
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

export function calculateAverageRate(
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
export function calculateBuyDayAverageRate(
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
export function computeInventoryCost(
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
export function computeSellProfitById(
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

export function computeUsdtDayTotalProfit(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: UsdtTransaction[],
): number {
  const profitById = computeSellProfitById(openingBalances, openingCost, transactions)
  return transactions
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + (profitById.get(tx.id)?.profit ?? 0), 0)
}

export function computeDayExpenseTotal(transactions: Transaction[]): number {
  return filterExpenseTransactions(transactions).reduce(
    (sum, tx) => sum + tx.amountTwd,
    0,
  )
}

export function computePendingExpenseBreakdown(
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

export function buildExpenseSettlementFromPending(
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

export function assembleExpenseSettlementsForMonthlyClose(
  buffered: ExpenseSettlement[],
  pending: ExpenseTransaction[],
  balances: Balances,
): ExpenseSettlement[] {
  const result = buffered.map(cloneExpenseSettlement)
  const fromPending = buildExpenseSettlementFromPending(pending, balances)
  if (fromPending) result.push(fromPending)
  return result
}

export function cloneDailySettlement(item: DailySettlement): DailySettlement {
  return { ...item, settledAt: new Date(item.settledAt) }
}

export function cloneExpenseSettlement(item: ExpenseSettlement): ExpenseSettlement {
  return {
    ...item,
    settledAt: new Date(item.settledAt),
    items: item.items.map((entry) => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
    })),
  }
}

export function computeExpenseByCategory(
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

export function computeArchivedDateRange(
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

export function suggestMonthlyPeriodLabel(): string {
  return `${new Date().getMonth() + 1}月份`
}

export function buildMonthlyClosePreview(
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

/**
 * 由本期庫存成本計價帳面與淨利反推期初帳面。
 * 期初 + 淨利 = 期末（帳面），避免用「首日結總資產 − 當日毛利」
 * （該算法會把日結前已扣的開銷誤算進期初，造成開銷在月報表雙重扣除）。
 */
export function inferOpeningTotalAssets(
  closingBookTotal: number,
  netProfit: number,
): number {
  return closingBookTotal - netProfit
}

export function normalizeMonthlyCloseRecord(item: MonthlyClose): MonthlyClose & { openingTotalAssets: number } {
  const closingBookTotalAssets = item.closingBookTotalAssets ?? item.closingTotalAssets
  const openingTotalAssets = closingBookTotalAssets - item.netProfit

  return {
    ...item,
    openingTotalAssets,
    closingBookTotalAssets,
    closingTotalAssets: openingTotalAssets + item.netProfit,
  }
}

export function normalizeLoadedSettlement(item: DailySettlement): DailySettlement {
  return {
    ...item,
    settledAt: new Date(item.settledAt),
    dayVnUsdtRate: item.dayVnUsdtRate ?? null,
  }
}

export function buildMonthlyClose(
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
  const openingTotalAssets = inferOpeningTotalAssets(fallbackTotalAssets, netProfit)

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

export function settlementHasSplitProfit(item: DailySettlement): boolean {
  return item.dayUsdtProfit !== undefined && item.dayVnProfit !== undefined
}
export function getBusinessDayLabel(transactions: Transaction[]): string {
  if (transactions.length > 0) {
    const earliest = [...transactions].reduce((min, tx) =>
      tx.timestamp.getTime() < min.timestamp.getTime() ? tx : min,
    )
    return formatSettlementDate(earliest.timestamp)
  }
  return formatSettlementDate(new Date())
}

export function buildDeleteConfirmLines(tx: Transaction): string[] {
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
      `匯率 (${rateUnit})：${formatVnTradeRateDisplay(tx.rate)}`,
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

export function buildTradeSettleConfirmSummary(
  transactions: Transaction[],
  openingBalances: Balances,
  openingUsdtCost: UsdtInventoryCost,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
): TradeSettleConfirmSummary {
  const usdtTxs = filterUsdtTransactions(transactions)
  const vnTxs = filterVnTradeTransactions(transactions)
  const usdtBuy = usdtTxs.filter((tx) => tx.type === 'buy').length
  const usdtSell = usdtTxs.filter((tx) => tx.type === 'sell').length
  const vnBuy = vnTxs.filter((tx) => tx.type === 'buy').length
  const vnSell = vnTxs.filter((tx) => tx.type === 'sell').length
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
  const hasSells = usdtSell > 0 || vnSell > 0

  return {
    tradeCount: usdtTxs.length + vnTxs.length,
    usdtBuy,
    usdtSell,
    vnBuy,
    vnSell,
    showVn: vnTxs.length > 0,
    dayUsdtProfit: usdtSell > 0 ? dayUsdtProfit : null,
    dayVnProfit: vnSell > 0 ? dayVnProfit : null,
    dayTotalProfit: dayUsdtProfit + dayVnProfit,
    hasSells,
  }
}
export function applyExpenseTransaction(balances: Balances, tx: ExpenseTransaction): Balances {
  return {
    ...balances,
    twd: balances.twd - tx.amountTwd,
  }
}

export function applyUsdtTransaction(balances: Balances, tx: UsdtTransaction): Balances {
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

export function applyVnTradeTransaction(balances: Balances, tx: VnTradeTransaction): Balances {
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

export function applyTransaction(balances: Balances, tx: Transaction): Balances {
  if (isExpenseTransaction(tx)) return applyExpenseTransaction(balances, tx)
  if (isUsdtTransaction(tx)) return applyUsdtTransaction(balances, tx)
  return applyVnTradeTransaction(balances, tx)
}

export function recalculateBalances(
  transactions: Transaction[],
  openingBalances: Balances = INITIAL_BALANCES,
  lastTradeSettledAt: Date | null = null,
): Balances {
  const applicable = filterBalanceAffectingTransactions(
    transactions,
    lastTradeSettledAt,
  )
  const sorted = [...applicable].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  return sorted.reduce((balances, tx) => applyTransaction(balances, tx), {
    ...openingBalances,
  })
}

export function validateTransactions(
  transactions: Transaction[],
  openingBalances: Balances = INITIAL_BALANCES,
  lastTradeSettledAt: Date | null = null,
): string | null {
  const applicable = filterBalanceAffectingTransactions(
    transactions,
    lastTradeSettledAt,
  )
  const sorted = [...applicable].sort(
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
export function openingBalanceToForm(
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
export function normalizeLoadedTransactions(transactions: Transaction[]): Transaction[] {
  return transactions
    .filter(
      (tx) =>
        isUsdtTransaction(tx) || isVnTradeTransaction(tx) || isExpenseTransaction(tx),
    )
    .map((tx) => (isVnTradeTransaction(tx) ? normalizeVnTradeTransaction(tx) : tx))
}

export function normalizeMonthlyClose(item: MonthlyClose): MonthlyClose {
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
