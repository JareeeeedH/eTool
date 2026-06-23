/**
 * 本机 API 联调：买卖、日结、开销、月结，约 100 笔交易。
 * 用法：node scripts/e2e-api-test.mjs
 */

const API_BASE = (process.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const API_TOKEN = process.env.VITE_API_TOKEN ?? 'dev-secret'

const INITIAL_BALANCES = { twd: 5_000_000, usdt: 0, vn: 0 }
const EMPTY_USDT_COST = { twd: null, vn: null }
const EXPENSE_TYPES = ['fuel', 'parking', 'meal', 'misc']

const stats = {
  created: { usdtBuy: 0, usdtSell: 0, vnBuy: 0, vnSell: 0, expense: 0 },
  tradeSettles: 0,
  monthlyCloses: 0,
}

function uuid() {
  return crypto.randomUUID()
}

async function apiGet() {
  const res = await fetch(`${API_BASE}/api/state`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  })
  if (!res.ok) throw new Error(`GET failed HTTP ${res.status}`)
  return res.json()
}

async function apiPut(state) {
  const res = await fetch(`${API_BASE}/api/state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(serializeState(state)),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PUT failed HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

function serializeState(s) {
  return {
    activeTab: s.activeTab,
    dailyWorkTab: s.dailyWorkTab,
    openingBalances: s.openingBalances,
    openingUsdtCost: s.openingUsdtCost,
    openingVnTwdRate: s.openingVnTwdRate,
    openingVnUsdtRate: s.openingVnUsdtRate,
    transactions: s.transactions.map(serializeTx),
    settlements: s.settlements.map(serializeSettlement),
    expenseSettlements: s.expenseSettlements.map(serializeExpenseSettlement),
    monthlyCloses: s.monthlyCloses.map(serializeMonthlyClose),
  }
}

function iso(d) {
  return d instanceof Date ? d.toISOString() : d
}

function serializeTx(tx) {
  return { ...tx, timestamp: iso(tx.timestamp) }
}

function serializeSettlement(item) {
  return { ...item, settledAt: iso(item.settledAt) }
}

function serializeExpenseSettlement(item) {
  return {
    ...item,
    settledAt: iso(item.settledAt),
    items: item.items.map((e) => ({ ...e, timestamp: iso(e.timestamp) })),
  }
}

function serializeMonthlyClose(item) {
  return {
    ...item,
    closedAt: iso(item.closedAt),
    actualStartDate: item.actualStartDate ? iso(item.actualStartDate) : null,
    actualEndDate: item.actualEndDate ? iso(item.actualEndDate) : null,
    tradeSettlements: item.tradeSettlements.map(serializeSettlement),
    expenseSettlements: item.expenseSettlements.map(serializeExpenseSettlement),
  }
}

function parseLoaded(raw) {
  if (!raw) return freshState()
  return {
    activeTab: raw.activeTab ?? 'daily',
    dailyWorkTab: raw.dailyWorkTab ?? 'usdt',
    openingBalances: { ...raw.openingBalances },
    openingUsdtCost: { ...raw.openingUsdtCost },
    openingVnTwdRate: raw.openingVnTwdRate ?? null,
    openingVnUsdtRate: raw.openingVnUsdtRate ?? null,
    transactions: (raw.transactions ?? []).map(parseTx),
    settlements: (raw.settlements ?? []).map(parseSettlement),
    expenseSettlements: (raw.expenseSettlements ?? []).map(parseExpenseSettlement),
    monthlyCloses: (raw.monthlyCloses ?? []).map(parseMonthlyClose),
  }
}

function parseTx(tx) {
  return { ...tx, timestamp: new Date(tx.timestamp) }
}

function parseSettlement(item) {
  return { ...item, settledAt: new Date(item.settledAt) }
}

function parseExpenseSettlement(item) {
  return {
    ...item,
    settledAt: new Date(item.settledAt),
    items: item.items.map((e) => ({ ...e, timestamp: new Date(e.timestamp) })),
  }
}

function parseMonthlyClose(item) {
  return {
    ...item,
    closedAt: new Date(item.closedAt),
    actualStartDate: item.actualStartDate ? new Date(item.actualStartDate) : null,
    actualEndDate: item.actualEndDate ? new Date(item.actualEndDate) : null,
    tradeSettlements: item.tradeSettlements.map(parseSettlement),
    expenseSettlements: item.expenseSettlements.map(parseExpenseSettlement),
  }
}

function freshState() {
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

function recalcBalances(transactions, openingBalances) {
  let b = { ...openingBalances }
  const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp)
  for (const tx of sorted) {
    if (tx.category === 'expense') {
      b.twd -= tx.amountTwd
    } else if (tx.category === 'usdt') {
      if (tx.type === 'buy') {
        b.twd -= tx.fiatAmount
        b.usdt += tx.usdtAmount
      } else {
        b.twd += tx.fiatAmount
        b.usdt -= tx.usdtAmount
      }
    } else if (tx.category === 'vn_trade') {
      if (tx.type === 'buy') {
        b.vn += tx.vnAmount
        if (tx.payCurrency === 'twd') b.twd -= tx.twdAmount
        else b.usdt -= tx.usdtAmount
      } else {
        b.vn -= tx.vnAmount
        if (tx.payCurrency === 'twd') b.twd += tx.twdAmount
        else b.usdt += tx.usdtAmount
      }
    }
  }
  return b
}

function isTrade(tx) {
  return tx.category === 'usdt' || tx.category === 'vn_trade'
}

function tradeSettle(state) {
  const tradeTxs = state.transactions.filter(isTrade)
  if (tradeTxs.length === 0) return

  const balances = recalcBalances(state.transactions, state.openingBalances)
  const usdtTxs = state.transactions.filter((t) => t.category === 'usdt')

  let twdCost = state.openingUsdtCost.twd
  let usdtPool = state.openingBalances.usdt
  for (const tx of usdtTxs) {
    if (tx.type === 'buy' && tx.fiatCurrency === 'twd') {
      const totalTwd = (twdCost ?? 0) * usdtPool + tx.fiatAmount
      usdtPool += tx.usdtAmount
      twdCost = usdtPool > 0 ? totalTwd / usdtPool : twdCost
    } else if (tx.type === 'sell' && tx.fiatCurrency === 'twd') {
      usdtPool -= tx.usdtAmount
    }
  }

  const settlement = {
    id: uuid(),
    settledAt: new Date(),
    dateLabel: new Date().toLocaleString('zh-TW') + ' 結算',
    twdBalance: balances.twd,
    usdtBalance: balances.usdt,
    vnBalance: balances.vn,
    usdtInventoryAvgTwd: twdCost,
    usdtInventoryAvgVn: state.openingUsdtCost.vn,
    dayBuyAvgTwd: null,
    dayBuyAvgVn: null,
    totalAssetsTwd: balances.twd,
    totalAssetsTwdCash: balances.twd,
    totalAssetsUsdtInTwd: twdCost != null ? balances.usdt * twdCost : null,
    totalAssetsVnInTwd: 0,
    dayVnTwdRate: state.openingVnTwdRate,
    dayVnUsdtRate: state.openingVnUsdtRate,
    totalAssetsComplete: true,
    totalAssetsMissingNotes: '',
    transactionCount: tradeTxs.length,
    dayUsdtProfit: 0,
    dayVnProfit: 0,
    dayTotalProfit: 0,
  }

  state.settlements.unshift(settlement)
  state.openingBalances = balances
  state.openingUsdtCost = { twd: twdCost, vn: state.openingUsdtCost.vn }
  state.transactions = state.transactions.filter((t) => t.category === 'expense')
  stats.tradeSettles++
}

function monthlyClose(state, label) {
  const balances = recalcBalances(state.transactions, state.openingBalances)
  const pendingExpenses = state.transactions.filter((t) => t.category === 'expense')

  let expenseItems = [...state.expenseSettlements]
  if (pendingExpenses.length > 0) {
    const total = pendingExpenses.reduce((s, t) => s + t.amountTwd, 0)
    expenseItems.push({
      id: uuid(),
      settledAt: new Date(),
      dateLabel: `${label} 月結封存`,
      twdBalance: balances.twd,
      expenseCount: pendingExpenses.length,
      expenseTotal: total,
      items: pendingExpenses.map((tx) => ({
        expenseType: tx.expenseType,
        amountTwd: tx.amountTwd,
        note: tx.note,
        timestamp: tx.timestamp,
      })),
    })
  }

  const grossProfit = state.settlements.reduce((s, x) => s + (x.dayTotalProfit ?? 0), 0)
  const expenseTotal = expenseItems.reduce((s, x) => s + x.expenseTotal, 0)

  const monthly = {
    id: uuid(),
    periodLabel: label,
    closedAt: new Date(),
    actualStartDate: state.settlements.at(-1)?.settledAt ?? new Date(),
    actualEndDate: state.settlements[0]?.settledAt ?? new Date(),
    grossProfit,
    usdtProfit: 0,
    vnProfit: 0,
    expenseTotal,
    netProfit: grossProfit - expenseTotal,
    expenseByCategory: {
      rent: 0,
      fuel: 0,
      parking: 0,
      meal: 0,
      telecom: 0,
      misc: 0,
      other: 0,
    },
    openingTotalAssets: 5_000_000,
    closingBalances: { ...balances },
    closingUsdtCost: { ...state.openingUsdtCost },
    closingVnTwdRate: state.openingVnTwdRate,
    closingVnUsdtRate: state.openingVnUsdtRate,
    closingTotalAssets: 5_000_000 + grossProfit - expenseTotal,
    closingBookTotalAssets: balances.twd,
    tradeSettlements: state.settlements.map((s) => ({ ...s, settledAt: new Date(s.settledAt) })),
    expenseSettlements: expenseItems.map((s) => ({
      ...s,
      settledAt: new Date(s.settledAt),
      items: s.items.map((i) => ({ ...i, timestamp: new Date(i.timestamp) })),
    })),
  }

  for (const es of expenseItems) {
    for (const item of es.items) {
      monthly.expenseByCategory[item.expenseType] =
        (monthly.expenseByCategory[item.expenseType] ?? 0) + item.amountTwd
    }
  }

  state.monthlyCloses.unshift(monthly)
  state.settlements = []
  state.expenseSettlements = []
  state.transactions = []
  state.openingBalances = balances
  stats.monthlyCloses++
}

function addTx(state, tx) {
  state.transactions.push(tx)
}

function makeUsdtBuy(i, at) {
  const usdt = 10 + (i % 40)
  const rate = 31 + (i % 3) * 0.5
  stats.created.usdtBuy++
  return {
    id: uuid(),
    timestamp: at,
    category: 'usdt',
    type: 'buy',
    fiatCurrency: 'twd',
    usdtAmount: usdt,
    fiatAmount: usdt * rate,
    rate,
  }
}

function makeUsdtSell(i, at, balances) {
  const usdt = Math.min(5 + (i % 10), Math.max(0, balances.usdt - 1))
  if (usdt <= 0) return makeUsdtBuy(i, at)
  const rate = 32 + (i % 4) * 0.5
  stats.created.usdtSell++
  return {
    id: uuid(),
    timestamp: at,
    category: 'usdt',
    type: 'sell',
    fiatCurrency: 'twd',
    usdtAmount: usdt,
    fiatAmount: usdt * rate,
    rate,
  }
}

function makeVnBuy(i, at) {
  const vn = 1000 + i * 50
  const twd = 100 + (i % 5) * 20
  stats.created.vnBuy++
  return {
    id: uuid(),
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

function makeVnSell(i, at, balances) {
  const vn = Math.min(500 + i * 20, Math.max(0, balances.vn - 100))
  if (vn <= 100) return makeVnBuy(i, at)
  const twd = 80 + (i % 5) * 15
  stats.created.vnSell++
  return {
    id: uuid(),
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

function makeExpense(i, at) {
  stats.created.expense++
  return {
    id: uuid(),
    timestamp: at,
    category: 'expense',
    expenseType: EXPENSE_TYPES[i % EXPENSE_TYPES.length],
    amountTwd: 100 + (i % 10) * 50,
    note: `e2e-expense-${i}`,
  }
}

function simulate100(state) {
  const base = Date.now() - 100 * 60_000
  for (let i = 0; i < 100; i++) {
    const at = new Date(base + i * 60_000)
    const balances = recalcBalances(state.transactions, state.openingBalances)
    const mod = i % 10

    if (mod <= 4) addTx(state, makeUsdtBuy(i, at))
    else if (mod === 5) addTx(state, makeUsdtSell(i, at, balances))
    else if (mod === 6) addTx(state, makeVnBuy(i, at))
    else if (mod === 7) addTx(state, makeVnSell(i, at, balances))
    else addTx(state, makeExpense(i, at))

    // 每 20 笔后日结（第 20、40、60、80、100 笔 → 共 5 次）
    if ((i + 1) % 20 === 0) {
      tradeSettle(state)
    }
  }
}

function countArchivedTrades(state) {
  let n = state.transactions.filter(isTrade).length
  for (const s of state.settlements) n += s.transactionCount
  for (const m of state.monthlyCloses) {
    for (const s of m.tradeSettlements) n += s.transactionCount
  }
  return n
}

function countArchivedExpenses(state) {
  let n = state.transactions.filter((t) => t.category === 'expense').length
  for (const m of state.monthlyCloses) {
    for (const es of m.expenseSettlements) n += es.expenseCount
  }
  return n
}

function fingerprint(state) {
  return JSON.stringify({
    pendingTx: state.transactions.length,
    settlements: state.settlements.length,
    monthly: state.monthlyCloses.length,
    archivedTrades: countArchivedTrades(state),
    archivedExpenses: countArchivedExpenses(state),
    twd: state.openingBalances.twd,
    usdt: state.openingBalances.usdt,
    vn: state.openingBalances.vn,
  })
}

async function main() {
  console.log('=== E2E API Test (100 transactions) ===')
  console.log(`API: ${API_BASE}`)

  const health = await fetch(`${API_BASE}/health`).then((r) => r.json())
  console.log('Health:', health)
  if (health.status !== 'ok') throw new Error('Backend unhealthy')

  const state = freshState()
  simulate100(state)

  // 月结（打包日结 + 剩余开销）
  monthlyClose(state, 'E2E測試月')

  const totalCreated = Object.values(stats.created).reduce((a, b) => a + b, 0)
  console.log('\n--- Generated ---')
  console.log('Transactions created:', totalCreated, stats.created)
  console.log('Trade daily settles:', stats.tradeSettles)
  console.log('Monthly closes:', stats.monthlyCloses)
  console.log('Archived trade count:', countArchivedTrades(state))
  console.log('Archived expense count:', countArchivedExpenses(state))

  const fp = fingerprint(state)
  console.log('\n--- PUT full state ---')
  const put = await apiPut(state)
  console.log('PUT:', put)

  console.log('\n--- GET #1 (first load) ---')
  const get1 = parseLoaded(await apiGet())
  const fp1 = fingerprint(get1)
  console.log('Fingerprint:', fp1)

  console.log('\n--- GET #2 (refresh) ---')
  const get2 = parseLoaded(await apiGet())
  const fp2 = fingerprint(get2)
  console.log('Fingerprint:', fp2)

  const checks = []
  checks.push(['100 transactions created', totalCreated === 100])
  checks.push(['5 daily trade settles', stats.tradeSettles === 5])
  checks.push(['1 monthly close', stats.monthlyCloses === 1])
  checks.push(['archived trades = 80', countArchivedTrades(get1) === 80])
  checks.push(['archived expenses = 20', countArchivedExpenses(get1) === 20])
  checks.push([
    'monthly has 5 tradeSettlements',
    get1.monthlyCloses[0]?.tradeSettlements?.length === 5,
  ])
  checks.push(['monthly has expenseSettlements', (get1.monthlyCloses[0]?.expenseSettlements?.length ?? 0) >= 1])
  checks.push(['refresh matches', fp1 === fp2])
  checks.push(['persist matches', fp1 === fp])

  console.log('\n=== Results ===')
  let allPass = true
  for (const [name, ok] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`)
    if (!ok) allPass = false
  }

  if (!allPass) process.exit(1)
  console.log('\nALL CHECKS PASSED')
}

main().catch((err) => {
  console.error('ERROR:', err)
  process.exit(1)
})
