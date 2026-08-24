import type { FormEvent, RefObject } from 'react'

export type TransactionType = 'buy' | 'sell'
export type UsdtTradeField = 'usdt' | 'fiat' | 'rate'
export type VnTradeField = 'vn' | 'pay' | 'rate'
export type EditingCategory = TransactionType | 'vn_buy' | 'vn_sell' | 'expense'
export type DailyWorkTab = 'usdt' | 'vn'
export type DailyMobileTradePane =
  | 'buy_u'
  | 'sell_u'
  | 'buy_vn'
  | 'sell_vn'
export type FiatCurrency = 'twd' | 'vn'
export type VnPayCurrency = 'twd' | 'usdt'
/** P（USDT）艙別：共用成本池，僅拆數量 */
export type UsdtCabin = 'A' | 'B' | 'C'
/** T（台幣）艙別：與 P 相同 A/B/C 分倉，僅拆數量 */
export type TwdCabin = UsdtCabin
export type ExpenseType = 'fuel' | 'parking' | 'meal' | 'traffic' | 'other'
export type PageTab =
  | 'daily'
  | 'expenses'
  | 'cumulative_expenses'
  | 'settlements'
  | 'set_search'
  | 'month'
  | 'monthly'
  | 'notes'
export type AccentColor = 'emerald' | 'rose' | 'violet' | 'orange'

export interface UsdtTransaction {
  id: string
  timestamp: Date
  /**
   * 畫面／列表用交易日（YYYY-MM-DD）。
   * 與 timestamp 分離：補登舊日期時仍顯示該日，但 timestamp 可留在結帳後以正確計入水位。
   */
  tradeDate?: string
  category: 'usdt'
  type: TransactionType
  fiatCurrency: FiatCurrency
  usdtAmount: number
  fiatAmount: number
  /** 匯率 = 法幣金額 / USDT 金額 */
  rate: number
  /** 歸 A 艙的 USDT 數量；成本仍共用 */
  cabinAAmount?: number
  /** 歸 B 艙的 USDT 數量；C = usdtAmount − A − B */
  cabinBAmount?: number
  /** 舊資料單艙標籤；有 cabinA/BAmount 時以數量為準 */
  cabin?: UsdtCabin
  /** 歸 A 艙的台幣數量（fiatCurrency=twd 時）；C = fiatAmount − A − B */
  twdCabinAAmount?: number
  /** 歸 B 艙的台幣數量 */
  twdCabinBAmount?: number
  /** 台幣單艙標籤；有 twdCabinA/BAmount 時以數量為準 */
  twdCabin?: TwdCabin
  /** 交易對象等備註 */
  note?: string
}

export interface VnTradeTransaction {
  id: string
  timestamp: Date
  /**
   * 畫面／列表用交易日（YYYY-MM-DD）。
   * 與 timestamp 分離：補登舊日期時仍顯示該日，但 timestamp 可留在結帳後以正確計入水位。
   */
  tradeDate?: string
  category: 'vn_trade'
  type: TransactionType
  payCurrency: VnPayCurrency
  vnAmount: number
  twdAmount: number
  usdtAmount: number
  /** 匯率 = VN / 支付金額；VN/TWD 成本 = 1 NTD 可買多少 VN */
  rate: number
  /** 支付／收入為 USDT 時：歸 A 艙數量 */
  cabinAAmount?: number
  /** 支付／收入為 USDT 時：歸 B 艙數量；C = usdtAmount − A − B */
  cabinBAmount?: number
  /** 舊資料單艙標籤；有 cabinA/BAmount 時以數量為準 */
  cabin?: UsdtCabin
  /** 支付／收入為 TWD 時：歸 A 艙台幣數量 */
  twdCabinAAmount?: number
  /** 支付／收入為 TWD 時：歸 B 艙台幣數量；C = twdAmount − A − B */
  twdCabinBAmount?: number
  /** 台幣單艙標籤；有 twdCabinA/BAmount 時以數量為準 */
  twdCabin?: TwdCabin
  /** 交易對象等備註 */
  note?: string
}

