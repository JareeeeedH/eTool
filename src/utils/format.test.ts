import { describe, expect, it } from 'vitest'
import {
  defaultTradeDateInputValue,
  formatExpenseTwdInput,
  formatTwdCompactInput,
  formatVnCompactInput,
  coerceDisplayZeroBalance,
  formatTwdAdjustToZero,
  formatProfit,
  formatProfitFromParts,
  sumRoundedProfitParts,
  parseExpenseTwdInput,
  parseTwdAdjustInput,
  parseTwdCabinNoteCompactInput,
  parseTwdTableCompactInput,
  parseVnTableCompactInput,
  timestampForNewTrade,
  timestampFromDateInput,
  timestampForEditedTrade,
  resolveTradeDate,
  resolveSettlementArchiveDate,
  formatSettlementDayLabel,
  formatTradeListDate,
  compareTradeListOrder,
  formatArchiveDateRange,
} from './format'

describe('compact input parsing', () => {
  it('parses T 萬位輸入', () => {
    expect(parseTwdTableCompactInput('81.51')).toBe(815_100)
    expect(formatTwdCompactInput(815_100)).toBe('81.51')
  })

  it('parses VN 億位輸入', () => {
    expect(parseVnTableCompactInput('1.2344')).toBe(123_440_000)
    expect(formatVnCompactInput(123_440_000)).toBe('1.2344')
  })

  it('allows zero for opening balance', () => {
    expect(parseTwdTableCompactInput('0', true)).toBe(0)
    expect(parseVnTableCompactInput('0', true)).toBe(0)
  })

  it('cabin note sum parser keeps negatives', () => {
    expect(parseTwdCabinNoteCompactInput('-101.78')).toBe(-1_017_800)
    expect(parseTwdCabinNoteCompactInput('-28')).toBe(-280_000)
    expect(parseTwdCabinNoteCompactInput('5.16')).toBe(51_600)
    expect(parseTwdCabinNoteCompactInput('')).toBe(0)
    expect(parseTwdTableCompactInput('-101.78')).toBeNull()
  })
})

describe('coerceDisplayZeroBalance', () => {
  it('keeps positive balances', () => {
    expect(coerceDisplayZeroBalance(112_595, 'usdt')).toBe(112_595)
    expect(coerceDisplayZeroBalance(20_000, 'twd')).toBe(20_000)
  })

  it('coerces tiny negative T that displays as 0.00 to 0', () => {
    expect(coerceDisplayZeroBalance(-30, 'twd')).toBe(0)
    expect(coerceDisplayZeroBalance(-49, 'twd')).toBe(0)
  })

  it('keeps visibly negative T', () => {
    expect(coerceDisplayZeroBalance(-50_000, 'twd')).toBe(-50_000)
  })
})

describe('formatTwdAdjustToZero', () => {
  it('formats live T cash as compact negative adjust', () => {
    expect(formatTwdAdjustToZero(714_100)).toBe('-71.41')
  })

  it('keeps exact wan precision so round-trip zeros live T', () => {
    const live = 1_638_555
    const adjust = formatTwdAdjustToZero(live)
    expect(adjust).toBe('-163.8555')
    expect(parseTwdAdjustInput(adjust)).toBe(-live)
  })

  it('returns empty when T is already zero', () => {
    expect(formatTwdAdjustToZero(0)).toBe('')
    expect(formatTwdAdjustToZero(-20)).toBe('')
  })
})

describe('expense twd input', () => {
  it('parses 萬位縮寫 like trade T', () => {
    expect(parseExpenseTwdInput('0.12')).toBe(1_200)
    expect(parseExpenseTwdInput('1')).toBe(10_000)
    expect(parseExpenseTwdInput('260')).toBe(2_600_000)
    expect(formatExpenseTwdInput(2_600_000)).toBe('260.00')
    expect(formatExpenseTwdInput(1_200)).toBe('0.12')
  })

  it('parses comma-separated 萬位輸入', () => {
    expect(parseExpenseTwdInput('2,600.03')).toBe(26_000_300)
  })
})

describe('defaultTradeDateInputValue', () => {
  it('uses the given calendar day', () => {
    const base = new Date(2026, 6, 8, 12, 0, 0)
    expect(defaultTradeDateInputValue(base)).toBe('2026-07-08')
  })
})

