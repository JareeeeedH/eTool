import type {
  Balances,
  CumulativeExpenseEntry,
  DailySettlement,
  ExpenseSettlement,
  ExpenseSettlementItem,
  ExpenseTransaction,
  ExpenseType,
  FiatCurrency,
  MonthlyClose,
  OpeningBalanceForm,
  Transaction,
  TransactionType,
  TotalAssetsTwd,
  UsdtCabin,
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
  USDT_CABIN_MIGRATE_TARGET_A,
} from '../constants'
import {
  dateInputValueFromDate,
  defaultTradeDateInputValue,
  expenseTypeLabel,
  floorTwd,
  formatArchiveDateRange,
  formatNumber,
  formatSettlementDate,
  formatUsdtTradeRateDisplay,
  formatTwdTableCompact,
  formatVnTableCompact,
  formatVnTradeRateDisplay,
  compareTradeListOrder,
  resolveSettlementArchiveDate,
  resolveTradeDate,
  roundUsdtCostRate,
  roundVnPoolCostRate,
  roundVnTradeRate,
  roundTwdTableCompact,
  sumRoundedProfitParts,
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
 * 畫面 @（凍結）與結算日寫入
 * -----------------------------------------------------------------------------
 * - 日間資產卡 @／≈T：只用**前一日結算**寫入的 openingUsdtCost / openingVn*Rate，不因當日買賣即時改 @
 * - 點結算後新 @ =（期初庫存數量 × 前日@ + 當日買入數量 × 當日買均）÷（期初 + 買入）
 *   無當日買入則沿用前日 @（例：無 IV 則 V@ 不變）
 * - 實作：computeSettleDayInventoryRates、computeTotalAssetsAtCostRates
 *
 * -----------------------------------------------------------------------------
 * 利潤 PF（結算日；一律台幣）
 * -----------------------------------------------------------------------------
 * 日間 OE／OV 表格**不顯示**單筆 PF；僅在結算時算當日總 PF（可封存逐筆）。
 * 成本用「最新 @」＝前日結算 @ 與當日買入均價加權（無買入則沿用前日；與結算快照同一套）。
 * - 賣 U：利潤 = 收款台幣 − 賣出 E × **最新 U@**（= E ×（當日賣均 − 最新 U@））
 * - 賣 VN 收 T：利潤 = 收款台幣（表列 T 縮寫還原加總口徑）− VN ÷ **最新 V@台幣**
 *   （等價：收款 ×（最新 V@ − 當日賣均）÷ 最新 V@）
 * - 賣 VN 收 U：利潤 = 收到 U × **最新 U@** − VN ÷ **最新 V@台幣**
 *
 * 實作：computeSettleDayUsdtSellProfitById / computeSettleDayVnSellProfitById
 * （舊版即時池 walk：computeSellProfitById、computeVnTradeAnalytics.sellProfitById，僅供對照／測試）
 *
 * -----------------------------------------------------------------------------
 * 與「凍結 @」不同、勿混淆的顯示
 * -----------------------------------------------------------------------------
 * - 買 U 表 footer：當日買單加權 ΣT÷ΣE（calculateBuyDayAverageRate），≠ 資產卡凍結 @
 * - 買 VN 日均：computeVnTwdCostAverageRate 等，≠ 資產卡凍結 @
 * - 總資產日間估值：floor(E × 前日U@)、floor(V ÷ 前日V@)；V 透支時為負估值
 *
 * -----------------------------------------------------------------------------
 * 精度
 * -----------------------------------------------------------------------------
 * - U @：roundUsdtCostRate（四捨五入 3 位小數）
 * - V 成交匯率 R：roundVnTradeRate（四捨五入 2 位小數）
 * - V 池／結算 @：roundVnPoolCostRate（四捨五入 2 位小數）
 * - 利潤顯示：formatProfit → roundTwdTableCompact 萬位，四捨五入至小數第二位
 * - SET 卡片 P／VN：有 sellProfitById 時用 settlementDisplaySplitProfits（逐筆先 round 再加），
 *   與明細 PF／組 footer 一致；勿用 raw dayVnProfit 再一次 round（會出現 1.78 vs 1.77）
 * - 分項合計：formatProfitFromParts / sumRoundedProfitParts
 *
 * -----------------------------------------------------------------------------
 * 營業開銷
 * -----------------------------------------------------------------------------
 * - 進行中開銷僅紀錄，不參與 recalculateBalances（不扣台幣餘額、不影響總資產）
 * - EXP 頁 RECON：彙總寫入 EXP.SUM、清除進行中開銷，並自帳上扣除（T／U）
 * - AL 結帳只封存交易，不處理開銷
 * - 月結時：毛利 − 開銷 = 淨利；實際總資產已含 RECON 扣帳（與帳面一致）
 *
 * -----------------------------------------------------------------------------
 * 異動本檔時請確認
 * -----------------------------------------------------------------------------
 * 1. 資產卡 @／日間總資產是否仍用 opening（凍結），勿改回即時池
 * 2. 結算 PF／新 @ 是否走 computeSettleDay*，與確認摘要一致
 * 3. 無當日買入時結算 @ 是否沿用前日
 * 4. 建議以固定 fixture（如本地 4 號）補單元測試後再改
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

/** 舊資料缺省視為日結開銷 */
export function expenseSourceOf(
  tx: ExpenseTransaction,
): NonNullable<ExpenseTransaction['expenseSource']> {
  return tx.expenseSource === 'standalone' ? 'standalone' : 'daily'
}

export function filterDailyExpenseTransactions(
  transactions: Transaction[],
): ExpenseTransaction[] {
  return filterExpenseTransactions(transactions).filter(
    (tx) => expenseSourceOf(tx) === 'daily',
  )
}

export function filterStandaloneExpenseTransactions(
  transactions: Transaction[],
): ExpenseTransaction[] {
  return filterExpenseTransactions(transactions).filter(
    (tx) => expenseSourceOf(tx) === 'standalone',
  )
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

/** 畫面顯示用 R：由 VN÷支付金額重算後四捨五入至小數第二位（避免舊資料曾存 1 位小數） */
export function vnTradeDisplayRate(tx: VnTradeTransaction): number {
  const pay = vnTradePayAmount(tx)
  if (pay > 0 && tx.vnAmount > 0) {
    return roundVnTradeRate(tx.vnAmount / pay)
  }
  return roundVnTradeRate(tx.rate)
}

/** 該筆交易是否會異動 USDT 數量 */
export function transactionMovesUsdt(tx: Transaction): boolean {
  if (isUsdtTransaction(tx)) return true
  return isVnTradeTransaction(tx) && tx.payCurrency === 'usdt'
}

export function resolveUsdtCabin(tx: UsdtTransaction | VnTradeTransaction): UsdtCabin {
  const a = resolveCabinAAmount(tx)
  const b = resolveCabinBAmount(tx)
  const c = resolveCabinCAmount(tx)
  if (a >= b && a >= c && a > 0) return 'A'
  if (b >= a && b >= c && b > 0) return 'B'
  if (c > 0) return 'C'
  return tx.cabin === 'A' || tx.cabin === 'C' ? tx.cabin : 'B'
}

/** 本筆歸 A 艙的 USDT 數量（0…usdtAmount） */
export function resolveCabinAAmount(tx: UsdtTransaction | VnTradeTransaction): number {
  const total = Math.max(0, tx.usdtAmount)
  if (typeof tx.cabinAAmount === 'number' && Number.isFinite(tx.cabinAAmount)) {
    return Math.min(Math.max(0, tx.cabinAAmount), total)
  }
  return tx.cabin === 'A' ? total : 0
}

/** 本筆歸 B 艙的 USDT 數量 */
export function resolveCabinBAmount(tx: UsdtTransaction | VnTradeTransaction): number {
  const total = Math.max(0, tx.usdtAmount)
  const a = resolveCabinAAmount(tx)
  if (typeof tx.cabinBAmount === 'number' && Number.isFinite(tx.cabinBAmount)) {
    return Math.min(Math.max(0, tx.cabinBAmount), Math.max(0, total - a))
  }
  // 明確 C 艙（或剩餘應歸 C）：不可走「其餘歸 B」的舊邏輯
  if (tx.cabin === 'C') return 0
  // 舊資料僅有 A 數量或單艙標籤：剩餘全歸 B（C=0）
  if (typeof tx.cabinAAmount === 'number' && Number.isFinite(tx.cabinAAmount)) {
    return Math.max(0, total - a)
  }
  if (tx.cabin === 'B') return total
  if (tx.cabin === 'A') return 0
  return Math.max(0, total - a)
}

export function resolveCabinCAmount(tx: UsdtTransaction | VnTradeTransaction): number {
  return Math.max(0, tx.usdtAmount) - resolveCabinAAmount(tx) - resolveCabinBAmount(tx)
}

/** 寫入交易時正規化艙位欄位 */
export function normalizeCabinAlloc(
  usdtAmount: number,
  cabinAAmount: number,
  cabinBAmount = 0,
): { cabinAAmount: number; cabinBAmount: number; cabin: UsdtCabin } {
  const total = Math.max(0, usdtAmount)
  const a = Math.min(Math.max(0, cabinAAmount), total)
  const b = Math.min(Math.max(0, cabinBAmount), Math.max(0, total - a))
  const c = Math.max(0, total - a - b)
  let cabin: UsdtCabin
  if (c > a && c > b) cabin = 'C'
  else if (b > a && b >= c) cabin = 'B'
  else if (a > 0) cabin = 'A'
  else if (b > 0) cabin = 'B'
  else if (c > 0) cabin = 'C'
  else cabin = 'A'
  return { cabinAAmount: a, cabinBAmount: b, cabin }
}

function usdtAmountMoved(tx: UsdtTransaction | VnTradeTransaction): number {
  if (isUsdtTransaction(tx)) return tx.usdtAmount
  return tx.usdtAmount
}

/**
 * 對 A/B/C 艙的 USDT 數量增減（買入／收 U 為正，賣出／付 U 為負）。
 * 支援一筆拆到多艙。
 */
export function usdtCabinSignedDeltas(
  tx: Transaction,
): { a: number; b: number; c: number } | null {
  if (!transactionMovesUsdt(tx)) return null
  if (isUsdtTransaction(tx)) {
    const aAmt = resolveCabinAAmount(tx)
    const bAmt = resolveCabinBAmount(tx)
    const cAmt = resolveCabinCAmount(tx)
    const sign = tx.type === 'buy' ? 1 : -1
    return { a: sign * aAmt, b: sign * bAmt, c: sign * cAmt }
  }
  if (isVnTradeTransaction(tx) && tx.payCurrency === 'usdt') {
    const aAmt = resolveCabinAAmount(tx)
    const bAmt = resolveCabinBAmount(tx)
    const cAmt = resolveCabinCAmount(tx)
    const sign = tx.type === 'buy' ? -1 : 1
    return { a: sign * aAmt, b: sign * bAmt, c: sign * cAmt }
  }
  return null
}

/** @deprecated 單艙介面；新邏輯請用 usdtCabinSignedDeltas */
export function usdtCabinDelta(tx: Transaction): { cabin: UsdtCabin; delta: number } | null {
  const signed = usdtCabinSignedDeltas(tx)
  if (!signed) return null
  const entries: Array<{ cabin: UsdtCabin; delta: number }> = [
    { cabin: 'A', delta: signed.a },
    { cabin: 'B', delta: signed.b },
    { cabin: 'C', delta: signed.c },
  ]
  const nonZero = entries.filter((e) => e.delta !== 0)
  if (nonZero.length === 1) return nonZero[0]
  nonZero.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
  return nonZero[0] ?? { cabin: 'B', delta: 0 }
}

export function computeUsdtCabinBalances(
  openingBalances: Balances,
  openingUsdtCabinA: number,
  transactions: Transaction[],
  lastTradeSettledAt: Date | null = null,
  openingUsdtCabinB = 0,
): { a: number; b: number; c: number } {
  const start = initialUsdtCabinSplit(
    openingBalances.usdt,
    openingUsdtCabinA,
    openingUsdtCabinB,
  )
  let a = start.a
  let b = start.b
  let c = start.c

  const applicable = filterBalanceAffectingTransactions(
    filterTradeTransactions(transactions),
    lastTradeSettledAt,
  )
  const sorted = [...applicable].sort(
    (x, y) => x.timestamp.getTime() - y.timestamp.getTime() || x.id.localeCompare(y.id),
  )

  for (const tx of sorted) {
    const moved = usdtCabinSignedDeltas(tx)
    if (!moved) continue
    a += moved.a
    b += moved.b
    c += moved.c
  }

  return { a, b, c }
}

/**
 * 期初分倉：openingUsdtCabinA/B 可超出合理區間以表達內部互轉。
 */
export function initialUsdtCabinSplit(
  openingUsdt: number,
  openingUsdtCabinA: number,
  openingUsdtCabinB = 0,
): { a: number; b: number; c: number } {
  const opening = Math.max(0, openingUsdt)
  const clampedA = Math.min(Math.max(0, openingUsdtCabinA), opening)
  const remainAfterA = Math.max(0, opening - clampedA)
  const clampedB = Math.min(Math.max(0, openingUsdtCabinB), remainAfterA)
  const transferA = openingUsdtCabinA - clampedA
  const transferB = openingUsdtCabinB - clampedB
  return {
    a: clampedA + transferA,
    b: clampedB + transferB,
    c: opening - clampedA - clampedB - transferA - transferB,
  }
}

/**
 * 舊資料遷移：A 艙目標 30000（不足則全給 A），其餘歸 B（C=0）。
 */
export function migrateUsdtCabinAttribution(
  openingBalances: Balances,
  openingUsdtCabinA: number | null | undefined,
  transactions: Transaction[],
  openingUsdtCabinB: number | null | undefined = undefined,
): {
  openingUsdtCabinA: number
  openingUsdtCabinB: number
  transactions: Transaction[]
  didMigrate: boolean
} {
  const hasOpeningCabin = typeof openingUsdtCabinA === 'number' && Number.isFinite(openingUsdtCabinA)
  const openingB =
    typeof openingUsdtCabinB === 'number' && Number.isFinite(openingUsdtCabinB)
      ? openingUsdtCabinB
      : 0
  const missingCabin = transactions.some((tx) => {
    if (!transactionMovesUsdt(tx)) return false
    if (!isUsdtTransaction(tx) && !(isVnTradeTransaction(tx) && tx.payCurrency === 'usdt')) {
      return false
    }
    const hasAmount = typeof tx.cabinAAmount === 'number' && Number.isFinite(tx.cabinAAmount)
    const hasTag = tx.cabin === 'A' || tx.cabin === 'B' || tx.cabin === 'C'
    return !hasAmount && !hasTag
  })

  const withCabinAmounts = (tx: Transaction, cabin: UsdtCabin): Transaction => {
    if (isUsdtTransaction(tx) || (isVnTradeTransaction(tx) && tx.payCurrency === 'usdt')) {
      const total = tx.usdtAmount
      const alloc =
        cabin === 'A'
          ? normalizeCabinAlloc(total, total, 0)
          : cabin === 'B'
            ? normalizeCabinAlloc(total, 0, total)
            : normalizeCabinAlloc(total, 0, 0)
      return { ...tx, ...alloc }
    }
    return tx
  }

  const fillAmounts = (tx: Transaction): Transaction => {
    if (!transactionMovesUsdt(tx)) return tx
    if (!isUsdtTransaction(tx) && !(isVnTradeTransaction(tx) && tx.payCurrency === 'usdt')) {
      return tx
    }
    if (typeof tx.cabinAAmount === 'number' && Number.isFinite(tx.cabinAAmount)) {
      const b =
        typeof tx.cabinBAmount === 'number' && Number.isFinite(tx.cabinBAmount)
          ? tx.cabinBAmount
          : undefined
      if (b !== undefined) {
        return { ...tx, ...normalizeCabinAlloc(tx.usdtAmount, tx.cabinAAmount, b) }
      }
      // 已標 C：剩餘歸 C；舊 2 艙僅 A → 剩餘歸 B
      if (tx.cabin === 'C') {
        return { ...tx, ...normalizeCabinAlloc(tx.usdtAmount, tx.cabinAAmount, 0) }
      }
      return {
        ...tx,
        ...normalizeCabinAlloc(
          tx.usdtAmount,
          tx.cabinAAmount,
          Math.max(0, tx.usdtAmount - tx.cabinAAmount),
        ),
      }
    }
    const tag = tx.cabin === 'A' || tx.cabin === 'C' ? tx.cabin : 'B'
    return withCabinAmounts(tx, tag)
  }

  if (hasOpeningCabin && !missingCabin) {
    const needsAmountFill = transactions.some((tx) => {
      if (!transactionMovesUsdt(tx)) return false
      if (!isUsdtTransaction(tx) && !(isVnTradeTransaction(tx) && tx.payCurrency === 'usdt')) {
        return false
      }
      const hasA = typeof tx.cabinAAmount === 'number' && Number.isFinite(tx.cabinAAmount)
      const hasB = typeof tx.cabinBAmount === 'number' && Number.isFinite(tx.cabinBAmount)
      return !hasA || !hasB
    })
    if (!needsAmountFill) {
      return {
        openingUsdtCabinA: openingUsdtCabinA,
        openingUsdtCabinB: openingB,
        transactions,
        didMigrate: false,
      }
    }
    return {
      openingUsdtCabinA: openingUsdtCabinA,
      openingUsdtCabinB: openingB,
      transactions: transactions.map(fillAmounts),
      didMigrate: true,
    }
  }

  if (hasOpeningCabin && missingCabin) {
    return {
      openingUsdtCabinA: openingUsdtCabinA,
      openingUsdtCabinB: openingB,
      transactions: transactions.map((tx) => {
        if (!transactionMovesUsdt(tx)) return tx
        if (isUsdtTransaction(tx) || (isVnTradeTransaction(tx) && tx.payCurrency === 'usdt')) {
          const cabin =
            tx.cabin === 'A' || tx.cabin === 'C' ? tx.cabin : ('B' as UsdtCabin)
          return withCabinAmounts(tx, cabin)
        }
        return tx
      }),
      didMigrate: true,
    }
  }

  const total = recalculateBalances(transactions, openingBalances).usdt
  const targetA = Math.min(USDT_CABIN_MIGRATE_TARGET_A, Math.max(0, total))
  const openingA = Math.min(targetA, Math.max(0, openingBalances.usdt))
  let need = targetA - openingA

  const sorted = [...transactions].sort(
    (x, y) => x.timestamp.getTime() - y.timestamp.getTime() || x.id.localeCompare(y.id),
  )
  const promoteToA = new Set<string>()

  for (const tx of sorted) {
    if (need <= 0) break
    if (!transactionMovesUsdt(tx)) continue
    const inflow =
      (isUsdtTransaction(tx) && tx.type === 'buy') ||
      (isVnTradeTransaction(tx) && tx.payCurrency === 'usdt' && tx.type === 'sell')
    if (!inflow) continue
    const amt = usdtAmountMoved(tx as UsdtTransaction | VnTradeTransaction)
    if (amt <= 0) continue
    promoteToA.add(tx.id)
    need -= amt
  }

  const nextTransactions = transactions.map((tx) => {
    if (!transactionMovesUsdt(tx)) return tx
    const cabin: UsdtCabin = promoteToA.has(tx.id) ? 'A' : 'B'
    return withCabinAmounts(tx, cabin)
  })

  return {
    openingUsdtCabinA: openingA,
    openingUsdtCabinB: 0,
    transactions: nextTransactions,
    didMigrate: true,
  }
}

/** 期初 USDT 增減時，同步調整 A/B 艙期初（優先動 A，再 B，再 C） */
export function adjustOpeningUsdtCabinA(
  prevOpeningUsdt: number,
  prevCabinA: number,
  nextOpeningUsdt: number,
  prevCabinB = 0,
): number {
  return adjustOpeningUsdtCabins(prevOpeningUsdt, prevCabinA, prevCabinB, nextOpeningUsdt).a
}

export function adjustOpeningUsdtCabins(
  prevOpeningUsdt: number,
  prevCabinA: number,
  prevCabinB: number,
  nextOpeningUsdt: number,
): { a: number; b: number } {
  const prev = Math.max(0, prevOpeningUsdt)
  const next = Math.max(0, nextOpeningUsdt)
  const start = initialUsdtCabinSplit(prev, prevCabinA, prevCabinB)
  const delta = next - prev
  if (delta >= 0) {
    // 新增庫存歸 A
    return { a: start.a + delta, b: start.b }
  }
  let reduce = -delta
  let a = start.a
  let b = start.b
  const fromA = Math.min(a, reduce)
  a -= fromA
  reduce -= fromA
  const fromB = Math.min(b, reduce)
  b -= fromB
  return { a, b }
}

/**
 * 期初 P 增減套用到指定艙位（以目前水位 A/B/C 為準反推 opening 分倉）。
 * 扣減時該艙必須夠扣。
 */
export function applyOpeningUsdtDeltaToCabin(
  openingUsdtCabinA: number,
  openingUsdtCabinB: number,
  current: { a: number; b: number; c: number },
  delta: number,
  cabin: UsdtCabin,
  nextLiveTotalUsdt: number,
): { ok: true; a: number; b: number } | { ok: false; error: string } {
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: true, a: openingUsdtCabinA, b: openingUsdtCabinB }
  }
  const bal = cabin === 'A' ? current.a : cabin === 'B' ? current.b : current.c
  if (delta < 0 && bal + delta < -1e-9) {
    return { ok: false, error: `${cabin} 不夠扣（目前 ${bal}）` }
  }
  const targetA = cabin === 'A' ? current.a + delta : current.a
  const targetB = cabin === 'B' ? current.b + delta : current.b
  const next = openingUsdtCabinsAfterRebalance(
    openingUsdtCabinA,
    openingUsdtCabinB,
    { a: current.a, b: current.b },
    targetA,
    targetB,
    nextLiveTotalUsdt,
  )
  return { ok: true, a: next.a, b: next.b }
}