export interface ExpenseTransaction {
  id: string
  timestamp: Date
  category: 'expense'
  expenseType: ExpenseType
  /**
   * 開銷來源：
   * - daily：日結 EXP，AL 時扣帳並封存
   * - standalone：選單 EXP，RECON 時扣帳並封存
   * 舊資料缺省視為 daily
   */
  expenseSource?: 'daily' | 'standalone'
  /** 付款幣別；舊資料缺省視為 twd */
  payCurrency?: VnPayCurrency
  /**
   * 台幣金額（或 U 開銷以凍結 U@ 換算的台幣等值，供 EXP.SUM／月結）。
   * 扣帳：僅 payCurrency=twd 時從 T 餘額扣此數。
   */
  amountTwd: number
  /** 付款為 USDT 時的數量；結算從 P 扣此數 */
  amountUsdt?: number
  note: string
  /** 開銷扣自 A 艙台幣數量 */
  twdCabinAAmount?: number
  /** 開銷扣自 B 艙台幣數量；C = amountTwd − A − B */
  twdCabinBAmount?: number
  twdCabin?: TwdCabin
}

export type ExpenseSource = NonNullable<ExpenseTransaction['expenseSource']>

export type Transaction = UsdtTransaction | VnTradeTransaction | ExpenseTransaction

export interface DailySettlement {
  id: string
  settledAt: Date
  dateLabel: string
  twdBalance: number
  usdtBalance: number
  vnBalance: number
  /** 結算當下 USDT 總庫存加權成本均價 */
  usdtInventoryAvgTwd: number | null
  usdtInventoryAvgVn: number | null
  /** 當日買入加權均價 */
  dayBuyAvgTwd: number | null
  dayBuyAvgVn: number | null
  /** 結算當下帳面總資產（TWD 計價） */
  totalAssetsTwd: number
  totalAssetsTwdCash: number
  totalAssetsUsdtInTwd: number | null
  totalAssetsVnInTwd: number | null
  /** 結算當下 VN 整池成本（1 NTD = ? VN，換算 VN 庫存用） */
  dayVnTwdRate: number | null
  /** 結算當下 VN 整池成本（1 USDT = ? VN） */
  dayVnUsdtRate: number | null
  totalAssetsComplete: boolean
  totalAssetsMissingNotes: string
  transactionCount: number
  /** 當日 USDT 賣出利潤（TWD） */
  dayUsdtProfit?: number
  /** 當日 VN 賣出利潤（TWD） */
  dayVnProfit?: number
  /** 當日賣出總利潤（TWD）= USDT + VN */
  dayTotalProfit: number
  /**
   * 結帳當下封存的交易明細（舊結算可能無此欄）。
   * 僅含 usdt / vn_trade，不含 expense。
   */
  trades?: Array<UsdtTransaction | VnTradeTransaction>
  /** 結帳當下各賣單利潤（TWD），key = 交易 id */
  sellProfitById?: Record<string, number>
}

export interface ExpenseSettlementItem {
  expenseType: ExpenseType
  amountTwd: number
  note: string
  timestamp: Date
  payCurrency?: VnPayCurrency
  amountUsdt?: number
}

export interface ExpenseSettlement {
  id: string
  settledAt: Date
  dateLabel: string
  twdBalance: number
  expenseCount: number
  expenseTotal: number
  items: ExpenseSettlementItem[]
}

export interface CumulativeExpenseItem {
  amountTwd: number
  note: string
  timestamp: Date
  payCurrency?: VnPayCurrency
  amountUsdt?: number
}

export interface CumulativeExpenseEntry {
  id: string
  timestamp: Date
  amountTwd: number
  note: string
  /** EXP RECON 封存明細；手動新增無此欄 */
  items?: CumulativeExpenseItem[]
}

