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
  formatSettlementDate,
  formatUsdtTradeRateDisplay,
  formatTwd,
  formatVnTradeRateDisplay,
  roundUsdtCostRate,
  roundVnPoolCostRate,
  roundVnTradeRate,
} from '../utils/format'

/**
 * =============================================================================
 * 每日交易核心域邏輯（成本池、均價、利潤）
 * =============================================================================
 *
 * 本檔為「怎麼算」的單一真相來源。UI（App / components）應呼叫此處函式，
 * 勿在畫面層重複實作成本或利潤公式，以免預覽與表格分叉（歷史上賣 U 曾因此出錯）。
 *
 * -----------------------------------------------------------------------------
 * 名詞
 * -----------------------------------------------------------------------------
 * - 「池 @」：庫存加權成本均價（E 卡 = U 兌台幣成本；V 卡 = 1 NTD / 1 U 各能買多少 VN）
 * - 「成交匯率」：單筆交易輸入的 rate，用於記錄與顯示；**利潤計算用池 @，不是成交匯率**
 * - 「數量變」vs「@ 變」：許多操作只改數量與成本總額；@ 僅在買入加倉時重算（見下表）
 *
 * -----------------------------------------------------------------------------
 * U 池（USDT 兌台幣成本 @）— 實作：applyUsdtInventoryTransaction
 * -----------------------------------------------------------------------------
 * | 操作              | U 數量 | U 池 @     | 說明 |
 * |-------------------|--------|------------|------|
 * | 台幣買 U          | ↑      | 重算加權   | twdCostTotal += 實付台幣 |
 * | 賣 U              | ↓      | 不變       | 依賣出比例扣數量與 twdCostTotal |
 * | 買 VN 花 U        | ↓      | 不變       | 同賣 U，按比例扣 |
 * | 賣 VN 收 U        | ↑      | 不變       | 數量 += 收到 U；twdCostTotal += U×當下池@（數學上 @ 不變） |
 *
 * 台幣現金增減由 recalculateBalances / applyUsdtTransaction 處理，不列入 U 池 @。
 *
 * -----------------------------------------------------------------------------
 * V 池（@台幣、@U）— 實作：computeVnTradeAnalytics 內 VN 池 walk
 * -----------------------------------------------------------------------------
 * | 操作              | VN 數量 | @台幣 / @U | 說明 |
 * |-------------------|---------|------------|------|
 * | 買 VN（付 T 或 U）| ↑       | 重算加權   | 兩腿成本分別累加（付 U 時 T 等值用當下 U 池 @ 換算） |
 * | 賣 VN（收 T 或 U）| ↓       | 不變       | 依賣出比例扣 vnQty 與兩腿成本總額 |
 *
 * 賣 VN 收台幣：只動 V 池與台幣餘額，不 walk U 池。
 * 期初僅有 @台幣時，可依 @台幣 × U 池 @ 推得 @U（createVnTradePoolState）。
 *
 * -----------------------------------------------------------------------------
 * 利潤（一律台幣；顯示 formatProfit → roundTwdTableCompact 萬位，四捨五入至小數第二位）
 * -----------------------------------------------------------------------------
 * - 賣 U：利潤 = 收款台幣 − 賣出 E × **該筆賣出前** U 池 @（round 3 位）
 * - 賣 VN 收 T：利潤 = 收款台幣 − VN ÷ **該筆賣出前** V@台幣
 * - 賣 VN 收 U：利潤 = 收到 U × **該筆賣出前** U 池 @ − VN ÷ **該筆賣出前** V@台幣
 *
 * 單筆利潤：computeSellProfitById（U）、computeVnTradeAnalytics.sellProfitById（VN）
 * 表單預覽：computeUsdtSellProfitPreview、computeVnSellProfitPreview（須與上列同一 walk）
 * 編輯舊賣單預覽：只 walk **時間上排在該筆之前**的交易（transactionsForProfitPreview）
 *
 * -----------------------------------------------------------------------------
 * 與「池 @」不同、勿混淆的顯示
 * -----------------------------------------------------------------------------
 * - 買 U 表 footer：當日買單加權 ΣT÷ΣE（calculateBuyDayAverageRate），≠ E 卡池 @
 * - 買 VN 日均：computeVnTwdCostAverageRate 等，≠ V 卡池 @
 * - 總資產 E 估值：floor(E × 池@)，可能與 twdCostTotal 差少量取整
 *
 * -----------------------------------------------------------------------------
 * 精度
 * -----------------------------------------------------------------------------
 * - U 池 @、賣 U 利潤用 @：roundUsdtCostRate（四捨五入 3 位小數）
 * - V 池 @：roundVnPoolCostRate（四捨五入 1 位小數）
 * - 利潤顯示：formatProfit → roundTwdTableCompact 萬位，四捨五入至小數第二位
 *
 * -----------------------------------------------------------------------------
 * 營業開銷
 * -----------------------------------------------------------------------------
 * - 進行中開銷僅紀錄，不參與 recalculateBalances（不扣台幣餘額、不影響總資產）
 * - 每日明細總覽、日結封存之庫存／總資產皆不含開銷
 * - 月結時：毛利 − 開銷 = 淨利；實際總資產 = 庫存計價帳面 − 本期開銷；並自期初台幣扣開銷
 *
 * -----------------------------------------------------------------------------
 * 異動本檔時請確認
 * -----------------------------------------------------------------------------
 * 1. 預覽、表格、日結是否仍呼叫同一套 walk（勿新增第二份 U 池更新邏輯）
 * 2. 賣出是否仍為「比例扣減、@ 不變」；買入是否仍為加權重算 @
 * 3. 賣 VN 收 U 是否仍按當下 U 池 @ 入帳（@ 數字不變、只增數量）
 * 4. 編輯賣單預覽是否仍只 walk 該筆之前的交易
 * 5. 建議以固定 fixture 手測或補單元測試後再改
 * =============================================================================
 */

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
  const openingUnitTwd =
    openingCost.twd !== null ? roundUsdtCostRate(openingCost.twd) : 0
  let twdCostTotal = openingUnitTwd * usdtQty
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
    return roundUsdtCostRate(state.twdCostTotal / state.usdtQty)
  }
  if (openingCost.twd !== null) {
    return roundUsdtCostRate(openingCost.twd)
  }
  return null
}

