import { describe, expect, it } from 'vitest'
import {
  formatExpenseTwdInput,
  formatTwdCompactInput,
  formatVnCompactInput,
  parseExpenseTwdInput,
  parseTwdTableCompactInput,
  parseVnTableCompactInput,
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

describe('expense twd input', () => {
  it('parses full twd amount without 萬 scaling', () => {
    expect(parseExpenseTwdInput('2600000')).toBe(2_600_000)
    expect(formatExpenseTwdInput(2_600_000)).toBe('2600000')
  })

  it('parses comma-separated twd amount', () => {
    expect(parseExpenseTwdInput('2,600,300')).toBe(2_600_300)
  })
})