export interface MonthlyClose {
  id: string
  periodLabel: string
  closedAt: Date
  actualStartDate: Date | null
  actualEndDate: Date | null
  grossProfit: number
  usdtProfit: number
  vnProfit: number
  expenseTotal: number
  netProfit: number
  expenseByCategory: Record<ExpenseType, number>
  openingTotalAssets?: number
  closingBalances: Balances
  closingUsdtCost: UsdtInventoryCost
  closingVnTwdRate: number | null
  closingVnUsdtRate: number | null
  /** 月結實際總資產（RECON 已扣帳，與帳面一致） */
  closingTotalAssets: number
  /** 月結當下庫存成本計價帳面 */
  closingBookTotalAssets?: number
  tradeSettlements: DailySettlement[]
  expenseSettlements: ExpenseSettlement[]
}

export interface Balances {
  twd: number
  usdt: number
  vn: number
}

export interface UsdtInventoryCost {
  twd: number | null
  vn: number | null
}

export interface TotalAssetsTwd {
  twdCash: number
  usdtInTwd: number | null
  vnInTwd: number | null
  dayVnTwdRate: number | null
  dayVnUsdtRate: number | null
  total: number
  isComplete: boolean
  missingNotes: string[]
}

export interface TradeSettleConfirmSummary {
  tradeCount: number
  usdtBuy: number
  usdtSell: number
  vnBuy: number
  vnSell: number
  showVn: boolean
  dayUsdtProfit: number | null
  dayVnProfit: number | null
  dayTotalProfit: number
  hasSells: boolean
  /** 預設帳務日 YYYY-MM-DD */
  defaultBusinessDate: string
}

export interface ConfirmDialogState {
  title: string
  lines: string[]
  tradeSettleSummary?: TradeSettleConfirmSummary
  monthlyCloseSummary?: MonthlyCloseConfirmSummary
  cancelLabel?: string
  confirmLabel: string
  variant: 'danger' | 'primary'
  alertOnly?: boolean
  /** 顯示備註輸入（如 EXP RECON） */
  noteInput?: boolean
  onConfirm: (note?: string) => void
}


export interface UsdtInventoryState {
  usdtQty: number
  twdCostTotal: number
  vnCostTotal: number
}


export interface SellProfitInfo {
  unitCost: number | null
  costBasis: number
  profit: number
}


export interface VnTradeAnalytics {
  buyImpliedTwdRateById: Map<string, number>
  buyImpliedUsdtRateById: Map<string, number>
  sellProfitById: Map<string, SellProfitInfo>
  /** 目前 VN 整池成本：1 NTD 可買多少 VN */
  currentVnTwdRate: number | null
  /** 目前 VN 整池成本：1 USDT 可買多少 VN */
  currentVnUsdtRate: number | null
}


export interface FormValues {
  usdt: string
  fiat: string
  rate: string
}


export interface VnTradeFormValues {
  vn: string
  pay: string
  rate: string
}


export interface MonthlyClosePreview {
  tradeCount: number
  expenseBatchCount: number
  expenseItemCount: number
  grossProfit: number
  expenseTotal: number
  netProfit: number
  closingBookTotalAssets: number
  closingTotalAssets: number
  dateRangeLabel: string
  periodLabel: string
  pendingTradeCount: number
  pendingExpenseCount: number
}

/** 月結確認卡顯示用（不含未日結提示） */
export interface MonthlyCloseConfirmSummary {
  periodLabel: string
  tradeCount: number
  expenseItemCount: number
  grossProfit: number
  expenseTotal: number
  netProfit: number
  dateRangeLabel: string
}

export interface NotebookEntry {
  id: string
  createdAt: Date
  updatedAt: Date
  text: string
}

export interface TwdCabinNotes {
  a: string
  b: string
  /** T 艙 */
  t: string
  /** F 艙 */
  g: string
  /** W 艙 */
  c: string
  /** H 艙 */
  d: string
  /** J 艙 */
  e: string
  /** C 艙 */
  f: string
  /** 備用格 #（仍入 Σ） */
  n1: string
  n2: string
  n3: string
  n4: string
  /** 獨立 PF 備註；不入加總 */
  pf: string
}

