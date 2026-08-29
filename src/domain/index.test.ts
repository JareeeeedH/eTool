import { describe, expect, it } from 'vitest'
import type {
  Balances,
  DailySettlement,
  MonthlyClose,
  Transaction,
  UsdtInventoryCost,
  UsdtTransaction,
  VnTradeTransaction,
} from '../types'
import { formatProfit, roundTwdTableCompact, roundUsdtCostRate } from '../utils/format'
import {
  adjustOpeningUsdtCabins,
  applyExpenseTransaction,
  applyOpeningUsdtDeltaToCabin,
  buildMonthlyClose,
  buildTradeSettleConfirmSummary,
  balanceImpactFromCumulativeExpense,
  computeDayExpenseTotal,
  computeDayExpenseTwdCashTotal,
  computeDayExpenseUsdtTotal,
  computeInventoryCost,
  computeSellProfitById,
  computeSettleDayInventoryRates,
  computeSettleDayUsdtProfit,
  computeSettleDayVnProfit,
  computeTotalAssetsAtCostRates,
  computeUsdtCabinBalances,
  computeUsdtSellProfitPreview,
  computeVnSellProfitPreview,
  computeVnTradeAnalytics,
  deductUsdtFromCabinsBAC,
  migrateUsdtCabinAttribution,
  alignOpeningUsdtCabinsToSnapshot,
  openingUsdtCabinsAfterRebalance,
  recalculateBalances,
  resolveUsdtSpendValidationError,
  resolveVnTwdLegValidationError,
  searchSettlementTradesByNote,
  settlementTradePane,
  summarizeVnRatesByPayCurrency,
  transferUsdtBetweenCabins,
  validateTransactions,
  settlementDisplaySplitProfits,
  simulateCabinFreezeAfterTradeSettle,
} from './index'

const EMPTY_COST: UsdtInventoryCost = { twd: null, vn: null }

function at(hour: number, minute = 0): Date {
  const d = new Date('2026-06-20T00:00:00')
  d.setHours(hour, minute, 0, 0)
  return d
}

function usdtBuy(
  id: string,
  time: Date,
  usdt: number,
  fiat: number,
): UsdtTransaction {
  return {
    id,
    timestamp: time,
    category: 'usdt',
    type: 'buy',
    fiatCurrency: 'twd',
    usdtAmount: usdt,
    fiatAmount: fiat,
    rate: fiat / usdt,
  }
}

function usdtSell(
  id: string,
  time: Date,
  usdt: number,
  fiat: number,
): UsdtTransaction {
  return {
    id,
    timestamp: time,
    category: 'usdt',
    type: 'sell',
    fiatCurrency: 'twd',
    usdtAmount: usdt,
    fiatAmount: fiat,
    rate: fiat / usdt,
  }
}

function vnBuyTwd(
  id: string,
  time: Date,
  vn: number,
  twd: number,
): VnTradeTransaction {
  return {
    id,
    timestamp: time,
    category: 'vn_trade',
    type: 'buy',
    payCurrency: 'twd',
    vnAmount: vn,
    twdAmount: twd,
    usdtAmount: 0,
    rate: vn / twd,
  }
}

function vnBuyUsdt(
  id: string,
  time: Date,
  vn: number,
  usdt: number,
): VnTradeTransaction {
  return {
    id,
    timestamp: time,
    category: 'vn_trade',
    type: 'buy',
    payCurrency: 'usdt',
    vnAmount: vn,
    twdAmount: 0,
    usdtAmount: usdt,
    rate: vn / usdt,
  }
}

function vnSellTwd(
  id: string,
  time: Date,
  vn: number,
  twd: number,
): VnTradeTransaction {
  return {
    id,
    timestamp: time,
    category: 'vn_trade',
    type: 'sell',
    payCurrency: 'twd',
    vnAmount: vn,
    twdAmount: twd,
    usdtAmount: 0,
    rate: vn / twd,
  }
}

function vnSellUsdt(
  id: string,
  time: Date,
  vn: number,
  usdt: number,
): VnTradeTransaction {
  return {
    id,
    timestamp: time,
    category: 'vn_trade',
    type: 'sell',
    payCurrency: 'usdt',
    vnAmount: vn,
    twdAmount: 0,
    usdtAmount: usdt,
    rate: vn / usdt,
  }
}

function usdtSells(txs: Transaction[]): UsdtTransaction[] {
  return txs.filter(
    (tx): tx is UsdtTransaction => tx.category === 'usdt' && tx.type === 'sell',
  )
}

function vnSells(txs: Transaction[]): VnTradeTransaction[] {
  return txs.filter(
    (tx): tx is VnTradeTransaction =>
      tx.category === 'vn_trade' && tx.type === 'sell',
  )
}

/** 每筆賣 U：編輯模式預覽（exclude 自己）應與表格利潤一致 */
function expectUsdtSellPreviewMatchesTable(
  opening: Balances,
  cost: UsdtInventoryCost,
  transactions: Transaction[],
  sellId: string,
) {
  const tx = transactions.find((t) => t.id === sellId)
  if (!tx || tx.category !== 'usdt' || tx.type !== 'sell') {
    throw new Error(`missing usdt sell ${sellId}`)
  }
  const preview = computeUsdtSellProfitPreview(
    opening,
    cost,
    transactions,
    tx.usdtAmount,
    tx.fiatAmount,
    sellId,
  )
  const table = computeSellProfitById(opening, cost, transactions).get(sellId)
  expect(preview?.unitCost).toBe(table?.unitCost)
  expect(preview?.costBasis).toBe(table?.costBasis)
  expect(preview?.profit).toBe(table?.profit)
}

function expectVnSellPreviewMatchesTable(
  opening: Balances,
  vnTwdRate: number | null,
  vnUsdtRate: number | null,
  cost: UsdtInventoryCost,
  transactions: Transaction[],
  sellId: string,
) {
  const tx = transactions.find((t) => t.id === sellId)
  if (!tx || tx.category !== 'vn_trade' || tx.type !== 'sell') {
    throw new Error(`missing vn sell ${sellId}`)
  }
  const pay = tx.payCurrency === 'twd' ? tx.twdAmount : tx.usdtAmount
  const preview = computeVnSellProfitPreview(
    opening,
    vnTwdRate,
    vnUsdtRate,
    cost,
    transactions,
    tx.vnAmount,
    tx.payCurrency,
    pay,
    sellId,
  )
  const table = computeVnTradeAnalytics(
    opening,
    vnTwdRate,
    vnUsdtRate,
    cost,
    transactions,
  ).sellProfitById.get(sellId)
  expect(preview?.unitCost).toBe(table?.unitCost)
  expect(preview?.costBasis).toBe(table?.costBasis)
  expect(preview?.profit).toBe(table?.profit)
}

