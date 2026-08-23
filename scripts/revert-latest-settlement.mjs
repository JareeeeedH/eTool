/**
 * 退回本地最新一筆 AL 交易日結：封存明細回 TRANS，opening 還原至該日前。
 *
 * 用法：npx tsx scripts/revert-latest-settlement.mjs
 */
import { revertLatestTradeSettlement } from '../src/domain/index.ts'

const LOCAL_BASE = (process.env.LOCAL_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const LOCAL_PIN = process.env.LOCAL_PIN ?? process.env.ACCESS_PIN

if (!LOCAL_PIN) {
  console.error('Missing LOCAL_PIN (or ACCESS_PIN)')
  process.exit(1)
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

async function getState(token) {
  const res = await fetch(`${LOCAL_BASE}/api/state`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GET state failed: HTTP ${res.status}`)
  return res.json()
}

async function putState(token, state) {
  const res = await fetch(`${LOCAL_BASE}/api/state`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(state),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PUT state failed: HTTP ${res.status} ${text}`)
}

async function main() {
  console.log('1) login local…')
  const token = await loginLocal()

  console.log('2) GET local state…')
  const raw = await getState(token)
  if (!raw) throw new Error('local state is empty')

  const beforeTrades = (raw.transactions ?? []).filter(
    (tx) => tx?.category === 'usdt' || tx?.category === 'vn_trade',
  ).length
  console.log(
    `[before] SET=${raw.settlements?.length ?? 0} tradeTx=${beforeTrades} expenseTx=${(raw.transactions ?? []).length - beforeTrades}`,
  )

  console.log('3) revert latest SET…')
  const result = revertLatestTradeSettlement({
    transactions: raw.transactions ?? [],
    settlements: raw.settlements ?? [],
    openingBalances: raw.openingBalances,
    openingUsdtCost: raw.openingUsdtCost,
    openingUsdtCabinA: raw.openingUsdtCabinA ?? 0,
    openingUsdtCabinB: raw.openingUsdtCabinB ?? 0,
    openingVnTwdRate: raw.openingVnTwdRate ?? null,
    openingVnUsdtRate: raw.openingVnUsdtRate ?? null,
    activeTab: raw.activeTab,
  })

  if (!result.ok) {
    throw new Error(result.reason)
  }

  console.log(
    `   → 退回「${result.dateLabel}」${result.restoredTradeCount} 筆交易`,
  )

  const next = {
    ...raw,
    ...result.state,
    activeTab: 'daily',
  }

  console.log('4) PUT local state…')
  await putState(token, next)

  console.log('5) verify…')
  const after = await getState(token)
  const afterTrades = (after.transactions ?? []).filter(
    (tx) => tx?.category === 'usdt' || tx?.category === 'vn_trade',
  ).length
  console.log(
    `[after] SET=${after.settlements?.length ?? 0} tradeTx=${afterTrades} expenseTx=${(after.transactions ?? []).length - afterTrades}`,
  )

  if (afterTrades !== result.restoredTradeCount) {
    throw new Error('verify failed: trade count mismatch')
  }
  if ((after.settlements?.length ?? 0) !== (raw.settlements?.length ?? 0) - 1) {
    throw new Error('verify failed: settlements count mismatch')
  }

  console.log('OK: latest SET reverted; trades back on TRANS.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