/** 可編輯艙位 key（含備用格；不含 pf） */
export type TwdCabinNoteKey =
  | 'a'
  | 'b'
  | 't'
  | 'g'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'n1'
  | 'n2'
  | 'n3'
  | 'n4'

export type TwdCabinNoteFieldKey = TwdCabinNoteKey | 'pf'

/** 顯示名稱 */
export const TWD_CABIN_NOTE_LABELS: Record<TwdCabinNoteKey, string> = {
  a: 'O',
  b: 'B',
  t: 'T',
  g: 'F',
  c: 'W',
  d: 'H',
  e: 'J',
  f: 'C',
  n1: '#',
  n2: '#',
  n3: '#',
  n4: '#',
}

/** 第一排：O/B/T/F */
export const TWD_CABIN_NOTE_ROW1_KEYS = [
  'a',
  'b',
  't',
  'g',
] as const satisfies readonly TwdCabinNoteKey[]

/** 第二排：W/H/J/# */
export const TWD_CABIN_NOTE_ROW2_KEYS = [
  'c',
  'd',
  'e',
  'n1',
] as const satisfies readonly TwdCabinNoteKey[]

/** 第三排：C#/#/# */
export const TWD_CABIN_NOTE_ROW3_KEYS = [
  'f',
  'n2',
  'n3',
  'n4',
] as const satisfies readonly TwdCabinNoteKey[]

/** 全部艙格（不含 pf） */
export const TWD_CABIN_NOTE_KEYS = [
  ...TWD_CABIN_NOTE_ROW1_KEYS,
  ...TWD_CABIN_NOTE_ROW2_KEYS,
  ...TWD_CABIN_NOTE_ROW3_KEYS,
] as const satisfies readonly TwdCabinNoteKey[]

/** 入 Σ：全部艙格（含備用 #） */
export const TWD_CABIN_NOTE_SUM_KEYS = TWD_CABIN_NOTE_KEYS

export const EMPTY_TWD_CABIN_NOTES: TwdCabinNotes = {
  a: '',
  b: '',
  t: '',
  g: '',
  c: '',
  d: '',
  e: '',
  f: '',
  n1: '',
  n2: '',
  n3: '',
  n4: '',
  pf: '',
}

export interface AppSnapshot {
  transactions: Transaction[]
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  openingUsdtCabinA: number
  openingUsdtCabinB: number
  twdCabinNotes: TwdCabinNotes
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
  settlements: DailySettlement[]
  expenseSettlements: ExpenseSettlement[]
  cumulativeExpenses: CumulativeExpenseEntry[]
  monthlyCloses: MonthlyClose[]
  selectedMonthlyCloseId: string | null
  activeTab: PageTab
  dailyWorkTab: DailyWorkTab
  notes: NotebookEntry[]
}

export interface NotebookPanelProps {
  entries: NotebookEntry[]
  draft: string
  editingId: string | null
  error: string
  disabled?: boolean
  onDraftChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancelEdit: () => void
  onEdit: (entry: NotebookEntry) => void
  onDelete: (id: string) => void
}

export interface DailyBalanceStripProps {
  balances: Balances
  inventoryCost: UsdtInventoryCost
  /** P 底下顯示 A/B 分倉 */
  usdtCabinBalances?: { a: number; b: number; c: number }
  /** T 底下 O/B/T/W/H/J/C 備註（僅 memo，不入帳）；另含獨立 PF */
  twdCabinNotes?: TwdCabinNotes
  onTwdCabinNoteChange?: (cabin: TwdCabinNoteFieldKey, value: string) => void
  totalAssets: TotalAssetsTwd
  vnTwdRate: number | null
  vnUsdtRate: number | null
}