function vnPoolTwdRate(vnQty: number, vnTwdCostTotal: number): number | null {
  if (vnQty <= 0 || vnTwdCostTotal <= 0) return null
  return roundVnPoolCostRate(vnQty / vnTwdCostTotal)
}

/** 賣出：利潤用四捨五入 @；成本池依賣出比例扣減（均價不變，買入才重算） */
function applyUsdtSellToPool(
  usdtQty: number,
  twdCostTotal: number,
  sellUsdt: number,
): { usdtQty: number; twdCostTotal: number; unitCost: number | null; costBasis: number } {
  if (usdtQty <= 0 || sellUsdt <= 0) {
    return { usdtQty, twdCostTotal, unitCost: null, costBasis: 0 }
  }
  const unitCost = roundUsdtCostRate(twdCostTotal / usdtQty)
  const costBasis = sellUsdt * unitCost
  const sellRatio = Math.min(sellUsdt / usdtQty, 1)
  const nextUsdtQty = usdtQty - sellUsdt
  const nextTwdCostTotal = twdCostTotal * (1 - sellRatio)
  return {
    usdtQty: nextUsdtQty > 0 ? nextUsdtQty : 0,
    twdCostTotal: nextUsdtQty > 0 ? nextTwdCostTotal : 0,
    unitCost,
    costBasis,
  }
}

/**
 * 依序更新 U 成本池（總覽 E 卡 @、賣 U 利潤、VN 花 U／收 U 皆走此函式）。
 * 規則見本檔頂部「U 池」表；勿另寫第二份 walk。
 */
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
      const applied = applyUsdtSellToPool(
        state.usdtQty,
        state.twdCostTotal,
        tx.usdtAmount,
      )
      state.usdtQty = applied.usdtQty
      state.twdCostTotal = applied.twdCostTotal
      state.vnCostTotal *= 1 - sellRatio

      if (state.usdtQty <= 0) {
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
    const unitTwd = usdtUnitCostTwd(state, openingCost)
    if (unitTwd === null) return
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

interface VnTradePoolState {
  usdtState: UsdtInventoryState
  vnQty: number
  vnTwdCostTotal: number
  vnUsdtCostTotal: number
}

function createVnTradePoolState(
  openingBalances: Balances,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  openingUsdtCost: UsdtInventoryCost,
): VnTradePoolState {
  const usdtState = createUsdtInventoryState(openingBalances, openingUsdtCost)
  let vnQty = openingBalances.vn
  let vnTwdCostTotal =
    openingVnTwdRate !== null && openingVnTwdRate > 0 && vnQty > 0
      ? vnQty / roundVnPoolCostRate(openingVnTwdRate)
      : 0
  let vnUsdtCostTotal =
    openingVnUsdtRate !== null && openingVnUsdtRate > 0 && vnQty > 0
      ? vnQty / roundVnPoolCostRate(openingVnUsdtRate)
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
    const vnTwdRate = roundVnPoolCostRate(openingVnTwdRate)
    const usdtTwd = roundUsdtCostRate(openingUsdtCost.twd)
    vnUsdtCostTotal = vnQty / (vnTwdRate * usdtTwd)
  }

  if (vnQty <= 0) {
    vnTwdCostTotal = 0
    vnUsdtCostTotal = 0
  }

  return { usdtState, vnQty, vnTwdCostTotal, vnUsdtCostTotal }
}

