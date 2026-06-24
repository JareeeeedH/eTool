import type { Balances, ExpenseType } from '../types'

export const EXPENSE_TYPE_OPTIONS: { value: ExpenseType; label: string }[] = [
  { value: 'rent', label: '車租' },
  { value: 'fuel', label: '油資' },
  { value: 'parking', label: '停車' },
  { value: 'meal', label: '餐費' },
  { value: 'telecom', label: '通訊' },
  { value: 'misc', label: '雜支' },
  { value: 'other', label: '其他' },
]

export const EXPENSE_QUICK_TYPES: ExpenseType[] = ['fuel', 'parking', 'meal']

export const EXPENSE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-0.5 text-base sm:text-xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-50'

export const TRADE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-1 text-base tabular-nums sm:text-xs outline-none transition disabled:bg-slate-50'

/** 買賣表單：手機兩行格線、桌面單行 flex */
export const TRADE_FORM_GRID_CLASS =
  'grid grid-cols-2 gap-1 sm:flex sm:items-center sm:gap-1'

/** 買賣表單「率」欄：桌面版略寬、字體略大 */
export const TRADE_RATE_LABEL_CLASS =
  'flex min-w-0 w-full items-center gap-0.5 text-slate-600 sm:w-[7rem] sm:shrink-0'

export const TRADE_RATE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-1 text-base tabular-nums sm:text-sm outline-none transition disabled:bg-slate-50'

export const INITIAL_TWD = 5_000_000
export const INITIAL_USDT = 0
export const INITIAL_VN = 0

export const INITIAL_BALANCES: Balances = {
  twd: INITIAL_TWD,
  usdt: INITIAL_USDT,
  vn: INITIAL_VN,
}

export const EMPTY_USDT_COST = { twd: null, vn: null } as const

export const EMPTY_EXPENSE_BY_CATEGORY: Record<ExpenseType, number> = {
  rent: 0,
  fuel: 0,
  parking: 0,
  meal: 0,
  telecom: 0,
  misc: 0,
  other: 0,
}

export const TRANSACTION_VISIBLE_ROWS_MOBILE = 8
export const TRANSACTION_VISIBLE_ROWS_DESKTOP = 12

export const TRANSACTION_ROW_HEIGHT_REM = 2.5
export const TRANSACTION_HEAD_REM = 2
export const TRANSACTION_FOOT_REM = 2.5
export const TRANSACTION_TABLE_CLASS = 'w-full min-w-[260px] table-fixed text-left text-[13px]'
export const TRANSACTION_DATA_ROW_STYLE = {
  height: `${TRANSACTION_ROW_HEIGHT_REM}rem`,
} as const
export const TRANSACTION_CELL_CLASS = 'align-middle px-1.5 leading-none'
export const TRANSACTION_TIME_CELL_CLASS =
  'align-middle w-[4.25rem] whitespace-nowrap px-1 text-[13px] tabular-nums leading-none'
export const TRANSACTION_INDEX_CELL_CLASS =
  'align-middle w-0 whitespace-nowrap p-0 pl-0 pr-px text-center text-[10px] tabular-nums leading-none'
export const VN_MOBILE_CELL_CLASS = 'align-middle px-0.5 text-[13px] leading-none'
export const VN_MOBILE_NUM_CELL_CLASS =
  'align-middle px-0.5 text-right tabular-nums leading-none text-[13px]'
export const VN_MOBILE_ACTION_CELL_CLASS =
  'align-middle w-0 whitespace-nowrap p-0 text-right leading-none'
export const TRANSACTION_NUM_CELL_CLASS =
  'align-middle px-1 text-right tabular-nums leading-none'
export const TRANSACTION_ACTION_CELL_CLASS =
  'align-middle w-[3.25rem] whitespace-nowrap pl-1 pr-0 text-right leading-none'

export const VN_TRANSACTION_TABLE_CLASS =
  'w-full min-w-[300px] table-fixed text-left text-[13px]'
export const EXPENSE_TABLE_CLASS = 'w-full min-w-[300px] table-fixed text-left text-xs'