describe('timestampForNewTrade', () => {
  it('places new trade after existing same-day entries even if wall clock is earlier', () => {
    const dateStr = '2026-07-11'
    const existingEvening = timestampFromDateInput(dateStr, new Date(2026, 6, 10, 20, 0, 0))
    const afternoonNow = new Date(2026, 6, 11, 14, 0, 0)
    const next = timestampForNewTrade(dateStr, [existingEvening], afternoonNow)
    expect(next.getTime()).toBe(existingEvening.getTime() + 1)
  })

  it('places new trade after later inventory so settle cutoff still includes it', () => {
    const existing = new Date(2026, 6, 30, 18, 0, 0)
    const backdate = '2026-07-28'
    const next = timestampForNewTrade(backdate, [existing], new Date(2026, 6, 30, 14, 0, 0))
    expect(next.getTime()).toBe(existing.getTime() + 1)
  })
})

describe('timestampForEditedTrade', () => {
  it('moves timestamp onto selected day when after settle', () => {
    const prev = new Date(2026, 6, 30, 15, 30, 0)
    const settled = new Date(2026, 6, 27, 20, 0, 0)
    const next = timestampForEditedTrade('2026-07-29', prev, settled)
    expect(resolveTradeDate({ timestamp: next, tradeDate: '2026-07-29' })).toBe('2026-07-29')
    expect(next.getDate()).toBe(29)
    expect(next.getHours()).toBe(15)
  })

  it('keeps timestamp when selected day is before settle', () => {
    const prev = new Date(2026, 6, 30, 15, 30, 0)
    const settled = new Date(2026, 6, 29, 20, 0, 0)
    const next = timestampForEditedTrade('2026-07-28', prev, settled)
    expect(next.getTime()).toBe(prev.getTime())
  })
})

describe('resolveTradeDate / compareTradeListOrder', () => {
  it('prefers tradeDate for display day', () => {
    const tx = {
      timestamp: new Date(2026, 6, 30, 18, 0, 0),
      tradeDate: '2026-07-28',
    }
    expect(resolveTradeDate(tx)).toBe('2026-07-28')
    expect(formatTradeListDate(tx)).toBe('28')
  })

  it('sorts by tradeDate then timestamp', () => {
    const a = {
      timestamp: new Date(2026, 6, 30, 20, 0, 0),
      tradeDate: '2026-07-28',
    }
    const b = {
      timestamp: new Date(2026, 6, 30, 19, 0, 0),
      tradeDate: '2026-07-29',
    }
    expect([a, b].sort(compareTradeListOrder).map(resolveTradeDate)).toEqual([
      '2026-07-29',
      '2026-07-28',
    ])
  })
})

describe('formatProfitFromParts', () => {
  it('sums already-rounded display parts so P+VN matches total', () => {
    // 6369 → 0.64 萬；53358 → 5.34 萬；真實合計 59727 → 5.97，但畫面應為 0.64+5.34=5.98
    expect(formatProfit(6369.064999999944)).toBe('+0.64')
    expect(formatProfit(53358.03553829419)).toBe('+5.34')
    expect(formatProfit(59727.10053829414)).toBe('+5.97')
    expect(formatProfitFromParts(6369.064999999944, 53358.03553829419)).toBe('+5.98')
    expect(sumRoundedProfitParts(6369.064999999944, 53358.03553829419)).toBe(5.98)
  })
})

describe('resolveSettlementArchiveDate', () => {
  it('maps dateLabel day 31 with Aug 1 settledAt to July 31', () => {
    const settledAt = new Date(2026, 7, 1, 14, 12, 53)
    const archive = resolveSettlementArchiveDate({
      settledAt,
      dateLabel: '31 14:12',
    })
    expect(archive.getFullYear()).toBe(2026)
    expect(archive.getMonth()).toBe(6)
    expect(archive.getDate()).toBe(31)
    expect(formatArchiveDateRange(archive, archive)).toBe('07/31')
  })

  it('keeps same calendar day when label day matches settledAt', () => {
    const settledAt = new Date(2026, 6, 31, 13, 50, 0)
    const archive = resolveSettlementArchiveDate({
      settledAt,
      dateLabel: '31 13:50',
    })
    expect(archive.getMonth()).toBe(6)
    expect(archive.getDate()).toBe(31)
  })
})

describe('formatSettlementDayLabel', () => {
  it('shows only settlement day without time', () => {
    expect(formatSettlementDayLabel('3 03:50')).toBe('3')
    expect(formatSettlementDayLabel('31 14:12')).toBe('31')
  })
})