/**
 * A/B/C 內部互轉：只改分倉數量，總 P 與成本不變。
 * 透過調整 openingUsdtCabinA/B 達成目標。
 */
export function openingUsdtCabinAAfterRebalance(
  openingUsdtCabinA: number,
  currentCabinA: number,
  targetCabinA: number,
  totalUsdt: number,
): number {
  const total = Math.max(0, totalUsdt)
  const clampedTarget = Math.min(Math.max(0, targetCabinA), total)
  return openingUsdtCabinA + (clampedTarget - currentCabinA)
}

export function openingUsdtCabinsAfterRebalance(
  openingUsdtCabinA: number,
  openingUsdtCabinB: number,
  current: { a: number; b: number },
  targetA: number,
  targetB: number,
  totalUsdt: number,
): { a: number; b: number } {
  const total = Math.max(0, totalUsdt)
  const clampedA = Math.min(Math.max(0, targetA), total)
  const clampedB = Math.min(Math.max(0, targetB), Math.max(0, total - clampedA))
  return {
    a: openingUsdtCabinA + (clampedA - current.a),
    b: openingUsdtCabinB + (clampedB - current.b),
  }
}

/** 正規化 A/B/C 絕對數量（總和 = totalUsdt） */
export function normalizeUsdtCabinSnapshot(
  totalUsdt: number,
  a: number,
  b: number,
  c?: number,
): { a: number; b: number; c: number } {
  const total = Math.max(0, totalUsdt)
  const clampedA = Math.min(Math.max(0, a), total)
  const clampedB = Math.min(Math.max(0, b), Math.max(0, total - clampedA))
  if (typeof c === 'number' && Number.isFinite(c)) {
    const clampedC = Math.min(Math.max(0, c), Math.max(0, total - clampedA - clampedB))
    const remain = Math.max(0, total - clampedA - clampedB - clampedC)
    return { a: clampedA, b: clampedB, c: clampedC + remain }
  }
  return { a: clampedA, b: clampedB, c: Math.max(0, total - clampedA - clampedB) }
}

