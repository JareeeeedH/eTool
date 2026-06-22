import type { FormValues, VnTradeFormValues } from '../types'

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

export function formatRateCalc(value: number): string {
  return String(value)
}


export function formatUsdtInput(value: number): string {
  return (Math.round(value * 100) / 100).toString()
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
        next.rate = formatRateCalc(vn / pay)
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
        next.rate = formatRateCalc(vn / pay)
      }
      break
  }

  return next
}