describe('USDT 成本池 @ 行為', () => {
  it('連續賣 U：池 @ 不變，每筆利潤皆用同一 @', () => {
    const opening: Balances = { twd: 0, usdt: 10_000, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const transactions: Transaction[] = [
      usdtSell('s1', at(10), 1_000, 32_500),
      usdtSell('s2', at(11), 2_000, 64_400),
      usdtSell('s3', at(12), 500, 16_200),
    ]
    const profits = computeSellProfitById(opening, cost, transactions)

    for (const id of ['s1', 's2', 's3']) {
      expect(profits.get(id)?.unitCost).toBe(32)
    }
    expect(profits.get('s1')?.profit).toBe(500)
    expect(profits.get('s2')?.profit).toBe(400)
    expect(profits.get('s3')?.profit).toBe(200)
    expect(computeInventoryCost(opening, cost, transactions).twd).toBe(32)
  })

  it('台幣買 U 後：池 @ 加權重算', () => {
    const opening: Balances = { twd: 0, usdt: 5_000, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const transactions: Transaction[] = [
      usdtBuy('buy', at(10), 10_000, 324_500),
    ]
    const expected = roundUsdtCostRate((5_000 * 32 + 324_500) / 15_000)
    expect(computeInventoryCost(opening, cost, transactions).twd).toBe(expected)
  })

  it('賣 VN 收 U：U 數量增加、池 @ 數字不變', () => {
    const opening: Balances = { twd: 0, usdt: 10_000, vn: 50_000_000 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const before = computeInventoryCost(opening, cost, [])
    const after = computeInventoryCost(opening, cost, [
      vnSellUsdt('vn-sell', at(14), 5_000_000, 200),
    ])

    expect(before.twd).toBe(32)
    expect(after.twd).toBe(32)
  })

  it('買 VN 花 U：U 數量減少、池 @ 數字不變', () => {
    const opening: Balances = { twd: 0, usdt: 10_000, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const before = computeInventoryCost(opening, cost, [])
    const after = computeInventoryCost(opening, cost, [
      vnBuyUsdt('vn-buy', at(11), 20_000_000, 1_000),
    ])

    expect(before.twd).toBe(32)
    expect(after.twd).toBe(32)
  })
})

describe('USDT 成本池與賣 U 利潤', () => {
  const openingBalances: Balances = { twd: 0, usdt: 10_000, vn: 0 }
  const openingCost: UsdtInventoryCost = { twd: 32, vn: null }

  it('賣 U：利潤 = 收款 − 賣出量 × 賣出前池 @', () => {
    const transactions: Transaction[] = [
      usdtSell('sell-1', at(14), 1_000, 32_500),
    ]
    const info = computeSellProfitById(
      openingBalances,
      openingCost,
      transactions,
    ).get('sell-1')

    expect(info?.unitCost).toBe(32)
    expect(info?.costBasis).toBe(32_000)
    expect(info?.profit).toBe(500)
  })

  it('賣 U 利潤 walk 須傳入完整 transactions（含 VN 花 U／收 U）', () => {
    const balances: Balances = { twd: 0, usdt: 0, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const buyU = usdtBuy('buy-u', at(9), 10_000, 323_960)
    const vnSpend = vnBuyUsdt('vn-buy', at(10), 50_000_000, 2_000)
    const vnReceive = vnSellUsdt('vn-sell', at(10, 30), 5_000_000, 180)
    const sellU = usdtSell('sell-u', at(11), 5_000, 162_245)

    const withSpend: Transaction[] = [buyU, vnSpend, sellU]
    const withSpendAndReceive: Transaction[] = [buyU, vnSpend, vnReceive, sellU]

    expectUsdtSellPreviewMatchesTable(balances, cost, withSpend, 'sell-u')
    expectUsdtSellPreviewMatchesTable(
      balances,
      cost,
      withSpendAndReceive,
      'sell-u',
    )

    const profitSpend = computeSellProfitById(balances, cost, withSpend).get(
      'sell-u',
    )
    const profitBoth = computeSellProfitById(
      balances,
      cost,
      withSpendAndReceive,
    ).get('sell-u')
    expect(profitSpend?.unitCost).toBeDefined()
    expect(profitBoth?.unitCost).toBeDefined()
    expect(profitBoth?.profit).toBe(
      162_245 - 5_000 * (profitBoth?.unitCost ?? 0),
    )
  })

  it('賣 U 預覽與表格一致（新增賣單）', () => {
    const opening: Balances = { twd: 0, usdt: 5_000, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const prior: Transaction[] = [usdtBuy('buy', at(9), 5_000, 161_980)]

    const preview = computeUsdtSellProfitPreview(
      opening,
      cost,
      prior,
      1_000,
      32_449,
    )
    const table = computeSellProfitById(opening, cost, [
      ...prior,
      usdtSell('new-sell', at(10), 1_000, 32_449),
    ]).get('new-sell')

    expect(preview?.unitCost).toBe(table?.unitCost)
    expect(preview?.profit).toBe(table?.profit)
  })

  it('編輯較早賣 U：預覽只用該筆之前交易，不用日末 @', () => {
    const opening: Balances = { twd: 0, usdt: 10_000, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const transactions: Transaction[] = [
      usdtSell('sell-13', at(13), 1_000, 32_500),
      usdtBuy('buy-15', at(15), 2_000, 65_000),
      usdtSell('sell-17', at(17), 500, 16_300),
    ]

    const preview = computeUsdtSellProfitPreview(
      opening,
      cost,
      transactions,
      1_000,
      32_500,
      'sell-13',
    )
    const endPool = computeInventoryCost(opening, cost, transactions)
    const table = computeSellProfitById(opening, cost, transactions).get('sell-13')

    expect(preview?.unitCost).toBe(32)
    expect(preview?.unitCost).toBe(table?.unitCost)
    expect(preview?.profit).toBe(table?.profit)
    expect(endPool.twd).not.toBe(32)
  })

  it('亂序傳入交易：依時間 walk，賣 U 利潤與排序無關', () => {
    const opening: Balances = { twd: 0, usdt: 10_000, vn: 0 }
    const cost: UsdtInventoryCost = { twd: 32, vn: null }
    const chronological: Transaction[] = [
      usdtSell('early', at(10), 1_000, 32_500),
      usdtBuy('mid', at(12), 2_000, 65_000),
      usdtSell('late', at(14), 500, 16_300),
    ]
    const shuffled = [chronological[2], chronological[0], chronological[1]]

    const ordered = computeSellProfitById(opening, cost, chronological)
    const messy = computeSellProfitById(opening, cost, shuffled)

    expect(messy.get('early')).toEqual(ordered.get('early'))
    expect(messy.get('late')).toEqual(ordered.get('late'))
  })
})

describe('VN 池 @ 與賣出利潤', () => {
  it('連續賣 VN：@台幣 不變', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 100_000_000 }
    const vnTwdRate = 850
    const before = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      EMPTY_COST,
      [],
    )
    const after = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      EMPTY_COST,
      [
        vnSellTwd('v1', at(10), 10_000_000, 11_800_000),
        vnSellTwd('v2', at(11), 5_000_000, 5_900_000),
      ],
    )

    expect(before.currentVnTwdRate).toBe(850)
    expect(after.currentVnTwdRate).toBe(850)
  })

  it('買 VN 付台幣後：@台幣 加權改變（低匯率買入會拉低池 @）', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 50_000_000 }
    const vnTwdRate = 800
    const before = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      EMPTY_COST,
      [],
    ).currentVnTwdRate
    const after = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      EMPTY_COST,
      [vnBuyTwd('buy', at(10), 40_000_000, 50_000_000)],
    ).currentVnTwdRate

    expect(before).toBe(800)
    expect(after).not.toBe(800)
    expect(after!).toBeLessThan(before!)
  })

  it('賣 VN 收台幣：利潤 = 收款 − VN ÷ V@台幣', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 100_000_000 }
    const vnTwdRate = 850
    const transactions: Transaction[] = [
      vnSellTwd('vn-sell', at(14), 10_000_000, 11_800_000),
    ]
    const info = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      EMPTY_COST,
      transactions,
    ).sellProfitById.get('vn-sell')
    const costBasis = 10_000_000 / vnTwdRate

    expect(info?.costBasis).toBeCloseTo(costBasis, 5)
    expect(info?.profit).toBeCloseTo(11_800_000 - costBasis, 5)
    expectVnSellPreviewMatchesTable(
      opening,
      vnTwdRate,
      null,
      EMPTY_COST,
      transactions,
      'vn-sell',
    )
  })

  it('賣 VN 收 U：利潤 = 收到U×U池@ − VN÷V@台幣', () => {
    const opening: Balances = { twd: 0, usdt: 5_000, vn: 50_000_000 }
    const cost: UsdtInventoryCost = { twd: 32.5, vn: null }
    const vnTwdRate = 850
    const transactions: Transaction[] = [
      vnSellUsdt('vn-sell', at(14), 5_000_000, 200),
    ]
    const info = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      cost,
      transactions,
    ).sellProfitById.get('vn-sell')

    const costBasis = 5_000_000 / vnTwdRate
    const proceeds = 200 * 32.5
    expect(info?.costBasis).toBeCloseTo(costBasis, 5)
    expect(info?.profit).toBeCloseTo(proceeds - costBasis, 5)
    expectVnSellPreviewMatchesTable(
      opening,
      vnTwdRate,
      null,
      cost,
      transactions,
      'vn-sell',
    )
  })

  it('編輯較早賣 VN：預覽不用後續買 VN 之後的池子', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 80_000_000 }
    const cost = EMPTY_COST
    const vnTwdRate = 800
    const transactions: Transaction[] = [
      vnSellTwd('sell-early', at(13), 10_000_000, 12_500_000),
      vnBuyTwd('buy-later', at(15), 30_000_000, 40_000_000),
      vnSellTwd('sell-late', at(17), 5_000_000, 6_200_000),
    ]

    const preview = computeVnSellProfitPreview(
      opening,
      vnTwdRate,
      null,
      cost,
      transactions,
      10_000_000,
      'twd',
      12_500_000,
      'sell-early',
    )
    const table = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      cost,
      transactions,
    ).sellProfitById.get('sell-early')
    const endRate = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      null,
      cost,
      transactions,
    ).currentVnTwdRate

    expect(preview?.unitCost).toBe(800)
    expect(preview?.profit).toBe(table?.profit)
    expect(endRate).not.toBe(800)
  })
})

