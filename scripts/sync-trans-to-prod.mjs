/**
 * 將本機 TRANS 相關狀態同步到正式站，保留正式站 EXP / EXP.SUM / notes 等其他頁面資料。
 *
 * 用法：node scripts/sync-trans-to-prod.mjs
 */
const LOCAL_BASE = (process.env.LOCAL_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const LOCAL_PIN = process.env.LOCAL_PIN
const PROD_BASE = (
  process.env.PROD_API_BASE_URL ?? 'https://ext-api-production.up.railway.app'
).replace(/\/$/, '')
const PROD_TOKEN = process.env.PROD_API_TOKEN

if (!LOCAL_PIN) {
  console.error('Missing LOCAL_PIN')
  process.exit(1)
}
if (!PROD_TOKEN) {
  console.error('Missing PROD_API_TOKEN')
  process.exit(1)
}

function isTradeTx(tx) {
  return tx?.category === 'usdt' || tx?.category === 'vn_trade'
}

function isExpenseTx(tx) {
  return tx?.category === 'expense'
}

async function loginLocal() {
  const res = await fetch(`${LOCAL_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: LOCAL_PIN }),
  })
  if (!res.ok) throw new Error(`local login failed: HTTP ${res.status}`)
  const body = await res.json()
  if (!body?.token) throw new Error('local login missing token')
  return body.token
}

async function getState(base, token) {
  const res = await fetch(`${base}/api/state`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GET ${base}/api/state failed: HTTP ${res.status}`)
  return res.json()
}

async function putState(base, token, state) {
  const res = await fetch(`${base}/api/state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(state),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`PUT ${base}/api/state failed: HTTP ${res.status} ${text}`)
  }
  return text
}

function summarize(label, state) {
  const txs = Array.isArray(state?.transactions) ? state.transactions : []
  const trade = txs.filter(isTradeTx)
  const expense = txs.filter(isExpenseTx)
  const ob = state?.openingBalances ?? {}
  const snap = state?.usdtCabinSnapshot
  console.log(
    `[${label}] opening T=${ob.twd} P=${ob.usdt} V=${ob.vn}` +
      ` | cabinA=${state?.openingUsdtCabinA} cabinB=${state?.openingUsdtCabinB}` +
      (snap ? ` snap=${snap.a}/${snap.b}/${snap.c}` : '') +
      ` | tradeTx=${trade.length} expenseTx=${expense.length}` +
      ` | settlements=${state?.settlements?.length ?? 0}` +
      ` | cumulativeExpenses=${state?.cumulativeExpenses?.length ?? 0}` +
      ` | expenseSettlements=${state?.expenseSettlements?.length ?? 0}`,
  )
}

function mergeTransOntoProd(local, prod) {
  const localTrade = (local.transactions ?? []).filter(isTradeTx)
  const prodExpense = (prod.transactions ?? []).filter(isExpenseTx)

  return {
    ...prod,
    // TRANS core
    openingBalances: local.openingBalances,
    openingUsdtCost: local.openingUsdtCost,
    openingUsdtCabinA: local.openingUsdtCabinA,
    openingUsdtCabinB: local.openingUsdtCabinB,
    usdtCabinSnapshot: local.usdtCabinSnapshot,
    openingVnTwdRate: local.openingVnTwdRate ?? null,
    openingVnUsdtRate: local.openingVnUsdtRate ?? null,
    settlements: local.settlements ?? [],
    dailyWorkTab: local.dailyWorkTab ?? prod.dailyWorkTab,
    // keep other pages from prod
    transactions: [...localTrade, ...prodExpense],
    expenseSettlements: prod.expenseSettlements ?? [],
    cumulativeExpenses: prod.cumulativeExpenses ?? [],
    monthlyCloses: prod.monthlyCloses ?? [],
    // don't force activeTab; leave prod's if present
    activeTab: prod.activeTab ?? local.activeTab ?? 'daily',
  }
}

async function main() {
  console.log('1) login local…')
  const localToken = await loginLocal()

  console.log('2) GET local state…')
  const local = await getState(LOCAL_BASE, localToken)
  if (!local) throw new Error('local state is empty')
  summarize('local', local)

  console.log('3) GET prod state…')
  const prod = await getState(PROD_BASE, PROD_TOKEN)
  if (!prod) throw new Error('prod state is empty')
  summarize('prod-before', prod)

  console.log('4) merge TRANS from local onto prod…')
  const merged = mergeTransOntoProd(local, prod)
  summarize('merged', merged)

  console.log('5) PUT merged state to prod…')
  await putState(PROD_BASE, PROD_TOKEN, merged)

  console.log('6) verify prod…')
  const prodAfter = await getState(PROD_BASE, PROD_TOKEN)
  summarize('prod-after', prodAfter)

  const ob = prodAfter.openingBalances
  if (
    ob.twd !== local.openingBalances.twd ||
    ob.usdt !== local.openingBalances.usdt ||
    ob.vn !== local.openingBalances.vn
  ) {
    throw new Error('verify failed: openingBalances mismatch')
  }
  console.log('OK: TRANS synced to prod; EXP/EXP.SUM/monthly kept from prod.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