/**
 * A/B/C 內部互轉：從出倉轉數量到收倉，總量不變。
 * 成功回傳新餘額；失敗回傳錯誤訊息。
 */
export function transferUsdtBetweenCabins(
  current: { a: number; b: number; c: number },
  from: UsdtCabin,
  to: UsdtCabin,
  amount: number,
): { ok: true; next: { a: number; b: number; c: number } } | { ok: false; error: string } {
  if (from === to) {
    return { ok: false, error: '出倉與收倉不可相同' }
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: '請輸入大於 0 的轉出數量' }
  }
  const balanceOf = (cabin: UsdtCabin) =>
    cabin === 'A' ? current.a : cabin === 'B' ? current.b : current.c
  const available = balanceOf(from)
  if (amount > available + 1e-9) {
    return {
      ok: false,
      error: `${from} 艙餘額不足（現有 ${available}）`,
    }
  }

  const next = { ...current }
  const debit = (cabin: UsdtCabin, amt: number) => {
    if (cabin === 'A') next.a -= amt
    else if (cabin === 'B') next.b -= amt
    else next.c -= amt
  }
  const credit = (cabin: UsdtCabin, amt: number) => {
    if (cabin === 'A') next.a += amt
    else if (cabin === 'B') next.b += amt
    else next.c += amt
  }
  debit(from, amount)
  credit(to, amount)
  // 消除浮點誤差
  next.a = Math.max(0, next.a)
  next.b = Math.max(0, next.b)
  next.c = Math.max(0, next.c)
  return { ok: true, next }
}