function computeVnSellProfitAtPools(
  pools: VnTradePoolState,
  openingUsdtCost: UsdtInventoryCost,
  vnAmount: number,
  payCurrency: VnPayCurrency,
  twdAmount: number,
  usdtAmount: number,
): SellProfitInfo {
  const vnUnitTwdRate = vnPoolTwdRate(pools.vnQty, pools.vnTwdCostTotal)
  const costBasis =
    vnUnitTwdRate !== null && vnUnitTwdRate > 0 ? vnAmount / vnUnitTwdRate : 0
  const usdtUnit = usdtUnitCostTwd(pools.usdtState, openingUsdtCost)
  const proceeds =
    payCurrency === 'twd'
      ? twdAmount
      : usdtUnit !== null
        ? usdtAmount * usdtUnit
        : 0

  return {
    unitCost: vnUnitTwdRate,
    costBasis,
    profit: proceeds - costBasis,
  }
}

function applyVnTradeBuyToPools(
  pools: VnTradePoolState,
  tx: VnTradeTransaction,
  openingUsdtCost: UsdtInventoryCost,
): void {
  if (tx.type !== 'buy') return

  const usdtUnit = usdtUnitCostTwd(pools.usdtState, openingUsdtCost)
  pools.vnQty += tx.vnAmount
  if (tx.payCurrency === 'twd') {
    pools.vnTwdCostTotal += tx.twdAmount
    if (usdtUnit !== null && usdtUnit > 0) {
      pools.vnUsdtCostTotal += tx.twdAmount / usdtUnit
    }
  } else if (usdtUnit !== null && usdtUnit > 0) {
    pools.vnTwdCostTotal += tx.usdtAmount * usdtUnit
    pools.vnUsdtCostTotal += tx.usdtAmount
  }
}

function applyVnTradeSellPoolReduction(
  pools: VnTradePoolState,
  vnAmount: number,
): void {
  if (pools.vnQty <= 0) return

  const sellRatio = Math.min(vnAmount / pools.vnQty, 1)
  pools.vnTwdCostTotal *= 1 - sellRatio
  pools.vnUsdtCostTotal *= 1 - sellRatio
  pools.vnQty -= vnAmount

  if (pools.vnQty <= 0) {
    pools.vnQty = 0
    pools.vnTwdCostTotal = 0
    pools.vnUsdtCostTotal = 0
  }
}

function walkTransactionsThroughVnPools(
  pools: VnTradePoolState,
  openingUsdtCost: UsdtInventoryCost,
  transactions: Transaction[],
): void {
  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx)) {
      if (tx.type === 'buy') {
        applyVnTradeBuyToPools(pools, tx, openingUsdtCost)
      } else {
        applyVnTradeSellPoolReduction(pools, tx.vnAmount)
      }
    }

    applyUsdtInventoryTransaction(pools.usdtState, tx, openingUsdtCost)
  }
}

function sortTransactionsChronologically(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )
}

/**
 * 編輯既有賣單預覽：只 walk 該筆「時間上之前」的交易（不含該筆與之後）。
 * 與 computeSellProfitById 在該筆賣出當下取 @ 一致。
 */
function transactionsForProfitPreview(
  transactions: Transaction[],
  excludeTransactionId?: string | null,
): Transaction[] {
  if (!excludeTransactionId) return transactions

  const sorted = sortTransactionsChronologically(transactions)
  const excludeIndex = sorted.findIndex((tx) => tx.id === excludeTransactionId)
  if (excludeIndex < 0) return transactions

  return sorted.slice(0, excludeIndex)
}