describe('完整營業日整合', () => {
  const opening: Balances = { twd: 50_000_000, usdt: 5_000, vn: 120_000_000 }
  const cost: UsdtInventoryCost = { twd: 32.449, vn: null }
  const vnTwdRate = 852.4
  const vnUsdtRate = 26_500

  const fullDay: Transaction[] = [
    usdtBuy('u-buy-1', at(9), 8_000, 259_168),
    vnBuyUsdt('vn-buy-u', at(10), 30_000_000, 1_200),
    usdtSell('u-sell-1', at(11), 2_000, 65_200),
    vnSellTwd('vn-sell-t', at(13), 15_000_000, 17_800_000),
    vnSellUsdt('vn-sell-u', at(14), 8_000_000, 310),
    usdtBuy('u-buy-2', at(15), 3_000, 97_500),
    usdtSell('u-sell-2', at(16), 1_500, 49_200),
    vnBuyTwd('vn-buy-t', at(17), 25_000_000, 30_000_000),
  ]

  it('每一筆賣 U：預覽（編輯模式）= 表格', () => {
    for (const sell of usdtSells(fullDay)) {
      expectUsdtSellPreviewMatchesTable(opening, cost, fullDay, sell.id)
    }
  })

  it('每一筆賣 VN：預覽（編輯模式）= 表格', () => {
    for (const sell of vnSells(fullDay)) {
      expectVnSellPreviewMatchesTable(
        opening,
        vnTwdRate,
        vnUsdtRate,
        cost,
        fullDay,
        sell.id,
      )
    }
  })

  it('日結毛利 = 結算日最新 @ 賣出利潤加總', () => {
    const rates = computeSettleDayInventoryRates(
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
      fullDay,
    )
    const uSum = computeSettleDayUsdtProfit(rates.usdt.twd, fullDay)
    const vSum = computeSettleDayVnProfit(
      rates.vnTwdRate,
      rates.usdt.twd,
      fullDay,
    )

    const settle = buildTradeSettleConfirmSummary(
      fullDay,
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
    )
    expect(settle.dayUsdtProfit).toBe(uSum)
    expect(settle.dayVnProfit).toBe(vSum)
    expect(settle.dayTotalProfit).toBe(uSum + vSum)
    expect(settle.tradeCount).toBe(fullDay.length)
  })

  it('各賣單利潤 = 收款（台幣）− 成本，且成本用賣出前池 @', () => {
    const uMap = computeSellProfitById(opening, cost, fullDay)
    for (const sell of usdtSells(fullDay)) {
      const info = uMap.get(sell.id)
      expect(info?.profit).toBe(sell.fiatAmount - (info?.costBasis ?? 0))
      expect(info?.costBasis).toBe(sell.usdtAmount * (info?.unitCost ?? 0))
    }

    const vMap = computeVnTradeAnalytics(
      opening,
      vnTwdRate,
      vnUsdtRate,
      cost,
      fullDay,
    ).sellProfitById
    for (const sell of vnSells(fullDay)) {
      const info = vMap.get(sell.id)
      expect(info?.costBasis).toBeCloseTo(
        sell.vnAmount / (info?.unitCost ?? 1),
        4,
      )
      if (sell.payCurrency === 'twd') {
        expect(info?.profit).toBe(sell.twdAmount - (info?.costBasis ?? 0))
      } else {
        const proceeds = (info?.profit ?? 0) + (info?.costBasis ?? 0)
        expect(proceeds).toBeGreaterThan(info?.costBasis ?? 0)
      }
    }
  })
})

