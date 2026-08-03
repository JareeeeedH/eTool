import type { Balances, DailyMobileTradePane, ExpenseType } from '../types'

/** 主功能簡稱（手機 tab / 電腦表單標題共用） */
export const TRADE_PANE_CODE: Record<DailyMobileTradePane, string> = {
  buy_u: 'IE',
  sell_u: 'OE',
  buy_vn: 'IV',
  sell_vn: 'OV',
  expense: 'EXP',
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
  'rounded border border-slate-300 px-1.5 py-0.5 text-base sm:text-xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-50'

export const TRADE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-0.5 text-base tabular-nums leading-tight placeholder:text-slate-400 outline-none transition disabled:bg-slate-50 sm:py-1 sm:text-xs sm:leading-normal'

/** 買賣表單：手機 2×2（P/R · T + 日期按鈕）；兩欄等寬避免歪斜 */
export const TRADE_FORM_GRID_CLASS =
  'grid grid-cols-2 grid-rows-2 gap-1 sm:flex sm:grid-cols-none sm:items-center sm:gap-1'

/** 第四格：日期固定窄寬 + 備註 + Cancel / Add */
export const TRADE_FORM_META_CELL_CLASS =
  'flex min-h-0 min-w-0 w-full items-center gap-0.5 sm:w-auto sm:gap-1 sm:shrink-0'

/** 買賣表單備註（交易對象）小格 */
export const TRADE_NOTE_INPUT_CLASS =
  'h-[1.75rem] w-[3.25rem] shrink-0 rounded border border-slate-300 bg-white px-1 py-0 text-center text-[10px] leading-none text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/40 disabled:bg-slate-50 sm:h-auto sm:w-14 sm:py-0.5 sm:text-[11px] sm:leading-tight'

/** 買賣表單按鈕（第四格內與日期併排） */
export const TRADE_FORM_ACTIONS_CLASS =
  'min-w-0 max-sm:min-h-[1.75rem] max-sm:flex-1 shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-[10px] leading-none text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:min-w-0 sm:min-h-0 sm:flex-none sm:px-2 sm:py-1 sm:text-xs sm:leading-tight'

export const TRADE_FORM_SUBMIT_CLASS =
  'min-w-0 max-sm:min-h-[1.75rem] max-sm:flex-1 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-medium leading-none text-white transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-0 sm:min-h-0 sm:flex-none sm:px-3 sm:py-1 sm:text-xs sm:leading-tight'

/** 買賣表單匯率欄容器：桌面版略寬 */
export const TRADE_RATE_FIELD_CLASS = 'block min-w-0 sm:w-[7rem] sm:shrink-0'

export const TRADE_RATE_INPUT_CLASS =
  'w-full rounded border border-slate-300 px-1.5 py-0.5 text-base tabular-nums leading-tight placeholder:text-slate-400 outline-none transition disabled:bg-slate-50 sm:py-1 sm:text-sm sm:leading-normal'

export const INITIAL_TWD = 0
export const INITIAL_USDT = 0
export const INITIAL_VN = 0

/** 舊資料遷移：A 艙目標數量，其餘歸 B */
export const USDT_CABIN_MIGRATE_TARGET_A = 30_000

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

export const TRANSACTION_VISIBLE_ROWS_MOBILE = 16
export const TRANSACTION_VISIBLE_ROWS_DESKTOP = 16

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