/** 賣 U 表單預覽利潤（與表格 computeSellProfitById 相同池子 walk） */
export function computeUsdtSellProfitPreview(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
  usdtAmount: number,
  fiatAmount: number,
  excludeTransactionId?: string | null,
): SellProfitInfo | null {
  if (usdtAmount <= 0 || fiatAmount <= 0) return null

  const state = createUsdtInventoryState(openingBalances, openingCost)
  const sorted = sortTransactionsChronologically(
    transactionsForProfitPreview(transactions, excludeTransactionId),
  )

  for (const tx of sorted) {
    applyUsdtInventoryTransaction(state, tx, openingCost)
  }

  const unitCost =
    state.usdtQty > 0 && state.twdCostTotal > 0
      ? roundUsdtCostRate(state.twdCostTotal / state.usdtQty)
      : null
  if (unitCost === null) return null

  const costBasis = usdtAmount * unitCost
  return {
    unitCost,
    costBasis,
    profit: fiatAmount - costBasis,
  }
}

/** 賣 VN 表單預覽利潤（與表格 computeVnTradeAnalytics 相同池子 walk） */
export function computeVnSellProfitPreview(
  openingBalances: Balances,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  openingUsdtCost: UsdtInventoryCost,
  transactions: Transaction[],
  vnAmount: number,
  payCurrency: VnPayCurrency,
  payAmount: number,
  excludeTransactionId?: string | null,
): SellProfitInfo | null {
  if (vnAmount <= 0 || payAmount <= 0) return null

  const pools = createVnTradePoolState(
    openingBalances,
    openingVnTwdRate,
    openingVnUsdtRate,
    openingUsdtCost,
  )
  walkTransactionsThroughVnPools(
    pools,
    openingUsdtCost,
    transactionsForProfitPreview(transactions, excludeTransactionId),
  )

  const vnUnitTwdRate = vnPoolTwdRate(pools.vnQty, pools.vnTwdCostTotal)
  if (vnUnitTwdRate === null || vnUnitTwdRate <= 0) return null

  if (payCurrency === 'usdt') {
    const usdtUnit = usdtUnitCostTwd(pools.usdtState, openingUsdtCost)
    if (usdtUnit === null || usdtUnit <= 0) return null
  }

  return computeVnSellProfitAtPools(
    pools,
    openingUsdtCost,
    vnAmount,
    payCurrency,
    payCurrency === 'twd' ? payAmount : 0,
    payCurrency === 'usdt' ? payAmount : 0,
  )
}

export function computeVnTradeAnalytics(
  openingBalances: Balances,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  openingUsdtCost: UsdtInventoryCost,
  transactions: Transaction[],
): VnTradeAnalytics {
  const pools = createVnTradePoolState(
    openingBalances,
    openingVnTwdRate,
    openingVnUsdtRate,
    openingUsdtCost,
  )

  const buyImpliedTwdRateById = new Map<string, number>()
  const buyImpliedUsdtRateById = new Map<string, number>()
  const sellProfitById = new Map<string, SellProfitInfo>()

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx)) {
      if (tx.type === 'buy') {
        const usdtUnit = usdtUnitCostTwd(pools.usdtState, openingUsdtCost)
        if (tx.payCurrency === 'twd') {
          buyImpliedTwdRateById.set(tx.id, tx.rate)
          if (usdtUnit !== null && usdtUnit > 0) {
            buyImpliedUsdtRateById.set(tx.id, tx.rate * usdtUnit)
          }
        } else if (usdtUnit !== null && usdtUnit > 0) {
          buyImpliedTwdRateById.set(tx.id, tx.rate / usdtUnit)
          buyImpliedUsdtRateById.set(tx.id, tx.rate)
        }

        applyVnTradeBuyToPools(pools, tx, openingUsdtCost)
      } else {
        sellProfitById.set(
          tx.id,
          computeVnSellProfitAtPools(
            pools,
            openingUsdtCost,
            tx.vnAmount,
            tx.payCurrency,
            tx.twdAmount,
            tx.usdtAmount,
          ),
        )
        applyVnTradeSellPoolReduction(pools, tx.vnAmount)
      }
    }

    applyUsdtInventoryTransaction(pools.usdtState, tx, openingUsdtCost)
  }

  return {
    buyImpliedTwdRateById,
    buyImpliedUsdtRateById,
    sellProfitById,
    currentVnTwdRate: vnPoolTwdRate(pools.vnQty, pools.vnTwdCostTotal),
    currentVnUsdtRate:
      pools.vnQty > 0 && pools.vnUsdtCostTotal > 0
        ? roundVnPoolCostRate(pools.vnQty / pools.vnUsdtCostTotal)
        : null,
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
  return roundUsdtCostRate(totalFiat / totalUsdt)
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
  return roundUsdtCostRate(totalFiat / totalUsdt)
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
  const state = createUsdtInventoryState(openingBalances, openingCost)

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  for (const tx of sorted) {
    applyUsdtInventoryTransaction(state, tx, openingCost)
  }

  return {
    twd:
      state.usdtQty > 0 && state.twdCostTotal > 0
        ? roundUsdtCostRate(state.twdCostTotal / state.usdtQty)
        : null,
    vn:
      state.usdtQty > 0 && state.vnCostTotal > 0
        ? state.vnCostTotal / state.usdtQty
        : null,
  }
}