describe('營業開銷與月結', () => {
  const opening: Balances = { twd: 1_000_000, usdt: 0, vn: 0 }
  const cost: UsdtInventoryCost = { twd: 32, vn: null }

  it('進行中開銷不影響餘額重算', () => {
    const trades: Transaction[] = [
      usdtBuy('b1', at(10), 100, 320_000),
    ]
    const withExpense: Transaction[] = [
      ...trades,
      {
        id: 'e1',
        timestamp: at(11),
        category: 'expense',
        expenseType: 'fuel',
        amountTwd: 50_000,
        note: '',
      },
    ]

    const tradeOnly = recalculateBalances(trades, opening)
    const withExpenseBal = recalculateBalances(withExpense, opening)

    expect(withExpenseBal).toEqual(tradeOnly)
    expect(withExpenseBal.twd).toBe(opening.twd - 320_000)
  })

  it('T／U 開銷合計：台幣現金與 USDT 分開', () => {
    const expenses: Transaction[] = [
      {
        id: 'e-t',
        timestamp: at(10),
        category: 'expense',
        expenseType: 'fuel',
        payCurrency: 'twd',
        amountTwd: 1_000,
        note: '油資',
      },
      {
        id: 'e-u',
        timestamp: at(11),
        category: 'expense',
        expenseType: 'other',
        payCurrency: 'usdt',
        amountUsdt: 100,
        amountTwd: 3_227,
        note: '買 trx',
      },
    ]
    expect(computeDayExpenseTwdCashTotal(expenses)).toBe(1_000)
    expect(computeDayExpenseUsdtTotal(expenses)).toBe(100)
    expect(computeDayExpenseTotal(expenses)).toBe(4_227)
  })

  it('EXP.SUM 刪除加回：僅 RECON items 有帳面影響', () => {
    expect(
      balanceImpactFromCumulativeExpense({
        amountTwd: 20_000,
        note: 'manual',
      } as { amountTwd: number }),
    ).toEqual({ twdCash: 0, usdt: 0 })

    expect(
      balanceImpactFromCumulativeExpense({
        amountTwd: 23_227,
        items: [
          { amountTwd: 20_000, payCurrency: 'twd' },
          { amountTwd: 3_227, payCurrency: 'usdt', amountUsdt: 100 },
        ],
      }),
    ).toEqual({ twdCash: 20_000, usdt: 100 })
  })

  it('U 開銷艙扣減：B→A', () => {
    expect(
      deductUsdtFromCabinsBAC({ a: 50, b: 100 }, 100),
    ).toEqual({ a: 50, b: 0 })
    expect(
      deductUsdtFromCabinsBAC({ a: 10, b: 55 }, 40),
    ).toEqual({ a: 10, b: 15 })
  })

  it('applyExpenseTransaction：U 扣 P、T 扣台幣', () => {
    const bal: Balances = { twd: 10_000, usdt: 200, vn: 0 }
    expect(
      applyExpenseTransaction(bal, {
        id: 'e1',
        timestamp: at(10),
        category: 'expense',
        expenseType: 'other',
        payCurrency: 'usdt',
        amountUsdt: 50,
        amountTwd: 1_600,
        note: '',
      }),
    ).toEqual({ twd: 10_000, usdt: 150, vn: 0 })
    expect(
      applyExpenseTransaction(bal, {
        id: 'e2',
        timestamp: at(10),
        category: 'expense',
        expenseType: 'fuel',
        payCurrency: 'twd',
        amountTwd: 1_000,
        note: '',
      }),
    ).toEqual({ twd: 9_000, usdt: 200, vn: 0 })
  })

  it('月結：RECON 已扣帳時實際總資產與帳面一致；淨利 = 毛利 − 開銷', () => {
    // 帳面已含 RECON 扣帳後餘額（例：原 1,000,000 − 開銷 30,000）
    const bookAfterRecon = 970_000
    const close = buildMonthlyClose(
      '6月份',
      [
        {
          id: 's1',
          settledAt: at(18),
          dateLabel: '06/20',
          twdBalance: 650_000,
          usdtBalance: 100,
          vnBalance: 0,
          usdtInventoryAvgTwd: 32,
          usdtInventoryAvgVn: null,
          dayBuyAvgTwd: 32,
          dayBuyAvgVn: null,
          totalAssetsTwd: bookAfterRecon,
          totalAssetsTwdCash: 650_000,
          totalAssetsUsdtInTwd: 320_000,
          totalAssetsVnInTwd: 0,
          dayVnTwdRate: null,
          dayVnUsdtRate: null,
          totalAssetsComplete: true,
          totalAssetsMissingNotes: '',
          transactionCount: 1,
          dayTotalProfit: 10_000,
        },
      ],
      [
        {
          id: 'ex1',
          settledAt: at(19),
          dateLabel: '06/20 月結封存',
          twdBalance: 650_000,
          expenseCount: 1,
          expenseTotal: 30_000,
          items: [
            {
              expenseType: 'fuel',
              amountTwd: 30_000,
              note: '',
              timestamp: at(12),
            },
          ],
        },
      ],
      opening,
      cost,
      null,
      null,
      bookAfterRecon,
    )

    expect(close.closingBookTotalAssets).toBe(bookAfterRecon)
    expect(close.closingTotalAssets).toBe(bookAfterRecon)
    expect(close.netProfit).toBe(10_000 - 30_000)
    expect(close.openingTotalAssets).toBe(bookAfterRecon - close.netProfit)
  })
})