/**
 * 依已存的 A/B/C 絕對數量校正期初分倉（重整後還原戶轉分倉結果）。
 */
export function alignOpeningUsdtCabinsToSnapshot(
  openingUsdtCabinA: number,
  openingUsdtCabinB: number,
  current: { a: number; b: number; c: number },
  snapshot: { a: number; b: number; c: number },
  totalUsdt: number,
): { a: number; b: number } {
  const target = normalizeUsdtCabinSnapshot(totalUsdt, snapshot.a, snapshot.b, snapshot.c)
  return openingUsdtCabinsAfterRebalance(
    openingUsdtCabinA,
    openingUsdtCabinB,
    { a: current.a, b: current.b },
    target.a,
    target.b,
    totalUsdt,
  )
}

/** VN 庫存以凍結 V@ 換算台幣估值；V=0 為 0，V<0 為負（透支負債）。 */
function computeVnInTwdValuation(
  vnBalance: number,
  vnTwdRate: number | null,
  missingNotes: string[],
): number | null {
  if (vnBalance === 0) return 0
  if (vnTwdRate !== null && vnTwdRate > 0) {
    return floorTwd(vnBalance / vnTwdRate)
  }
  missingNotes.push('VN 無料金均價')
  return null
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
    missingNotes.push('USDT 無 TWD 料金')
  }

  const vnInTwd = computeVnInTwdValuation(balances.vn, vnPoolRate, missingNotes)

  const total = twdCash + (usdtInTwd ?? 0) + (vnInTwd ?? 0)
  const isComplete =
    (balances.usdt <= 0 || usdtInTwd !== null) &&
    (balances.vn === 0 || vnInTwd !== null)

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

/**
 * 以指定成本 @ 估值總資產（日間凍結 opening、結算寫入新 @ 後皆用此）。
 * 不 walk 當日交易池。
 */
export function computeTotalAssetsAtCostRates(
  balances: Balances,
  usdtCostTwd: number | null,
  vnTwdRate: number | null,
  vnUsdtRate: number | null,
): TotalAssetsTwd {
  const twdCash = balances.twd
  const missingNotes: string[] = []

  let usdtInTwd: number | null = null
  if (balances.usdt <= 0) {
    usdtInTwd = 0
  } else if (usdtCostTwd !== null) {
    usdtInTwd = floorTwd(balances.usdt * usdtCostTwd)
  } else {
    missingNotes.push('USDT 無 TWD 料金')
  }

  const vnInTwd = computeVnInTwdValuation(balances.vn, vnTwdRate, missingNotes)

  const total = twdCash + (usdtInTwd ?? 0) + (vnInTwd ?? 0)
  const isComplete =
    (balances.usdt <= 0 || usdtInTwd !== null) &&
    (balances.vn === 0 || vnInTwd !== null)

  return {
    twdCash,
    usdtInTwd,
    vnInTwd,
    dayVnTwdRate: vnTwdRate,
    dayVnUsdtRate: vnUsdtRate,
    total,
    isComplete,
    missingNotes,
  }
}

/** 結算新 @：（期初數量 × 前日@ + 買入數量 × 當日買均）÷（期初 + 買入）；無買入沿用前日 */
export function settleWeightedCostRate(
  openingQty: number,
  prevRate: number | null,
  dayBuyQty: number,
  dayBuyAvg: number | null,
  round: (value: number) => number,
): number | null {
  if (dayBuyQty > 0 && dayBuyAvg !== null) {
    if (openingQty > 0 && prevRate !== null) {
      return round(
        (openingQty * prevRate + dayBuyQty * dayBuyAvg) / (openingQty + dayBuyQty),
      )
    }
    return round(dayBuyAvg)
  }
  return prevRate !== null ? round(prevRate) : null
}

export type SettleDayInventoryRates = {
  usdt: UsdtInventoryCost
  vnTwdRate: number | null
  vnUsdtRate: number | null
  dayBuyAvgTwd: number | null
  dayBuyAvgVn: number | null
}

