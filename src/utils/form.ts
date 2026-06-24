import type { FormValues, UsdtTradeField, VnTradeField, VnTradeFormValues } from '../types'
import { roundVnTradeRate } from './format'

export function calculateRate(fiatAmount: number, usdtAmount: number): number {
  if (usdtAmount <= 0) return 0
  return fiatAmount / usdtAmount
}

export function parsePositive(value: string): number | null {
  const n = parseFloat(value)
  if (Number.isNaN(n) || n <= 0) return null
  return n
}

export function formatFiatInput(value: number): string {
  return String(Math.round(value))
}

export function formatVnRateCalc(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1)
}

export function formatRateCalc(value: number): string {
  return String(value)
}


export function formatUsdtInput(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

function countFilledUsdtFields(usdtStr: string, fiatStr: string, rateStr: string): UsdtTradeField[] {
  const filled: UsdtTradeField[] = []
  if (parsePositive(usdtStr)) filled.push('usdt')
  if (parsePositive(fiatStr)) filled.push('fiat')
  if (parsePositive(rateStr)) filled.push('rate')
  return filled
}

export type ResolvedUsdtTrade =
  | {
      ok: true
      usdt: number
      fiat: number
      rate: number
      filled: UsdtTradeField[]
      computed: UsdtTradeField
    }
  | { ok: false; error: string }

/** 恰好兩欄有值時，算出第三欄（輸入過程不自動連動） */
export function resolveUsdtTradeFields(
  usdtStr: string,
  fiatStr: string,
  rateStr: string,
): ResolvedUsdtTrade {
  const filled = countFilledUsdtFields(usdtStr, fiatStr, rateStr)

  if (filled.length < 2) {
    return { ok: false, error: '請輸入兩項，第三項將自動計算' }
  }
  if (filled.length > 2) {
    return { ok: false, error: '請只填兩項，第三項會自動計算' }
  }

  const usdt = parsePositive(usdtStr)!
  const fiat = parsePositive(fiatStr)
  const rate = parsePositive(rateStr)

  if (filled.includes('usdt') && filled.includes('rate')) {
    const resultRate = rate!
    const resultUsdt = usdt
    const resultFiat = Math.round(resultUsdt * resultRate)
    return {
      ok: true,
      usdt: resultUsdt,
      fiat: resultFiat,
      rate: resultRate,
      filled,
      computed: 'fiat',
    }
  }

  if (filled.includes('usdt') && filled.includes('fiat')) {
    const resultUsdt = usdt
    const resultFiat = Math.round(fiat!)
    const resultRate = resultFiat / resultUsdt
    return {
      ok: true,
      usdt: resultUsdt,
      fiat: resultFiat,
      rate: resultRate,
      filled,
      computed: 'rate',
    }
  }

  const resultFiat = Math.round(fiat!)
  const resultRate = rate!
  const resultUsdt = Math.round((resultFiat / resultRate) * 100) / 100
  return {
    ok: true,
    usdt: resultUsdt,
    fiat: resultFiat,
    rate: resultRate,
    filled,
    computed: 'usdt',
  }
}


export function syncFormFields(
  field: 'usdt' | 'fiat' | 'rate',
  value: string,
  current: FormValues,
): FormValues {
  const next: FormValues = {
    usdt: field === 'usdt' ? value : current.usdt,
    fiat: field === 'fiat' ? value : current.fiat,
    rate: field === 'rate' ? value : current.rate,
  }

  const usdt = parsePositive(next.usdt)
  const fiat = parsePositive(next.fiat)
  const rate = parsePositive(next.rate)

  switch (field) {
    case 'usdt':
      if (usdt && rate) {
        next.fiat = formatFiatInput(usdt * rate)
      } else if (usdt && fiat) {
        next.rate = formatRateCalc(fiat / usdt)
      }
      break
    case 'rate':
      if (usdt && rate) {
        next.fiat = formatFiatInput(usdt * rate)
      } else if (rate && fiat) {
        next.usdt = formatUsdtInput(fiat / rate)
      }
      break
    case 'fiat':
      if (usdt && fiat) {
        next.rate = formatRateCalc(fiat / usdt)
      } else if (rate && fiat) {
        next.usdt = formatUsdtInput(fiat / rate)
      }
      break
  }

  return next
}

export function syncVnTradeFormFields(
  field: 'vn' | 'pay' | 'rate',
  value: string,
  current: VnTradeFormValues,
): VnTradeFormValues {
  const next: VnTradeFormValues = {
    vn: field === 'vn' ? value : current.vn,
    pay: field === 'pay' ? value : current.pay,
    rate: field === 'rate' ? value : current.rate,
  }

  const vn = parsePositive(next.vn)
  const pay = parsePositive(next.pay)
  const rate = parsePositive(next.rate)

  switch (field) {
    case 'vn':
      if (vn && rate) {
        next.pay = formatFiatInput(vn / rate)
      } else if (vn && pay) {
        next.rate = formatVnRateCalc(vn / pay)
      }
      break
    case 'rate':
      if (pay && rate) {
        next.vn = formatFiatInput(pay * rate)
      } else if (rate && vn) {
        next.pay = formatFiatInput(vn / rate)
      }
      break
    case 'pay':
      if (pay && rate) {
        next.vn = formatFiatInput(pay * rate)
      } else if (pay && vn) {
        next.rate = formatVnRateCalc(vn / pay)
      }
      break
  }

  return next
}

function countFilledVnFields(vnStr: string, payStr: string, rateStr: string): VnTradeField[] {
  const filled: VnTradeField[] = []
  if (parsePositive(vnStr)) filled.push('vn')
  if (parsePositive(payStr)) filled.push('pay')
  if (parsePositive(rateStr)) filled.push('rate')
  return filled
}

export type ResolvedVnTrade =
  | {
      ok: true
      vn: number
      pay: number
      rate: number
      filled: VnTradeField[]
      computed: VnTradeField
    }
  | { ok: false; error: string }

/** VN 買賣：恰好兩欄有值時算出第三欄（vn / pay = 率） */
export function resolveVnTradeFields(
  vnStr: string,
  payStr: string,
  rateStr: string,
): ResolvedVnTrade {
  const filled = countFilledVnFields(vnStr, payStr, rateStr)

  if (filled.length < 2) {
    return { ok: false, error: '請輸入兩項，第三項將自動計算' }
  }
  if (filled.length > 2) {
    return { ok: false, error: '請只填兩項，第三項會自動計算' }
  }

  const vn = parsePositive(vnStr)
  const pay = parsePositive(payStr)
  const rate = parsePositive(rateStr)

  if (filled.includes('vn') && filled.includes('rate')) {
    const resultVn = vn!
    const resultRate = rate!
    const resultPay = Math.round(resultVn / resultRate)
    return {
      ok: true,
      vn: resultVn,
      pay: resultPay,
      rate: resultRate,
      filled,
      computed: 'pay',
    }
  }

  if (filled.includes('vn') && filled.includes('pay')) {
    const resultVn = Math.round(vn!)
    const resultPay = Math.round(pay!)
    const resultRate = roundVnTradeRate(resultVn / resultPay)
    return {
      ok: true,
      vn: resultVn,
      pay: resultPay,
      rate: resultRate,
      filled,
      computed: 'rate',
    }
  }

  const resultPay = Math.round(pay!)
  const resultRate = rate!
  const resultVn = Math.round(resultPay * resultRate)
  return {
    ok: true,
    vn: resultVn,
    pay: resultPay,
    rate: resultRate,
    filled,
    computed: 'vn',
  }
}