describe('usdt cabin quantity (shared cost)', () => {
  it('migrates old data so A≈30000 and rest is B', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 0 }
    const txs: Transaction[] = [
      usdtBuy('b1', at(1), 20_000, 640_000),
      usdtBuy('b2', at(2), 16_000, 512_000),
      usdtSell('s1', at(3), 625, 20_000),
    ]
    const migrated = migrateUsdtCabinAttribution(opening, undefined, txs)
    expect(migrated.didMigrate).toBe(true)
    const cabins = computeUsdtCabinBalances(
      opening,
      migrated.openingUsdtCabinA,
      migrated.transactions,
      null,
      migrated.openingUsdtCabinB,
    )
    expect(cabins.a + cabins.b).toBe(20_000 + 16_000 - 625)
    expect(cabins.a).toBeGreaterThanOrEqual(30_000)
  })

  it('keeps shared inventory cost unchanged by cabin tags', () => {
    const opening: Balances = { twd: 1_000_000, usdt: 0, vn: 0 }
    const cost: UsdtInventoryCost = { twd: null, vn: null }
    const txs: Transaction[] = [
      { ...usdtBuy('b1', at(1), 10_000, 320_000), cabin: 'A' },
      { ...usdtBuy('b2', at(2), 10_000, 330_000), cabin: 'B' },
    ]
    const inventory = computeInventoryCost(opening, cost, txs)
    expect(inventory.twd).toBe(roundUsdtCostRate((320_000 + 330_000) / 20_000))
  })

  it('splits one buy across A and B with shared cost', () => {
    const opening: Balances = { twd: 1_000_000, usdt: 0, vn: 0 }
    const txs: Transaction[] = [
      {
        ...usdtBuy('b1', at(1), 10_000, 320_000),
        cabinAAmount: 6_000,
        cabin: 'A',
      },
    ]
    const cabins = computeUsdtCabinBalances(opening, 0, txs)
    expect(cabins.a).toBe(6_000)
    expect(cabins.b).toBe(4_000)
    const inventory = computeInventoryCost(opening, { twd: null, vn: null }, txs)
    expect(inventory.twd).toBe(roundUsdtCostRate(320_000 / 10_000))
  })

  it('splits one buy across A and B with shared cost', () => {
    const opening: Balances = { twd: 1_000_000, usdt: 0, vn: 0 }
    const txs: Transaction[] = [
      {
        ...usdtBuy('b1', at(1), 10_000, 320_000),
        cabinAAmount: 4_000,
        cabinBAmount: 6_000,
        cabin: 'A',
      },
    ]
    const cabins = computeUsdtCabinBalances(opening, 0, txs)
    expect(cabins).toEqual({ a: 4_000, b: 6_000 })
    const inventory = computeInventoryCost(opening, { twd: null, vn: null }, txs)
    expect(inventory.twd).toBe(roundUsdtCostRate(320_000 / 10_000))
  })

  it('allows paying VN buy from legacy C tag (merged into B)', () => {
    const opening: Balances = { twd: 0, usdt: 36_325, vn: 0 }
    const tx = {
      id: 'vn1',
      timestamp: at(1),
      category: 'vn_trade',
      type: 'buy',
      payCurrency: 'usdt',
      vnAmount: 52_000_000,
      twdAmount: 0,
      usdtAmount: 1_900,
      rate: 1,
      cabinAAmount: 0,
      cabinBAmount: 0,
      cabin: 'C',
    } as unknown as Transaction
    const err = validateTransactions([tx], opening, null, 33_325, 0)
    expect(err).toBeNull()
  })

  it('rebalances A/B by adjusting opening cabin A/B', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 0 }
    const txs: Transaction[] = [
      { ...usdtBuy('b1', at(1), 30_000, 960_000), cabinAAmount: 30_000, cabinBAmount: 0, cabin: 'A' },
      { ...usdtBuy('b2', at(2), 100_000, 3_200_000), cabinAAmount: 0, cabinBAmount: 100_000, cabin: 'B' },
    ]
    const before = computeUsdtCabinBalances(opening, 0, txs)
    expect(before).toEqual({ a: 30_000, b: 100_000 })

    const next = openingUsdtCabinsAfterRebalance(0, 0, before, 50_000, 80_000, 130_000)
    const after = computeUsdtCabinBalances(opening, next.a, txs, null, next.b)
    expect(after).toEqual({ a: 50_000, b: 80_000 })
    expect(after.a + after.b).toBe(130_000)
  })

  it('restores A/B from absolute snapshot after reload-like drift', () => {
    const opening: Balances = { twd: 0, usdt: 0, vn: 0 }
    const txs: Transaction[] = [
      { ...usdtBuy('b1', at(1), 30_000, 960_000), cabinAAmount: 30_000, cabinBAmount: 0, cabin: 'A' },
      { ...usdtBuy('b2', at(2), 100_000, 3_200_000), cabinAAmount: 0, cabinBAmount: 100_000, cabin: 'B' },
    ]
    const snapshot = { a: 50_000, b: 40_000, c: 40_000 }
    const drifted = computeUsdtCabinBalances(opening, 0, txs, null, 0)
    const aligned = alignOpeningUsdtCabinsToSnapshot(0, 0, drifted, snapshot, 130_000)
    const restored = computeUsdtCabinBalances(opening, aligned.a, txs, null, aligned.b)
    expect(restored).toEqual({ a: 50_000, b: 80_000 })
  })

  it('transfers amount from one cabin to another', () => {
    const before = { a: 10_000, b: 20_500 }
    const result = transferUsdtBetweenCabins(before, 'A', 'B', 5_000)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.next).toEqual({ a: 5_000, b: 25_500 })
    }
    expect(transferUsdtBetweenCabins(before, 'A', 'A', 1).ok).toBe(false)
    expect(transferUsdtBetweenCabins(before, 'A', 'B', 20_000).ok).toBe(false)
  })

  it('A→B transfer via opening delta keeps B increase (does not spill into C)', () => {
    const opening: Balances = { twd: 0, usdt: 82_053, vn: 0 }
    const openingA = 21_956
    const openingB = 60_097
    const before = computeUsdtCabinBalances(opening, openingA, [], null, openingB)
    expect(before).toEqual({ a: 21_956, b: 60_097 })

    const transferred = transferUsdtBetweenCabins(before, 'A', 'B', 21_956)
    expect(transferred.ok).toBe(true)
    if (!transferred.ok) return

    // 模擬修正後 handleRebalanceCabins：直接套用差值
    const nextOpeningA = openingA + (transferred.next.a - before.a)
    const nextOpeningB = openingB + (transferred.next.b - before.b)
    const after = computeUsdtCabinBalances(opening, nextOpeningA, [], null, nextOpeningB)
    expect(after).toEqual({ a: 0, b: 82_053 })
  })

  it('AL freeze preserves cabins after ADJ and same-day trades', () => {
    const opening: Balances = { twd: 0, usdt: 100_000, vn: 0 }
    const txs: Transaction[] = [
      {
        ...usdtBuy('b1', at(10), 10_000, 324_000),
        cabinAAmount: 0,
        cabinBAmount: 10_000,
        cabin: 'B',
      },
    ]
    const beforeAdj = computeUsdtCabinBalances(opening, 30_000, txs, null, 0)
    expect(beforeAdj).toEqual({ a: 30_000, b: 80_000 })

    const transferred = transferUsdtBetweenCabins(beforeAdj, 'B', 'A', 10_000)
    expect(transferred.ok).toBe(true)
    if (!transferred.ok) return

    const openingA = 30_000 + (transferred.next.a - beforeAdj.a)
    const openingB = 0 + (transferred.next.b - beforeAdj.b)
    const afterAdj = computeUsdtCabinBalances(opening, openingA, txs, null, openingB)
    expect(afterAdj).toEqual({ a: 40_000, b: 70_000 })

    const { before, after } = simulateCabinFreezeAfterTradeSettle(
      opening,
      openingA,
      openingB,
      txs,
      null,
    )
    expect(before).toEqual(afterAdj)
    expect(after).toEqual(before)
  })

  it('AL freeze preserves ADJ after A→B transfer', () => {
    const opening: Balances = { twd: 0, usdt: 82_053, vn: 0 }
    const openingA = 21_956
    const openingB = 50_097
    const beforeAdj = computeUsdtCabinBalances(opening, openingA, [], null, openingB)
    expect(beforeAdj).toEqual({ a: 21_956, b: 60_097 })

    const transferred = transferUsdtBetweenCabins(beforeAdj, 'A', 'B', 5_000)
    expect(transferred.ok).toBe(true)
    if (!transferred.ok) return

    const nextOpeningA = openingA + (transferred.next.a - beforeAdj.a)
    const nextOpeningB = openingB + (transferred.next.b - beforeAdj.b)
    const afterAdj = computeUsdtCabinBalances(opening, nextOpeningA, [], null, nextOpeningB)
    expect(afterAdj).toEqual({ a: 16_956, b: 65_097 })

    const { before, after } = simulateCabinFreezeAfterTradeSettle(
      opening,
      nextOpeningA,
      nextOpeningB,
      [],
      null,
    )
    expect(before).toEqual(afterAdj)
    expect(after).toEqual(before)
  })

  it('A→B transfer credits B without changing total', () => {
    const opening: Balances = { twd: 0, usdt: 82_053, vn: 0 }
    const openingA = 21_956
    const openingB = 50_097
    const before = computeUsdtCabinBalances(opening, openingA, [], null, openingB)
    expect(before).toEqual({ a: 21_956, b: 60_097 })

    const transferred = transferUsdtBetweenCabins(before, 'A', 'B', 5_000)
    expect(transferred.ok).toBe(true)
    if (!transferred.ok) return

    const nextOpeningA = openingA + (transferred.next.a - before.a)
    const nextOpeningB = openingB + (transferred.next.b - before.b)
    const after = computeUsdtCabinBalances(opening, nextOpeningA, [], null, nextOpeningB)
    expect(after).toEqual({
      a: 16_956,
      b: 65_097,
    })
  })

  it('allows USDT spend when history TWD replay fails but current P/cabin is enough', () => {
    const err = resolveUsdtSpendValidationError('台幣庫存不足', {
      spendsTwd: false,
      balances: { twd: 0, usdt: 167_530, vn: 0 },
      cabins: { a: 27_000, b: 140_530 },
      usdtAmount: 1_988,
      cabinAAmount: 0,
      cabinBAmount: 0,
    })
    expect(err).toBeNull()
  })

  it('allows USDT spend from B when history reports A cabin short', () => {
    const err = resolveUsdtSpendValidationError('A 艙 USDT 不足', {
      spendsTwd: false,
      balances: { twd: 324_100, usdt: 63_722, vn: 0 },
      cabins: { a: 6, b: 63_716 },
      usdtAmount: 45_513,
      cabinAAmount: 0,
      cabinBAmount: 45_513,
    })
    expect(err).toBeNull()
  })

  it('still blocks USDT spend when current cabin really is short', () => {
    const err = resolveUsdtSpendValidationError('A 艙 USDT 不足', {
      spendsTwd: false,
      balances: { twd: 324_100, usdt: 63_722, vn: 0 },
      cabins: { a: 6, b: 63_716 },
      usdtAmount: 45_513,
      cabinAAmount: 45_513,
      cabinBAmount: 0,
    })
    expect(err).toBe('A 艙 USDT 不足')
  })

  it('allows USDT buy when history USDT is overdrawn but current TWD is enough', () => {
    const err = resolveUsdtSpendValidationError('USDT 庫存不足', {
      spendsTwd: true,
      balances: { twd: 372_000, usdt: -3_248, vn: 0 },
      cabins: { a: 0, b: -3_248 },
      usdtAmount: 10_000,
      cabinAAmount: 0,
      cabinBAmount: 10_000,
      fiatAmount: 324_700,
    })
    expect(err).toBeNull()
  })

  it('allows IE buy U when current TWD is insufficient (T overdraft)', () => {
    const err = resolveUsdtSpendValidationError('台幣庫存不足', {
      spendsTwd: true,
      balances: { twd: 100_000, usdt: 0, vn: 0 },
      cabins: { a: 0, b: 0 },
      usdtAmount: 10_000,
      cabinAAmount: 0,
      cabinBAmount: 10_000,
      fiatAmount: 324_700,
    })
    expect(err).toBeNull()
  })

  it('allows IE buy U even when history reports USDT short and TWD is short', () => {
    const err = resolveUsdtSpendValidationError('USDT 庫存不足', {
      spendsTwd: true,
      balances: { twd: 100_000, usdt: -3_248, vn: 0 },
      cabins: { a: 0, b: -3_248 },
      usdtAmount: 10_000,
      cabinAAmount: 0,
      cabinBAmount: 10_000,
      fiatAmount: 324_700,
    })
    expect(err).toBeNull()
  })

  it('IE and IV pay T both allow T overdraft', () => {
    const opening: Balances = { twd: 50_000, usdt: 0, vn: 0 }
    const ieBuy: UsdtTransaction = {
      id: 'ie1',
      timestamp: at(10),
      category: 'usdt',
      type: 'buy',
      fiatCurrency: 'twd',
      usdtAmount: 10_000,
      fiatAmount: 320_000,
      rate: 32,
    }
    expect(validateTransactions([ieBuy], opening)).toBeNull()
    expect(recalculateBalances([ieBuy], opening).twd).toBe(50_000 - 320_000)

    const ivBuyT: VnTradeTransaction = {
      id: 'iv1',
      timestamp: at(11),
      category: 'vn_trade',
      type: 'buy',
      payCurrency: 'twd',
      vnAmount: 1_000_000_000,
      twdAmount: 100_000,
      usdtAmount: 0,
      rate: 10_000,
    }
    expect(validateTransactions([ivBuyT], opening)).toBeNull()
    expect(recalculateBalances([ivBuyT], opening).twd).toBe(50_000 - 100_000)
  })

  it('allows IV buy VN paying T when current TWD is insufficient (T overdraft)', () => {
    const err = resolveVnTwdLegValidationError('台幣庫存不足', {
      type: 'buy',
      balances: { twd: 10_000, usdt: 0, vn: 0 },
      vnAmount: 1_000_000_000,
      twdAmount: 100_000,
    })
    expect(err).toBeNull()
  })

  it('allows VN sell for TWD when history reports A cabin short', () => {
    const err = resolveVnTwdLegValidationError('A 艙 USDT 不足', {
      type: 'sell',
      balances: { twd: 324_100, usdt: 18_209, vn: 37.5698 },
      vnAmount: 28.14,
      twdAmount: 350,
    })
    expect(err).toBeNull()
  })

  it('allows VN sell when current VN is insufficient (V overdraft)', () => {
    const err = resolveVnTwdLegValidationError('VN 庫存不足', {
      type: 'sell',
      balances: { twd: 324_100, usdt: 18_209, vn: 10 },
      vnAmount: 28.14,
      twdAmount: 350,
    })
    expect(err).toBeNull()

    const opening: Balances = { twd: 0, usdt: 0, vn: 10 }
    const ov: VnTradeTransaction = {
      id: 'ov1',
      timestamp: at(12),
      category: 'vn_trade',
      type: 'sell',
      payCurrency: 'twd',
      vnAmount: 28.14,
      twdAmount: 350,
      usdtAmount: 0,
      rate: 80_400,
    }
    expect(validateTransactions([ov], opening)).toBeNull()
    expect(recalculateBalances([ov], opening).vn).toBeCloseTo(10 - 28.14)
  })

  it('assigns opening P increases to cabin A', () => {
    expect(adjustOpeningUsdtCabins(100, 30, 40, 120)).toEqual({ a: 50, b: 70 })
  })

  it('deducts opening P decreases from cabin A before B', () => {
    expect(adjustOpeningUsdtCabins(100, 30, 40, 80)).toEqual({ a: 10, b: 70 })
    expect(adjustOpeningUsdtCabins(100, 30, 40, 50)).toEqual({ a: 0, b: 50 })
  })

  it('applies opening P delta to the chosen cabin', () => {
    const current = { a: 30, b: 70 }
    expect(
      applyOpeningUsdtDeltaToCabin(30, 40, current, 20, 'B', 120),
    ).toEqual({ ok: true, a: 30, b: 60 })
    expect(
      applyOpeningUsdtDeltaToCabin(30, 40, current, -25, 'A', 75),
    ).toEqual({ ok: true, a: 5, b: 40 })
  })

  it('rejects opening P decrease when chosen cabin is short', () => {
    const current = { a: 30, b: 70 }
    expect(applyOpeningUsdtDeltaToCabin(30, 40, current, -80, 'B', 20).ok).toBe(false)
  })
})

