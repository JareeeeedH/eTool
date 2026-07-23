import { describe, expect, it } from 'vitest'
import {
  defaultTradeDateInputValue,
  formatExpenseTwdInput,
  formatTwdCompactInput,
  formatVnCompactInput,
  coerceDisplayZeroBalance,
  formatTwdAdjustToZero,
  parseExpenseTwdInput,
  parseTwdAdjustInput,
  parseTwdTableCompactInput,
  parseVnTableCompactInput,
  timestampForNewTrade,
  timestampFromDateInput,
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
  it('parses full twd amount without 萬 scaling', () => {
    expect(parseExpenseTwdInput('2600000')).toBe(2_600_000)
    expect(formatExpenseTwdInput(2_600_000)).toBe('2600000')
  })

  it('parses comma-separated twd amount', () => {
    expect(parseExpenseTwdInput('2,600,300')).toBe(2_600_300)
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

  it('places new trade after older-dated inventory even if form date is earlier', () => {
    const existing = new Date(2026, 6, 10, 18, 0, 0)
    const earlyFormDate = '2017-01-11'
    const next = timestampForNewTrade(earlyFormDate, [existing], new Date(2026, 6, 11, 14, 0, 0))
    expect(next.getTime()).toBe(existing.getTime() + 1)
  })
})