export interface CabinRebalanceModalProps {
  open: boolean
  /** 分倉幣別標籤 */
  currencyLabel?: 'P' | 'T'
  cabins: { a: number; b: number; c: number }
  onCancel: () => void
  /** 確認後的 A/B/C 絕對數量（總和應不變） */
  onConfirm: (next: { a: number; b: number; c: number }) => void
}

/** 期初 P／T 增減：挑選作用艙位 */
export interface OpeningUsdtCabinPickModalProps {
  open: boolean
  /** 有號增減量，例如 +1000 / -500 */
  adjust: number
  /** 顯示用幣別 */
  currencyLabel?: 'P' | 'T'
  cabins: { a: number; b: number; c: number }
  onCancel: () => void
  onConfirm: (cabin: UsdtCabin) => void
}


export interface DailyTradeSettleBarProps {
  tradeCount: number
  onSettle: () => void
}


export interface TransactionTableProps {
  transactions: UsdtTransaction[]
  editingId: string | null
  highlightedId?: string | null
  onEdit: (tx: UsdtTransaction) => void
  onDelete: (id: string) => void
  accent: 'buy' | 'sell'
  sideLabel: string
  /** buy：當日買入均價；sell：當日賣價平均 */
  showDayAverage?: boolean
  sellProfitById?: Map<string, SellProfitInfo>
  /** 明細 tbody 預設顯示列數，超出捲動 */
  visibleRows?: number
  bodyScrollRef?: RefObject<HTMLDivElement | null>
  onBodyScroll?: (scrollTop: number) => void
}


export interface TradeFormProps {
  type: TransactionType
  title: string
  editTitle: string
  usdt: string
  fiat: string
  rate: string
  tradeDate: string
  note: string
  error: string
  isEditing: boolean
  disabled: boolean
  onFieldChange: (field: 'usdt' | 'fiat' | 'rate', value: string) => void
  onTradeDateChange: (value: string) => void
  onNoteChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
  onClear: () => void
  accentClass: string
  buttonClass: string
  focusClass: string
  balances: Balances
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  transactions: Transaction[]
  /** 編輯既有賣單時：只 walk 該筆時間之前的交易，預覽 @ 與當時賣出一致 */
  excludeTransactionId?: string | null
}


export interface VnTradeFormProps {
  type: TransactionType
  title: string
  editTitle: string
  payCurrency: VnPayCurrency
  onPayCurrencyChange: (currency: VnPayCurrency) => void
  vn: string
  pay: string
  rate: string
  tradeDate: string
  note: string
  error: string
  isEditing: boolean
  disabled: boolean
  onFieldChange: (field: 'vn' | 'pay' | 'rate', value: string) => void
  onTradeDateChange: (value: string) => void
  onNoteChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
  onClear: () => void
  accentClass: string
  buttonClass: string
  focusClass: string
  balances: Balances
  usdtInventoryCostTwd: number | null
  openingBalances: Balances
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
  openingUsdtCost: UsdtInventoryCost
  transactions: Transaction[]
  /** 編輯既有賣 VN 單時：只 walk 該筆時間之前的交易 */
  excludeTransactionId?: string | null
}


export interface VnTradeTableProps {
  transactions: VnTradeTransaction[]
  editingId: string | null
  highlightedId?: string | null
  onEdit: (tx: VnTradeTransaction) => void
  onDelete: (id: string) => void
  accent: 'buy' | 'sell'
  sideLabel: string
  showDayAverage?: boolean
  showCostAverage?: boolean
  showSellAverage?: boolean
  openingBalances?: Balances
  openingUsdtCost?: UsdtInventoryCost
  allTransactions?: Transaction[]
  buyImpliedTwdRateById?: Map<string, number>
  buyImpliedUsdtRateById?: Map<string, number>
  sellProfitById?: Map<string, SellProfitInfo>
  visibleRows?: number
  bodyScrollRef?: RefObject<HTMLDivElement | null>
  onBodyScroll?: (scrollTop: number) => void
}