describe('SET VN rates by pay currency', () => {
  it('returns separate P and T averages for mixed IV rows', () => {
    const txs: VnTradeTransaction[] = [
      {
        id: 'iv-p',
        timestamp: at(10),
        category: 'vn_trade',
        type: 'buy',
        payCurrency: 'usdt',
        vnAmount: 25962.79 * 11_555,
        twdAmount: 0,
        usdtAmount: 11_555,
        rate: 25_962.79,
      },
      {
        id: 'iv-t',
        timestamp: at(11),
        category: 'vn_trade',
        type: 'buy',
        payCurrency: 'twd',
        vnAmount: 813.01 * 984_000,
        twdAmount: 984_000,
        usdtAmount: 0,
        rate: 813.01,
      },
    ]
    const rates = summarizeVnRatesByPayCurrency(txs)
    expect(rates.usdt).toBe(25_962.79)
    expect(rates.twd).toBe(813.01)
  })
})

describe('total assets valuation', () => {
  it('values positive VN at frozen V@', () => {
    const assets = computeTotalAssetsAtCostRates(
      { twd: 100_000, usdt: 0, vn: 80_400 },
      null,
      80_400,
      null,
    )
    expect(assets.vnInTwd).toBe(1)
    expect(assets.total).toBe(100_001)
    expect(assets.isComplete).toBe(true)
  })

  it('values negative VN as liability using frozen V@', () => {
    const assets = computeTotalAssetsAtCostRates(
      { twd: 868_900, usdt: 149_087, vn: -78_130_000 },
      32.137,
      80_400,
      null,
    )
    expect(assets.vnInTwd).toBe(-971)
    const usdtInTwd = Math.trunc(149_087 * 32.137)
    expect(assets.usdtInTwd).toBe(usdtInTwd)
    expect(assets.total).toBe(868_900 + usdtInTwd - 971)
    expect(assets.isComplete).toBe(true)
  })

  it('marks incomplete when VN is short and V@ is missing', () => {
    const assets = computeTotalAssetsAtCostRates(
      { twd: 100_000, usdt: 0, vn: -1_000 },
      null,
      null,
      null,
    )
    expect(assets.vnInTwd).toBeNull()
    expect(assets.missingNotes).toContain('VN 無料金均價')
    expect(assets.isComplete).toBe(false)
    expect(assets.total).toBe(100_000)
  })

  it('treats zero VN as zero valuation without rate', () => {
    const assets = computeTotalAssetsAtCostRates(
      { twd: 50_000, usdt: 0, vn: 0 },
      null,
      null,
      null,
    )
    expect(assets.vnInTwd).toBe(0)
    expect(assets.isComplete).toBe(true)
  })
})