/** 結算時寫入的庫存 @（凍結模型） */
export function computeSettleDayInventoryRates(
  openingBalances: Balances,
  openingUsdtCost: UsdtInventoryCost,
  openingVnTwdRate: number | null,
  openingVnUsdtRate: number | null,
  transactions: Transaction[],
): SettleDayInventoryRates {
  const usdtTxs = filterUsdtTransactions(transactions)
  const dayBuyAvgTwd = calculateBuyDayAverageRate(usdtTxs, 'twd')
  const dayBuyQty = usdtTxs
    .filter((tx) => tx.type === 'buy' && tx.fiatCurrency === 'twd')
    .reduce((sum, tx) => sum + tx.usdtAmount, 0)

  const dayBuyAvgVn = calculateVnBuyDayAverageRate(
    openingBalances,
    openingUsdtCost,
    transactions,
  )
  const dayBuyAvgVnUsdt = calculateVnBuyDayAverageUsdtRate(
    openingBalances,
    openingUsdtCost,
    transactions,
  )
  const dayBuyVnQty = filterVnTradeTransactions(transactions)
    .filter((tx) => tx.type === 'buy')
    .reduce((sum, tx) => sum + tx.vnAmount, 0)

  return {
    usdt: {
      twd: settleWeightedCostRate(
        openingBalances.usdt,
        openingUsdtCost.twd,
        dayBuyQty,
        dayBuyAvgTwd,
        roundUsdtCostRate,
      ),
      vn: openingUsdtCost.vn,
    },
    vnTwdRate: settleWeightedCostRate(
      openingBalances.vn,
      openingVnTwdRate,
      dayBuyVnQty,
      dayBuyAvgVn !== null ? roundVnPoolCostRate(dayBuyAvgVn) : null,
      roundVnPoolCostRate,
    ),
    vnUsdtRate: settleWeightedCostRate(
      openingBalances.vn,
      openingVnUsdtRate,
      dayBuyVnQty,
      dayBuyAvgVnUsdt !== null ? roundVnPoolCostRate(dayBuyAvgVnUsdt) : null,
      roundVnPoolCostRate,
    ),
    dayBuyAvgTwd,
    dayBuyAvgVn:
      dayBuyAvgVn !== null ? roundVnPoolCostRate(dayBuyAvgVn) : null,
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
  const usdtQty = openingBalances.usdt
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
  const vnQty = openingBalances.vn
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

/** 結算封存明細：當日買賣 U／V 量與加權均價（供查帳摘要） */
export type SettlementTradeVolumeSummary = {
  buyUQty: number
  sellUQty: number
  buyUAvg: number | null
  sellUAvg: number | null
  buyVnQty: number
  sellVnQty: number
  buyVnAvg: number | null
  sellVnAvg: number | null
}

function weightedUsdtRate(
  txs: UsdtTransaction[],
): { qty: number; avg: number | null } {
  const qty = txs.reduce((sum, tx) => sum + tx.usdtAmount, 0)
  if (qty <= 0) return { qty: 0, avg: null }
  const fiat = txs.reduce((sum, tx) => sum + tx.fiatAmount, 0)
  return { qty, avg: roundUsdtCostRate(fiat / qty) }
}

function weightedVnRate(
  txs: VnTradeTransaction[],
): { qty: number; avg: number | null } {
  const qty = txs.reduce((sum, tx) => sum + tx.vnAmount, 0)
  if (qty <= 0) return { qty: 0, avg: null }
  const pay = txs.reduce((sum, tx) => sum + vnTradePayAmount(tx), 0)
  if (pay <= 0) return { qty, avg: null }
  return { qty, avg: roundVnTradeRate(qty / pay) }
}

export function summarizeSettlementTrades(
  trades: Array<UsdtTransaction | VnTradeTransaction>,
): SettlementTradeVolumeSummary {
  const usdtBuys = trades.filter(
    (tx): tx is UsdtTransaction => isUsdtTransaction(tx) && tx.type === 'buy',
  )
  const usdtSells = trades.filter(
    (tx): tx is UsdtTransaction => isUsdtTransaction(tx) && tx.type === 'sell',
  )
  const vnBuys = trades.filter(
    (tx): tx is VnTradeTransaction => isVnTradeTransaction(tx) && tx.type === 'buy',
  )
  const vnSells = trades.filter(
    (tx): tx is VnTradeTransaction => isVnTradeTransaction(tx) && tx.type === 'sell',
  )

  const buyU = weightedUsdtRate(usdtBuys)
  const sellU = weightedUsdtRate(usdtSells)
  const buyVn = weightedVnRate(vnBuys)
  const sellVn = weightedVnRate(vnSells)

  return {
    buyUQty: buyU.qty,
    sellUQty: sellU.qty,
    buyUAvg: buyU.avg,
    sellUAvg: sellU.avg,
    buyVnQty: buyVn.qty,
    sellVnQty: sellVn.qty,
    buyVnAvg: buyVn.avg,
    sellVnAvg: sellVn.avg,
  }
}

/** SET IV/OV 分組 footer：依付幣別各自加權均價（VN/付幣），避免 P/T 混算。 */
export function summarizeVnRatesByPayCurrency(
  txs: VnTradeTransaction[],
): { usdt: number | null; twd: number | null } {
  return {
    usdt: weightedVnRate(txs.filter((tx) => tx.payCurrency === 'usdt')).avg,
    twd: weightedVnRate(txs.filter((tx) => tx.payCurrency === 'twd')).avg,
  }
}

export type SettlementTradePane = 'IE' | 'OE' | 'IV' | 'OV'

export type SettlementTradeSearchHit = {
  settlementId: string
  settlementDateLabel: string
  settledAt: Date
  /** 月結封存來源；現期 SET 為 null */
  monthlyClosePeriodLabel: string | null
  pane: SettlementTradePane
  trade: UsdtTransaction | VnTradeTransaction
  profit: number | null
}

export function settlementTradePane(
  tx: UsdtTransaction | VnTradeTransaction,
): SettlementTradePane {
  if (isUsdtTransaction(tx)) return tx.type === 'buy' ? 'IE' : 'OE'
  return tx.type === 'buy' ? 'IV' : 'OV'
}

/** 依備註關鍵字搜尋 SET 封存交易（含現期 SET 與月結內 tradeSettlements） */
export function searchSettlementTradesByNote(
  settlements: DailySettlement[],
  monthlyCloses: MonthlyClose[],
  query: string,
): SettlementTradeSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const hits: SettlementTradeSearchHit[] = []

  const scanSettlement = (
    settlement: DailySettlement,
    monthlyClosePeriodLabel: string | null,
  ) => {
    for (const tx of settlement.trades ?? []) {
      const note = tx.note?.trim() ?? ''
      if (!note.toLowerCase().includes(q)) continue
      hits.push({
        settlementId: settlement.id,
        settlementDateLabel: settlement.dateLabel,
        settledAt: settlement.settledAt,
        monthlyClosePeriodLabel,
        pane: settlementTradePane(tx),
        trade: tx,
        profit:
          tx.type === 'sell' ? (settlement.sellProfitById?.[tx.id] ?? null) : null,
      })
    }
  }

  for (const settlement of settlements) {
    scanSettlement(settlement, null)
  }
  for (const close of monthlyCloses) {
    for (const settlement of close.tradeSettlements ?? []) {
      scanSettlement(settlement, close.periodLabel)
    }
  }

  hits.sort((a, b) => {
    const bySettle = b.settledAt.getTime() - a.settledAt.getTime()
    if (bySettle !== 0) return bySettle
    return compareTradeListOrder(a.trade, b.trade)
  })

  return hits
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

/** 結算日 OE：成本用最新 U@（前日結算＋當日 IE 加權；無 IE 則前日） */
export function computeSettleDayUsdtSellProfitById(
  latestUsdtCostTwd: number | null,
  transactions: Transaction[],
): Map<string, SellProfitInfo> {
  const unitCost =
    latestUsdtCostTwd !== null ? roundUsdtCostRate(latestUsdtCostTwd) : null
  const result = new Map<string, SellProfitInfo>()

  for (const tx of filterUsdtTransactions(transactions)) {
    if (tx.type !== 'sell') continue
    const costBasis = unitCost !== null ? tx.usdtAmount * unitCost : 0
    result.set(tx.id, {
      unitCost,
      costBasis,
      profit: tx.fiatAmount - costBasis,
    })
  }

  return result
}

export function computeSettleDayUsdtProfit(
  latestUsdtCostTwd: number | null,
  transactions: Transaction[],
): number {
  const profitById = computeSettleDayUsdtSellProfitById(
    latestUsdtCostTwd,
    transactions,
  )
  return filterUsdtTransactions(transactions)
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + (profitById.get(tx.id)?.profit ?? 0), 0)
}

/**
 * 結算日 OV：成本用最新 V@（前日結算＋當日 IV 加權；無 IV 則前日）。
 * 收 T 之收款依表列 T 縮寫還原，與 footer 賣均口徑一致。
 */
export function computeSettleDayVnSellProfitById(
  latestVnTwdRate: number | null,
  latestUsdtCostTwd: number | null,
  transactions: Transaction[],
): Map<string, SellProfitInfo> {
  const vnUnit =
    latestVnTwdRate !== null && latestVnTwdRate > 0
      ? roundVnPoolCostRate(latestVnTwdRate)
      : null
  const usdtUnit =
    latestUsdtCostTwd !== null ? roundUsdtCostRate(latestUsdtCostTwd) : null
  const result = new Map<string, SellProfitInfo>()

  for (const tx of filterVnTradeTransactions(transactions)) {
    if (tx.type !== 'sell') continue
    const costBasis =
      vnUnit !== null && vnUnit > 0 ? tx.vnAmount / vnUnit : 0
    const proceeds =
      tx.payCurrency === 'twd'
        ? roundTwdTableCompact(tx.twdAmount) * 10_000
        : usdtUnit !== null
          ? tx.usdtAmount * usdtUnit
          : 0
    result.set(tx.id, {
      unitCost: vnUnit,
      costBasis,
      profit: proceeds - costBasis,
    })
  }

  return result
}

export function computeSettleDayVnProfit(
  latestVnTwdRate: number | null,
  latestUsdtCostTwd: number | null,
  transactions: Transaction[],
): number {
  const profitById = computeSettleDayVnSellProfitById(
    latestVnTwdRate,
    latestUsdtCostTwd,
    transactions,
  )
  return filterVnTradeTransactions(transactions)
    .filter((tx) => tx.type === 'sell')
    .reduce((sum, tx) => sum + (profitById.get(tx.id)?.profit ?? 0), 0)
}

export function computeDayExpenseTotal(transactions: Transaction[]): number {
  return filterExpenseTransactions(transactions).reduce(
    (sum, tx) => sum + tx.amountTwd,
    0,
  )
}

/** 開銷付款幣別；舊資料缺省 twd */
export function expensePayCurrency(tx: ExpenseTransaction): VnPayCurrency {
  return tx.payCurrency === 'usdt' ? 'usdt' : 'twd'
}

export function expenseUsdtAmount(tx: ExpenseTransaction): number {
  return expensePayCurrency(tx) === 'usdt' ? (tx.amountUsdt ?? 0) : 0
}

/** AL 從 T 餘額扣除的開銷（不含 U 開銷的台幣等值） */
export function computeDayExpenseTwdCashTotal(transactions: Transaction[]): number {
  return filterExpenseTransactions(transactions).reduce((sum, tx) => {
    return expensePayCurrency(tx) === 'twd' ? sum + tx.amountTwd : sum
  }, 0)
}

export function computeDayExpenseUsdtTotal(transactions: Transaction[]): number {
  return filterExpenseTransactions(transactions).reduce(
    (sum, tx) => sum + expenseUsdtAmount(tx),
    0,
  )
}

/**
 * EXP.SUM 一筆對帳上的影響（僅 RECON 封存含 items 者曾扣帳；手動新增無 items → 0）。
 * twdCash／usdt 為「當時從帳上扣除」的數量，刪除 SUM 時應加回。
 */
export function balanceImpactFromCumulativeExpense(entry: {
  amountTwd: number
  items?: Array<{
    amountTwd: number
    payCurrency?: VnPayCurrency
    amountUsdt?: number
  }>
}): { twdCash: number; usdt: number } {
  const items = entry.items
  if (!items || items.length === 0) {
    return { twdCash: 0, usdt: 0 }
  }
  let twdCash = 0
  let usdt = 0
  for (const item of items) {
    if (item.payCurrency === 'usdt') {
      usdt += item.amountUsdt ?? 0
    } else {
      twdCash += item.amountTwd
    }
  }
  return { twdCash, usdt }
}

/**
 * AL 扣 P 開銷時，依 B→A→C 順序扣艙數量。
 */
export function deductUsdtFromCabinsBAC(
  cabins: { a: number; b: number; c: number },
  amount: number,
): { a: number; b: number; c: number } {
  let remaining = Math.max(0, amount)
  let { a, b, c } = cabins
  const take = (avail: number): number => {
    const d = Math.min(Math.max(0, avail), remaining)
    remaining -= d
    return avail - d
  }
  b = take(b)
  a = take(a)
  c = take(c)
  return {
    a: Math.max(0, a),
    b: Math.max(0, b),
    c: Math.max(0, c),
  }
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
      payCurrency: expensePayCurrency(tx),
      amountUsdt: expensePayCurrency(tx) === 'usdt' ? expenseUsdtAmount(tx) : undefined,
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

/** 將 EXP.SUM 轉成月結用開銷批次（類別一律 other；僅供封存／顯示） */
export function expenseSettlementsFromCumulative(
  entries: CumulativeExpenseEntry[],
): ExpenseSettlement[] {
  if (entries.length === 0) return []

  const items: ExpenseSettlementItem[] = []
  for (const entry of entries) {
    if (entry.items && entry.items.length > 0) {
      for (const item of entry.items) {
        items.push({
          expenseType: 'other',
          amountTwd: item.amountTwd,
          note: item.note,
          timestamp: new Date(item.timestamp),
        })
      }
    } else {
      items.push({
        expenseType: 'other',
        amountTwd: entry.amountTwd,
        note: entry.note,
        timestamp: new Date(entry.timestamp),
      })
    }
  }

  const expenseTotal = items.reduce((sum, item) => sum + item.amountTwd, 0)
  const latestTs = items.reduce(
    (max, item) => Math.max(max, item.timestamp.getTime()),
    entries[0]!.timestamp.getTime(),
  )

  return [
    {
      id: crypto.randomUUID(),
      settledAt: new Date(latestTs),
      dateLabel: 'EXP.SUM',
      twdBalance: 0,
      expenseCount: items.length,
      expenseTotal,
      items,
    },
  ]
}

export function cloneDailySettlement(item: DailySettlement): DailySettlement {
  return {
    ...item,
    settledAt: new Date(item.settledAt),
    trades: item.trades?.map((tx) => ({
      ...tx,
      timestamp: new Date(tx.timestamp),
    })),
    sellProfitById: item.sellProfitById ? { ...item.sellProfitById } : undefined,
  }
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
  // 月結區間以 SET 帳務日為準；僅無 SET 時才退回開銷時間（避免 EXP 把尾端拉到隔日）
  const dates =
    tradeSettlements.length > 0
      ? tradeSettlements.map((item) => resolveSettlementArchiveDate(item))
      : expenseSettlements.map((item) => item.settledAt)
  if (dates.length === 0) return { start: null, end: null }
  const times = dates.map((date) => date.getTime())
  return {
    start: new Date(Math.min(...times)),
    end: new Date(Math.max(...times)),
  }
}

/** 月結期別標籤：依封存區間尾端月份（SET 帳務日），非「今天」 */
export function suggestMonthlyPeriodLabel(anchor: Date = new Date()): string {
  return `${anchor.getMonth() + 1}月份`
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
    // RECON 已扣帳，帳面即實際總資產
    closingTotalAssets: totalAssets,
    dateRangeLabel: formatArchiveDateRange(start, end),
    periodLabel: suggestMonthlyPeriodLabel(end ?? new Date()),
    pendingTradeCount,
    pendingExpenseCount: pendingExpenses.length,
  }
}

/**
 * 由期末實際總資產與淨利反推期初帳面。
 * 期初 + 淨利 = 期末（開銷已於 RECON 扣帳）。
 */
export function inferOpeningTotalAssets(
  closingTotal: number,
  netProfit: number,
): number {
  return closingTotal - netProfit
}

export function normalizeMonthlyCloseRecord(item: MonthlyClose): MonthlyClose & { openingTotalAssets: number } {
  const closingBookTotalAssets = item.closingBookTotalAssets ?? item.closingTotalAssets
  const closingTotalAssets = item.closingTotalAssets
  const openingTotalAssets =
    item.openingTotalAssets ??
    (item.closingBookTotalAssets !== undefined &&
    item.closingBookTotalAssets !== item.closingTotalAssets
      ? // 舊資料：帳面未含開銷，以毛利反推期初
        closingBookTotalAssets - item.grossProfit
      : inferOpeningTotalAssets(closingTotalAssets, item.netProfit))

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
    trades: item.trades?.map((tx) => ({
      ...tx,
      timestamp: new Date(tx.timestamp),
    })),
    sellProfitById: item.sellProfitById ? { ...item.sellProfitById } : undefined,
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
  // RECON 已自期初台幣扣開銷，帳面即實際總資產
  const closingTotalAssets = closingBookTotalAssets
  const openingTotalAssets = inferOpeningTotalAssets(closingTotalAssets, netProfit)

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

/**
 * SET 卡片 P／VN 顯示用利潤：有封存逐筆 PF 時，改為「各筆先萬位四捨五入再加總」
 * （與明細列／組 footer 一致），避免上方 1.78、下方 1.08+0.69=1.77 這類落差。
 * 回傳仍為台幣原值，可直接交給 formatProfit。
 */
export function settlementDisplaySplitProfits(item: DailySettlement): {
  usdt: number | undefined
  vn: number | undefined
} {
  const map = item.sellProfitById
  const trades = item.trades
  if (!map || !trades || trades.length === 0) {
    return { usdt: item.dayUsdtProfit, vn: item.dayVnProfit }
  }

  const usdtParts: number[] = []
  const vnParts: number[] = []
  for (const tx of trades) {
    const profit = map[tx.id]
    if (profit == null || !Number.isFinite(profit)) continue
    if (isUsdtTransaction(tx)) {
      if (tx.type === 'sell') usdtParts.push(profit)
    } else if (isVnTradeTransaction(tx) && tx.type === 'sell') {
      vnParts.push(profit)
    }
  }

  const toTwd = (...parts: number[]) => sumRoundedProfitParts(...parts) * 10_000
  return {
    usdt:
      item.dayUsdtProfit !== undefined || usdtParts.length > 0
        ? toTwd(...usdtParts)
        : item.dayUsdtProfit,
    vn:
      item.dayVnProfit !== undefined || vnParts.length > 0
        ? toTwd(...vnParts)
        : item.dayVnProfit,
  }
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

/** 日結預設帳務日：取進行中交易最新 tradeDate，否則今天 */
export function defaultSettleBusinessDate(transactions: Transaction[]): string {
  const trades = filterTradeTransactions(transactions)
  if (trades.length === 0) return defaultTradeDateInputValue()
  let latest = resolveTradeDate(trades[0]!)
  for (const tx of trades) {
    const day = resolveTradeDate(tx)
    if (day > latest) latest = day
  }
  return latest
}

export function buildDeleteConfirmLines(tx: Transaction): string[] {
  if (isExpenseTransaction(tx)) {
    const note = tx.note.trim()
    const amountLine =
      expensePayCurrency(tx) === 'usdt'
        ? `P ${formatNumber(expenseUsdtAmount(tx))}`
        : `T ${formatTwdTableCompact(tx.amountTwd)}`
    return note ? [amountLine, note] : [amountLine]
  }

  if (isVnTradeTransaction(tx)) {
    const pay =
      tx.payCurrency === 'usdt'
        ? `P ${formatNumber(tx.usdtAmount)}`
        : `T ${formatTwdTableCompact(tx.twdAmount)}`
    return [
      `VN ${formatVnTableCompact(tx.vnAmount)}`,
      pay,
      `@${formatVnTradeRateDisplay(vnTradeDisplayRate(tx))}`,
    ]
  }

  return [
    `P ${formatNumber(tx.usdtAmount)}`,
    `T ${formatTwdTableCompact(tx.fiatAmount)}`,
    `@${formatUsdtTradeRateDisplay(tx.rate)}`,
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
  const settleRates = computeSettleDayInventoryRates(
    openingBalances,
    openingUsdtCost,
    openingVnTwdRate,
    openingVnUsdtRate,
    transactions,
  )
  const dayUsdtProfit = computeSettleDayUsdtProfit(
    settleRates.usdt.twd,
    transactions,
  )
  const dayVnProfit = computeSettleDayVnProfit(
    settleRates.vnTwdRate,
    settleRates.usdt.twd,
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
    defaultBusinessDate: defaultSettleBusinessDate(transactions),
  }
}
export function applyExpenseTransaction(balances: Balances, tx: ExpenseTransaction): Balances {
  if (expensePayCurrency(tx) === 'usdt') {
    return {
      ...balances,
      usdt: balances.usdt - expenseUsdtAmount(tx),
    }
  }
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
  openingUsdtCabinA = 0,
  openingUsdtCabinB = 0,
): string | null {
  const applicable = filterBalanceAffectingTransactions(
    filterTradeTransactions(transactions),
    lastTradeSettledAt,
  )
  const sorted = [...applicable].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  let balances = { ...openingBalances }
  const startCabins = initialUsdtCabinSplit(
    openingBalances.usdt,
    openingUsdtCabinA,
    openingUsdtCabinB,
  )
  let cabinA = startCabins.a
  let cabinB = startCabins.b
  let cabinC = startCabins.c

  for (const tx of sorted) {
    if (isVnTradeTransaction(tx)) {
      const payAmount = vnTradePayAmount(tx)
      if (tx.vnAmount <= 0 || payAmount <= 0) {
        return '請輸入有效的正數金額'
      }
      if (tx.type === 'buy') {
        // IV 付 T 允許台幣透支（T 可為負）；付 P 仍檢查庫存／分艙
        if (tx.payCurrency === 'usdt') {
          if (tx.usdtAmount > balances.usdt) {
            return 'USDT 庫存不足'
          }
          const aAmt = resolveCabinAAmount(tx)
          const bAmt = resolveCabinBAmount(tx)
          const cAmt = resolveCabinCAmount(tx)
          if (aAmt > 0 && aAmt > cabinA) return 'A 艙 USDT 不足'
          if (bAmt > 0 && bAmt > cabinB) return 'B 艙 USDT 不足'
          if (cAmt > 0 && cAmt > cabinC) return 'C 艙 USDT 不足'
        }
      }
      // 賣 VN 允許透支（V 可為負）
      balances = applyVnTradeTransaction(balances, tx)
      const moved = usdtCabinSignedDeltas(tx)
      if (moved) {
        cabinA += moved.a
        cabinB += moved.b
        cabinC += moved.c
      }
      continue
    }

    if (!isUsdtTransaction(tx)) continue

    if (tx.usdtAmount <= 0 || tx.fiatAmount <= 0) {
      return '請輸入有效的正數金額'
    }

    // IE 買 U 允許台幣透支（T 可為負）；賣出仍檢查 P／分艙
    if (tx.type === 'sell') {
      if (tx.usdtAmount > balances.usdt) {
        return 'USDT 庫存不足'
      }
      const aAmt = resolveCabinAAmount(tx)
      const bAmt = resolveCabinBAmount(tx)
      const cAmt = resolveCabinCAmount(tx)
      if (aAmt > 0 && aAmt > cabinA) return 'A 艙 USDT 不足'
      if (bAmt > 0 && bAmt > cabinB) return 'B 艙 USDT 不足'
      if (cAmt > 0 && cAmt > cabinC) return 'C 艙 USDT 不足'
    }

    balances = applyUsdtTransaction(balances, tx)
    const moved = usdtCabinSignedDeltas(tx)
    if (moved) {
      cabinA += moved.a
      cabinB += moved.b
      cabinC += moved.c
    }
  }

  return null
}

/**
 * 以「目前」庫存／分艙檢查一筆 USDT 支出（賣 P 或出 P 買 VN）。
 * 用於歷史流水日期錯亂時，全量重播會誤報「台幣庫存不足」，但仍應允許合理的出 P。
 */
export function validateCurrentUsdtCabinSpend(
  balances: Balances,
  cabins: { a: number; b: number; c: number },
  usdtAmount: number,
  cabinAAmount: number,
  cabinBAmount: number,
): string | null {
  if (!(usdtAmount > 0)) return '請輸入有效的正數金額'
  if (usdtAmount > balances.usdt + 1e-9) return 'USDT 庫存不足'
  const alloc = normalizeCabinAlloc(usdtAmount, cabinAAmount, cabinBAmount)
  if (alloc.cabinAAmount > 0 && alloc.cabinAAmount > cabins.a + 1e-9) {
    return 'A 艙 USDT 不足'
  }
  if (alloc.cabinBAmount > 0 && alloc.cabinBAmount > cabins.b + 1e-9) {
    return 'B 艙 USDT 不足'
  }
  const cAmt = Math.max(0, usdtAmount - alloc.cabinAAmount - alloc.cabinBAmount)
  if (cAmt > 0 && cAmt > cabins.c + 1e-9) return 'C 艙 USDT 不足'
  return null
}

/**
 * 全量驗證失敗時的救援：
 * - 出 P（不花台幣）：歷史重播誤報台幣／USDT／分艙不足時，改以目前 P／分艙檢查
 * - 進 P（花台幣／IE）：允許 T 透支；歷史重播 USDT／分艙雜訊直接放行
 */
export function resolveUsdtSpendValidationError(
  fullError: string | null,
  options: {
    spendsTwd: boolean
    balances: Balances
    cabins: { a: number; b: number; c: number }
    usdtAmount: number
    cabinAAmount: number
    cabinBAmount: number
    /** 買入（花台幣）時傳入本筆台幣金額 */
    fiatAmount?: number
  },
): string | null {
  if (!fullError) return null
  if (
    !options.spendsTwd &&
    (fullError === '台幣庫存不足' ||
      fullError === 'USDT 庫存不足' ||
      /艙 USDT 不足$/.test(fullError))
  ) {
    return validateCurrentUsdtCabinSpend(
      options.balances,
      options.cabins,
      options.usdtAmount,
      options.cabinAAmount,
      options.cabinBAmount,
    )
  }
  // IE 買 U：允許台幣透支；歷史重播若誤報 USDT／分艙不足也放行
  if (options.spendsTwd) {
    if (
      fullError === '台幣庫存不足' ||
      fullError === 'USDT 庫存不足' ||
      /艙 USDT 不足$/.test(fullError)
    ) {
      return null
    }
  }
  return fullError
}

/**
 * VN 走台幣腿（買付 T／賣收 T）不碰 USDT 艙。
 * 歷史重播若因 USDT／分艙／無關水位失敗，改以目前水位檢查。
 * IV 買 VN 付 T 允許台幣透支；賣 VN 允許 V 透支。
 */
export function resolveVnTwdLegValidationError(
  fullError: string | null,
  _options: {
    type: TransactionType
    balances: Balances
    vnAmount: number
    twdAmount: number
  },
): string | null {
  if (!fullError) return null
  if (fullError === '請輸入有效的正數金額') return fullError

  const isInventoryNoise =
    fullError === '台幣庫存不足' ||
    fullError === 'VN 庫存不足' ||
    fullError === 'USDT 庫存不足' ||
    /艙 USDT 不足$/.test(fullError)

  if (!isInventoryNoise) return fullError

  return null
}

/** 自結算封存 closing 反推該日交易前的 opening 餘額。 */
export function reverseBalancesFromTrades(
  closing: Balances,
  trades: Array<UsdtTransaction | VnTradeTransaction>,
): Balances {
  const b = { ...closing }
  const sorted = [...trades].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  )
  for (const tx of sorted) {
    if (isUsdtTransaction(tx)) {
      if (tx.type === 'buy') {
        b.twd += tx.fiatAmount
        b.usdt -= tx.usdtAmount
      } else {
        b.usdt += tx.usdtAmount
        b.twd -= tx.fiatAmount
      }
      continue
    }
    if (tx.type === 'buy') {
      b.vn -= tx.vnAmount
      if (tx.payCurrency === 'usdt') b.usdt += tx.usdtAmount
      else b.twd += tx.twdAmount
    } else {
      b.vn += tx.vnAmount
      if (tx.payCurrency === 'usdt') b.usdt -= tx.usdtAmount
      else b.twd -= tx.twdAmount
    }
  }
  return b
}

/**
 * 依 SET 封存鏈還原「最新一筆日結前」的 opening（期初餘額／@／分艙）。
 * settlements[0] 為最新；需至少保留一筆較舊 SET 才可靠還原 @。
 */
export function deriveOpeningBeforeLatestSettlement(settlements: DailySettlement[]): {
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  openingUsdtCabinA: number
  openingUsdtCabinB: number
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
} {
  const chrono = settlements.map(normalizeLoadedSettlement).reverse()
  const oldest = chrono[0]
  const oldestTrades = oldest.trades ?? []

  let ob = reverseBalancesFromTrades(
    {
      twd: oldest.twdBalance,
      usdt: oldest.usdtBalance,
      vn: oldest.vnBalance,
    },
    oldestTrades,
  )
  const migrated = migrateUsdtCabinAttribution(ob, undefined, oldestTrades, undefined)
  let cabinA = migrated.openingUsdtCabinA
  let cabinB = migrated.openingUsdtCabinB

  let openingUsdtCost: UsdtInventoryCost = {
    twd: oldest.usdtInventoryAvgTwd,
    vn: oldest.usdtInventoryAvgVn,
  }
  let openingVnTwdRate = oldest.dayVnTwdRate ?? null
  let openingVnUsdtRate = oldest.dayVnUsdtRate ?? null

  for (let i = 0; i < chrono.length - 1; i++) {
    const s = chrono[i]
    const trades = s.trades ?? []
    const cabins = computeUsdtCabinBalances(ob, cabinA, trades, null, cabinB)
    ob = {
      twd: s.twdBalance,
      usdt: s.usdtBalance,
      vn: s.vnBalance,
    }
    cabinA = cabins.a
    cabinB = cabins.b
    openingUsdtCost = {
      twd: s.usdtInventoryAvgTwd,
      vn: s.usdtInventoryAvgVn,
    }
    openingVnTwdRate = s.dayVnTwdRate ?? null
    openingVnUsdtRate = s.dayVnUsdtRate ?? null
  }

  return {
    openingBalances: ob,
    openingUsdtCost,
    openingUsdtCabinA: cabinA,
    openingUsdtCabinB: cabinB,
    openingVnTwdRate,
    openingVnUsdtRate,
  }
}

export type RevertLatestTradeSettlementInput = {
  transactions: Transaction[]
  settlements: DailySettlement[]
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  openingUsdtCabinA: number
  openingUsdtCabinB: number
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
  activeTab?: string
}

export type RevertLatestTradeSettlementResult =
  | {
      ok: true
      restoredTradeCount: number
      dateLabel: string
      state: RevertLatestTradeSettlementInput & { settlements: DailySettlement[] }
    }
  | { ok: false; reason: string }

/** 退回最新一筆交易 AL 日結：明細回 TRANS，opening 還原至該日前。 */
export function revertLatestTradeSettlement(
  state: RevertLatestTradeSettlementInput,
): RevertLatestTradeSettlementResult {
  if (state.settlements.length === 0) {
    return { ok: false, reason: '無 SET 可退回' }
  }

  const normalizedSettlements = state.settlements.map(normalizeLoadedSettlement)
  const latest = normalizedSettlements[0]
  const restoredTrades = latest.trades ?? []
  if (restoredTrades.length === 0) {
    return { ok: false, reason: '最新 SET 無封存明細（舊資料無法自動退回）' }
  }

  const remainingSettlements = normalizedSettlements.slice(1)
  const expenseTxs = filterExpenseTransactions(state.transactions)

  const opening =
    remainingSettlements.length > 0
      ? deriveOpeningBeforeLatestSettlement(normalizedSettlements)
      : {
          openingBalances: reverseBalancesFromTrades(
            {
              twd: latest.twdBalance,
              usdt: latest.usdtBalance,
              vn: latest.vnBalance,
            },
            restoredTrades,
          ),
          openingUsdtCost: state.openingUsdtCost,
          openingUsdtCabinA: state.openingUsdtCabinA,
          openingUsdtCabinB: state.openingUsdtCabinB,
          openingVnTwdRate: state.openingVnTwdRate,
          openingVnUsdtRate: state.openingVnUsdtRate,
        }

  const transactions: Transaction[] = [
    ...normalizeLoadedTransactions(restoredTrades),
    ...expenseTxs,
  ]

  return {
    ok: true,
    restoredTradeCount: restoredTrades.length,
    dateLabel: latest.dateLabel,
    state: {
      ...state,
      ...opening,
      transactions,
      settlements: remainingSettlements,
      activeTab: 'daily',
    },
  }
}

export function openingBalanceToForm(
  usdtCost: UsdtInventoryCost,
  vnTwdRate: number | null,
  vnUsdtRate: number | null,
): OpeningBalanceForm {
  return {
    twdAdjust: '',
    usdtAdjust: '',
    vnAdjust: '',
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
    .map((tx) => {
      if (isExpenseTransaction(tx)) return tx
      const normalized = isVnTradeTransaction(tx) ? normalizeVnTradeTransaction(tx) : tx
      if (normalized.tradeDate) return normalized
      return {
        ...normalized,
        tradeDate: dateInputValueFromDate(normalized.timestamp),
      }
    })
}

/**
 * 補登舊日若把 timestamp 推到結帳線之前，水位會不算這筆。
 * 載入時把這類交易 timestamp 拉回結帳後，保留 tradeDate 供畫面排序。
 */
export function repairTradeTimestampsAfterSettle(
  transactions: Transaction[],
  lastTradeSettledAt: Date | null,
): Transaction[] {
  if (!lastTradeSettledAt) return transactions
  const cutoff = lastTradeSettledAt.getTime()

  let latestSafe = cutoff
  for (const tx of transactions) {
    const t = tx.timestamp.getTime()
    if (t > latestSafe) latestSafe = t
  }

  return transactions.map((tx) => {
    if (isExpenseTransaction(tx)) return tx
    if (tx.timestamp.getTime() > cutoff) return tx
    latestSafe += 1
    return {
      ...tx,
      tradeDate: tx.tradeDate ?? dateInputValueFromDate(tx.timestamp),
      timestamp: new Date(latestSafe),
    }
  })
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