export interface ExpenseFormProps {
  amount: string
  note: string
  expenseDate: string
  payCurrency: VnPayCurrency
  onPayCurrencyChange: (currency: VnPayCurrency) => void
  error: string
  isEditing: boolean
  disabled: boolean
  onAmountChange: (value: string) => void
  onNoteChange: (value: string) => void
  onExpenseDateChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}


export interface ExpensePageSummaryProps {
  transactions: ExpenseTransaction[]
  onReconcile?: () => void
}


export interface ExpenseTableProps {
  transactions: ExpenseTransaction[]
  editingId: string | null
  onEdit: (tx: ExpenseTransaction) => void
  onDelete: (id: string) => void
  visibleRows?: number
}


export interface SettlementsPanelProps {
  settlements: DailySettlement[]
  /** 僅最新一筆 SET 展開後顯示：退回結帳前（明細回 TRANS） */
  onRevertLatest?: () => void
}

export interface SettlementNoteSearchPanelProps {
  settlements: DailySettlement[]
  monthlyCloses: MonthlyClose[]
}

export interface SettlementRecordBodyProps {
  twdBalance: number
  usdtBalance: number
  vnBalance: number
  displayAssets: TotalAssetsTwd
  dayUsdtProfit: number | undefined
  dayVnProfit: number | undefined
  dayTotalProfit: number
  /** 結帳成本價：優先當日買入均價，否則庫存加權成本 */
  usdtCostAvg?: number | null
  /** 結帳 VN 成本（1 NTD = ? VN） */
  vnTwdRate?: number | null
  /** 結帳 VN 成本（1 USDT = ? VN） */
  vnUsdtRate?: number | null
}


export interface ExpenseSettlementsPanelProps {
  settlements: ExpenseSettlement[]
}

export interface CumulativeExpensesPanelProps {
  entries: CumulativeExpenseEntry[]
  onAdd: (timestamp: Date, amountTwd: number, note: string) => void
  onUpdate: (id: string, timestamp: Date, amountTwd: number, note: string) => void
  onDelete: (id: string) => void
}


export interface MonthlyCloseModalProps {
  open: boolean
  periodLabel: string
  preview: MonthlyClosePreview
  onPeriodLabelChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}


export interface OpeningBalanceForm {
  twdAdjust: string
  usdtAdjust: string
  vnAdjust: string
  usdtCostTwd: string
  usdtCostVn: string
  vnTwdRate: string
  vnUsdtRate: string
}

export interface OpeningBalanceModalProps {
  open: boolean
  /** 目前身上水位（顯示／歸零／夠不夠扣以此為準） */
  liveBalances: Balances
  form: OpeningBalanceForm
  error: string
  onFieldChange: (field: keyof OpeningBalanceForm, value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export interface MonthlyClosesListProps {
  onOpeningBalance: () => void
  onCabinRebalance: () => void
  onMonthlyClose: () => void
  onPullProdState?: () => void
  pullProdBusy?: boolean
  onResetAll?: () => void
}

export interface MonthlyArchivePanelProps {
  closes: MonthlyClose[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}


export interface AppNavProps {
  activeTab: PageTab
  settlementsCount: number
  onSelect: (tab: PageTab) => void
  layout: 'sidebar' | 'drawer'
  onNavigate?: () => void
}


export interface UndoBannerProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
}

export interface ConfirmModalProps {
  dialog: ConfirmDialogState | null
  onCancel: () => void
}

export interface CabinAllocModalProps {
  open: boolean
  /** 本筆動到的數量總量（P 或 T） */
  totalUsdt: number
  /** 顯示用幣別 */
  currencyLabel?: 'P' | 'T'
  /** 買入為 +、賣出／付 U 為 −（僅顯示用） */
  direction: 'in' | 'out'
  initialCabinA: number
  initialCabinB: number
  cabinBalances: { a: number; b: number; c: number }
  error: string
  onCancel: () => void
  onConfirm: (cabinAAmount: number, cabinBAmount: number) => void
  /** 使用者改分配時清除外層錯誤（避免殘留舊訊息） */
  onDismissError?: () => void
}