describe('結算日凍結 @ 利潤（本地 4 號情境）', () => {
  /** 3 號結算後期初 */
  const opening: Balances = { twd: 2_848_758, usdt: 5_737, vn: 1_912_560_000 }
  const cost: UsdtInventoryCost = { twd: 32.48, vn: null }
  const vnTwdRate = 808.76
  const vnUsdtRate = 26_209

  const day4: Transaction[] = [
    usdtBuy('ie-1', at(9), 13_850, 450_000),
    usdtBuy('ie-2', at(9, 1), 42_835, 1_390_400),
    usdtBuy('ie-3', at(9, 2), 19_917, 647_400),
    usdtBuy('ie-4', at(9, 3), 5_000, 162_400),
    usdtSell('oe-1', at(10), 12_304, 402_700),
    usdtBuy('ie-5', at(11), 7_018, 228_000),
    vnSellTwd('ov-1', at(12), 310_050_000, 390_000),
    vnSellTwd('ov-2', at(12, 1), 310_000_000, 389_400),
  ]

  it('OE PF = 賣出量 ×（當日賣均 − 最新 U@）；最新 U@＝前日＋IE 加權', () => {
    const rates = computeSettleDayInventoryRates(
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
      day4,
    )
    const latestU = rates.usdt.twd!
    const sellAvg = 402_700 / 12_304
    const pf = computeSettleDayUsdtProfit(latestU, day4)
    expect(pf).toBeCloseTo(12_304 * (sellAvg - latestU), 5)
    expect(latestU).toBeCloseTo(32.478, 3)
  })

  it('OV PF = 收款 − VN ÷ 最新 V@；無 IV 則最新＝前日', () => {
    const rates = computeSettleDayInventoryRates(
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
      day4,
    )
    expect(rates.vnTwdRate).toBe(808.76)
    const pf = computeSettleDayVnProfit(rates.vnTwdRate, rates.usdt.twd, day4)
    // 表列 T 縮寫還原：390000+389400=779400；賣均 = ΣVN/ΣT
    const sellAvg = 620_050_000 / 779_400
    expect(pf).toBeCloseTo(779_400 - 620_050_000 / 808.76, 2)
    expect(pf).toBeCloseTo((779_400 * (808.76 - sellAvg)) / 808.76, 2)
  })

  it('結算確認摘要利潤與最新 @ 公式一致', () => {
    const rates = computeSettleDayInventoryRates(
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
      day4,
    )
    const summary = buildTradeSettleConfirmSummary(
      day4,
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
    )
    expect(summary.dayUsdtProfit).toBeCloseTo(
      computeSettleDayUsdtProfit(rates.usdt.twd, day4),
      5,
    )
    expect(summary.dayVnProfit).toBeCloseTo(
      computeSettleDayVnProfit(rates.vnTwdRate, rates.usdt.twd, day4),
      5,
    )
  })

  it('結算新 U@ = 期初×前日@ + 當日買入加權；無 IV 則 V@ 不變', () => {
    const rates = computeSettleDayInventoryRates(
      opening,
      cost,
      vnTwdRate,
      vnUsdtRate,
      day4,
    )
    const buyQty = 13_850 + 42_835 + 19_917 + 5_000 + 7_018
    const buyFiat = 450_000 + 1_390_400 + 647_400 + 162_400 + 228_000
    const dayBuyAvg = buyFiat / buyQty
    const expectedU =
      (opening.usdt * 32.48 + buyQty * dayBuyAvg) / (opening.usdt + buyQty)

    expect(rates.usdt.twd).toBeCloseTo(expectedU, 3)
    expect(rates.vnTwdRate).toBe(808.76)
    expect(rates.vnUsdtRate).toBe(26_209)
  })
})

