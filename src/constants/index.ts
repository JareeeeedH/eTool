import type { Balances, DailyMobileTradePane, ExpenseType } from '../types'

/** 四格交易簡稱（手機 tab / 電腦表單標題共用） */
export const TRADE_PANE_CODE: Record<DailyMobileTradePane, string> = {
  buy_u: 'IE',
  sell_u: 'OE',
  buy_vn: 'IV',
  sell_vn: 'OV',
}

export function tradePaneEditLabel(pane: DailyMobileTradePane): string {
  return `編輯 ${TRADE_PANE_CODE[pane]}`
}

export function tradePaneEditingBannerLabel(pane: DailyMobileTradePane): string {
  return `正在編輯 ${TRADE_PANE_CODE[pane]}`
}

export const EXPENSE_TYPE_OPTIONS: { value: ExpenseType; label: string }[] = [
  { value: 'fuel', label: 'OIL' },
  { value: 'parking', label: 'PARK' },
  { value: 'meal', label: 'FOOD' },
  { value: 'traffic', label: 'Traffic' },
  { value: 'other', label: 'OTHER' },
]

export const EXPENSE_QUICK_TYPES: ExpenseType[] = ['fuel', 'parking', 'meal']

export const EMPTY_DATA_LABEL = 'no data'

export const EXPENSE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-0.5 text-base sm:text-xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-50'

export const TRADE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-1 text-base tabular-nums placeholder:text-slate-400 sm:text-xs outline-none transition disabled:bg-slate-50'

/** 買賣表單：手機 2×2（P/R/T + 日期按鈕格）；右欄略寬以容納日期 */
export const TRADE_FORM_GRID_CLASS =
  'grid grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] grid-rows-2 gap-1.5 sm:flex sm:grid-cols-none sm:items-center sm:gap-1'

/** 第四格：日期 + Cancel / Add 同一行併排 */
export const TRADE_FORM_META_CELL_CLASS =
  'flex min-h-0 min-w-0 items-center gap-0.5 sm:gap-1 sm:shrink-0'

/** 買賣表單按鈕（第四格內與日期併排） */
export const TRADE_FORM_ACTIONS_CLASS =
  'min-w-[2.35rem] max-sm:min-h-[2.125rem] max-sm:flex-1 shrink-0 rounded border border-slate-300 bg-white px-3 py-1.5 text-center text-[10px] leading-tight text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:min-w-0 sm:min-h-0 sm:flex-none sm:px-2 sm:py-1 sm:text-xs'

export const TRADE_FORM_SUBMIT_CLASS =
  'min-w-[2.35rem] max-sm:min-h-[2.125rem] max-sm:flex-1 shrink-0 rounded px-3 py-1.5 text-center text-[10px] font-medium leading-tight text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-0 sm:min-h-0 sm:flex-none sm:px-3 sm:py-1 sm:text-xs'

/** 買賣表單匯率欄容器：桌面版略寬 */
export const TRADE_RATE_FIELD_CLASS = 'block min-w-0 sm:w-[7rem] sm:shrink-0'

export const TRADE_RATE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-1 text-base tabular-nums placeholder:text-slate-400 sm:text-sm outline-none transition disabled:bg-slate-50'

export const INITIAL_TWD = 0
export const INITIAL_USDT = 0
export const INITIAL_VN = 0

export const INITIAL_BALANCES: Balances = {
  twd: INITIAL_TWD,
  usdt: INITIAL_USDT,
  vn: INITIAL_VN,
}

export const EMPTY_USDT_COST = { twd: null, vn: null } as const

/** 匯率偏離庫存參考：超過此比例儲存前需確認 */
export const RATE_DEVIATION_LIMIT_RATIO = 0.05

export const EMPTY_EXPENSE_BY_CATEGORY: Record<ExpenseType, number> = {
  fuel: 0,
  parking: 0,
  meal: 0,
  traffic: 0,
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
/** 表格日期欄（僅 MM/DD，較窄） */
export const TRANSACTION_DATE_CELL_CLASS =
  'align-middle w-[2.75rem] whitespace-nowrap px-0.5 text-[13px] tabular-nums leading-none'
export const TRANSACTION_INDEX_CELL_CLASS =
  'align-middle w-0 whitespace-nowrap p-0 pl-0 pr-px text-center text-[10px] tabular-nums leading-none'
/** 交易明細手機版日期欄 */
export const TRANSACTION_MOBILE_DATE_CELL_CLASS =
  'align-middle whitespace-nowrap px-0 pr-px text-left text-[11px] tabular-nums leading-tight text-slate-500'
/** VN 手機表：日期欄 */
export const VN_MOBILE_INDEX_CELL_CLASS = TRANSACTION_MOBILE_DATE_CELL_CLASS
export const VN_MOBILE_CELL_CLASS = 'align-middle px-0.5 text-[13px] leading-none'
export const VN_MOBILE_VN_CELL_CLASS =
  'align-middle min-w-0 pl-0 pr-px text-right tabular-nums leading-tight text-[12px]'
export const VN_MOBILE_COIN_CELL_CLASS =
  'align-middle shrink-0 px-0 text-center text-[12px] leading-none'
export const VN_MOBILE_NUM_CELL_CLASS =
  'align-middle min-w-0 px-0.5 text-right tabular-nums leading-tight text-[12px]'
export const VN_MOBILE_ACTION_CELL_CLASS =
  'align-middle whitespace-nowrap px-0.5 text-right leading-none'
export const TRANSACTION_NUM_CELL_CLASS =
  'align-middle px-1 text-right tabular-nums leading-none'
export const TRANSACTION_ACTION_CELL_CLASS =
  'align-middle w-[3.25rem] whitespace-nowrap pl-1 pr-0 text-right leading-none'

export const VN_DESKTOP_VN_CELL_CLASS =
  'align-middle w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] shrink-0 pl-0 pr-1 text-right tabular-nums leading-none text-[13px]'
export const VN_TRANSACTION_TABLE_CLASS =
  'w-full min-w-[280px] table-fixed text-left text-[13px]'
export const VN_TRANSACTION_TABLE_MOBILE_CLASS =
  'w-full max-w-full table-fixed text-left text-[12px]'
export const EXPENSE_TABLE_CLASS = 'w-full min-w-[300px] table-fixed text-left text-xs'