/** 單筆賣 U 的成本與利潤（成本池 walk 與總覽 @ 一致） */
export function computeSellProfitById(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): Map<string, SellProfitInfo> {
  const state = createUsdtInventoryState(openingBalances, openingCost)

  const sorted = [...transactions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )
  const result = new Map<string, SellProfitInfo>()

  for (const tx of sorted) {
    if (isUsdtTransaction(tx) && tx.type === 'sell') {
      const unitCost =
        state.usdtQty > 0 && state.twdCostTotal > 0
          ? roundUsdtCostRate(state.twdCostTotal / state.usdtQty)
          : null
      const costBasis = unitCost !== null ? tx.usdtAmount * unitCost : 0
      result.set(tx.id, {
        unitCost,
        costBasis,
        profit: tx.fiatAmount - costBasis,
      })
    }

    applyUsdtInventoryTransaction(state, tx, openingCost)
  }

  return result
}

export function computeUsdtDayTotalProfit(
  openingBalances: Balances,
  openingCost: UsdtInventoryCost,
  transactions: Transaction[],
): number {
  const profitById = computeSellProfitById(openingBalances, openingCost, transactions)
  return filterUsdtTransactions(transactions)
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
  totalAssets: number,
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
    closingBookTotalAssets: totalAssets,
    closingTotalAssets: totalAssets - expenseTotal,
    dateRangeLabel: formatArchiveDateRange(start, end),
    pendingTradeCount,
    pendingExpenseCount: pendingExpenses.length,
  }
}

/**
 * 由本期庫存成本計價帳面與毛利反推期初帳面（開銷不計入帳面 walk，僅月結損益扣減）。
 * 期初 + 毛利 = 期末帳面（未扣開銷）。
 */
export function inferOpeningTotalAssets(
  closingBookTotal: number,
  grossProfit: number,
): number {
  return closingBookTotal - grossProfit
}

export function normalizeMonthlyCloseRecord(item: MonthlyClose): MonthlyClose & { openingTotalAssets: number } {
  const hasExplicitBook = item.closingBookTotalAssets !== undefined
  const closingBookTotalAssets = item.closingBookTotalAssets ?? item.closingTotalAssets
  const openingTotalAssets = closingBookTotalAssets - item.grossProfit
  const closingTotalAssets = hasExplicitBook
    ? item.closingBookTotalAssets! - item.expenseTotal
    : item.closingTotalAssets

  return {
    ...item,
    openingTotalAssets,
    closingBookTotalAssets,
    closingTotalAssets,
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
  const closingBookTotalAssets = fallbackTotalAssets
  const closingTotalAssets = closingBookTotalAssets - expenseTotal
  const openingTotalAssets = inferOpeningTotalAssets(closingBookTotalAssets, grossProfit)

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
    closingTotalAssets,
    closingBookTotalAssets,
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
    `匯率 (TWD/USDT)：${formatUsdtTradeRateDisplay(tx.rate)}`,
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
    transactions,
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
    filterTradeTransactions(transactions),
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
    filterTradeTransactions(transactions),
    lastTradeSettledAt,
  )
  const sorted = [...applicable].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  let balances = { ...openingBalances }

  for (const tx of sorted) {
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