describe('searchSettlementTradesByNote', () => {
  const settlementBase = {
    twdBalance: 0,
    usdtBalance: 0,
    vnBalance: 0,
    usdtInventoryAvgTwd: 32,
    usdtInventoryAvgVn: null,
    dayBuyAvgTwd: null,
    dayBuyAvgVn: null,
    totalAssetsTwd: 0,
    totalAssetsTwdCash: 0,
    totalAssetsUsdtInTwd: 0,
    totalAssetsVnInTwd: 0,
    dayVnTwdRate: null,
    dayVnUsdtRate: null,
    totalAssetsComplete: true,
    totalAssetsMissingNotes: '',
    transactionCount: 1,
    dayTotalProfit: 0,
  } satisfies Omit<DailySettlement, 'id' | 'settledAt' | 'dateLabel' | 'trades' | 'sellProfitById'>

  it('matches note case-insensitively in current settlements', () => {
    const trade: UsdtTransaction = {
      id: 't1',
      timestamp: at(10),
      category: 'usdt',
      type: 'buy',
      fiatCurrency: 'twd',
      usdtAmount: 1000,
      fiatAmount: 32_000,
      rate: 32,
      note: 'Guo',
    }
    const settlements: DailySettlement[] = [
      {
        ...settlementBase,
        id: 's1',
        settledAt: at(12),
        dateLabel: '10 12:00',
        trades: [trade],
      },
    ]
    const hits = searchSettlementTradesByNote(settlements, [], 'guo')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.pane).toBe('IE')
    expect(hits[0]?.trade.id).toBe('t1')
  })

  it('includes archived monthly tradeSettlements and sell profit', () => {
    const sell: UsdtTransaction = {
      id: 'oe1',
      timestamp: at(11),
      category: 'usdt',
      type: 'sell',
      fiatCurrency: 'twd',
      usdtAmount: 500,
      fiatAmount: 16_000,
      rate: 32,
      note: 'an',
    }
    const archived: DailySettlement = {
      ...settlementBase,
      id: 's2',
      settledAt: at(13),
      dateLabel: '9 22:27',
      trades: [sell],
      sellProfitById: { oe1: 1200 },
    }
    const monthlyCloses: MonthlyClose[] = [
      {
        id: 'mc1',
        periodLabel: '7月',
        closedAt: at(14),
        actualStartDate: at(8),
        actualEndDate: at(13),
        grossProfit: 1200,
        usdtProfit: 1200,
        vnProfit: 0,
        expenseTotal: 0,
        netProfit: 1200,
        expenseByCategory: {
          fuel: 0,
          parking: 0,
          meal: 0,
          traffic: 0,
          other: 0,
        },
        openingTotalAssets: 0,
        closingBalances: { twd: 0, usdt: 0, vn: 0 },
        closingUsdtCost: { twd: 32, vn: null },
        closingVnTwdRate: null,
        closingVnUsdtRate: null,
        closingTotalAssets: 0,
        closingBookTotalAssets: 0,
        tradeSettlements: [archived],
        expenseSettlements: [],
      },
    ]
    const hits = searchSettlementTradesByNote([], monthlyCloses, 'an')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.monthlyClosePeriodLabel).toBe('7月')
    expect(hits[0]?.profit).toBe(1200)
    expect(settlementTradePane(sell)).toBe('OE')
  })

  it('returns empty for blank query', () => {
    expect(searchSettlementTradesByNote([], [], '  ')).toEqual([])
  })
})

describe('settlementDisplaySplitProfits（逐筆 PF 與卡片一致）', () => {
  it('VN 顯示用加總＝各筆 format 後相加，而非 raw 總額再 round', () => {
    // 模擬：raw 加總 round 後會是 1.78，但 1.08+0.69=1.77
    const p1 = 10_845 // → 1.08
    const p2 = 6_935 // → 0.69；raw sum 17_780 → 1.78
    const item: DailySettlement = {
      id: 's5',
      settledAt: new Date(),
      dateLabel: '5 12:00',
      twdBalance: 0,
      usdtBalance: 0,
      vnBalance: 0,
      usdtInventoryAvgTwd: null,
      usdtInventoryAvgVn: null,
      dayBuyAvgTwd: null,
      dayBuyAvgVn: null,
      totalAssetsTwd: 0,
      totalAssetsTwdCash: 0,
      totalAssetsUsdtInTwd: 0,
      totalAssetsVnInTwd: 0,
      dayVnTwdRate: null,
      dayVnUsdtRate: null,
      totalAssetsComplete: true,
      totalAssetsMissingNotes: '',
      transactionCount: 2,
      dayUsdtProfit: 0,
      dayVnProfit: p1 + p2,
      dayTotalProfit: p1 + p2,
      trades: [vnSellTwd('ov-1', at(12), 1, 1), vnSellTwd('ov-2', at(12, 1), 1, 1)],
      sellProfitById: { 'ov-1': p1, 'ov-2': p2 },
    }

    const split = settlementDisplaySplitProfits(item)
    expect(formatProfit(p1 + p2)).toBe('+1.78')
    expect(roundTwdTableCompact(p1) + roundTwdTableCompact(p2)).toBeCloseTo(1.77, 5)
    expect(formatProfit(split.vn!)).toBe('+1.77')
    expect(split.usdt).toBe(0)
  })
})

