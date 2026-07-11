import type { FormEvent, RefObject } from 'react'

export type TransactionType = 'buy' | 'sell'
export type UsdtTradeField = 'usdt' | 'fiat' | 'rate'
export type VnTradeField = 'vn' | 'pay' | 'rate'
export type EditingCategory = TransactionType | 'vn_buy' | 'vn_sell' | 'expense'
export type DailyWorkTab = 'usdt' | 'vn'
export type DailyMobileTradePane = 'buy_u' | 'sell_u' | 'buy_vn' | 'sell_vn'
export type FiatCurrency = 'twd' | 'vn'
export type VnPayCurrency = 'twd' | 'usdt'
/** P（USDT）艙別：共用成本池，僅拆數量 */
export type UsdtCabin = 'A' | 'B'
export type ExpenseType = 'fuel' | 'parking' | 'meal' | 'traffic' | 'other'
export type PageTab = 'daily' | 'expenses' | 'settlements' | 'monthly' | 'notes' | 'cabins'
export type AccentColor = 'emerald' | 'rose' | 'violet' | 'orange'

export interface UsdtTransaction {
  id: string
  timestamp: Date
  category: 'usdt'
  type: TransactionType
  fiatCurrency: FiatCurrency
  usdtAmount: number
  fiatAmount: number
  /** 匯率 = 法幣金額 / USDT 金額 */
  rate: number
  /** 歸 A 艙的 USDT 數量；B = usdtAmount − cabinAAmount。成本仍共用 */
  cabinAAmount?: number
  /** 舊資料單艙標籤；有 cabinAAmount 時以數量為準 */
  cabin?: UsdtCabin
}

export interface VnTradeTransaction {
  id: string
  timestamp: Date
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
  /** 舊資料單艙標籤；有 cabinAAmount 時以數量為準 */
  cabin?: UsdtCabin
}

export interface ExpenseTransaction {
  id: string
  timestamp: Date
  category: 'expense'
  expenseType: ExpenseType
  amountTwd: number
  note: string
}

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
}

export interface ExpenseSettlementItem {
  expenseType: ExpenseType
  amountTwd: number
  note: string
  timestamp: Date
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
  /** 月結實際總資產（庫存計價帳面 − 本期開銷） */
  closingTotalAssets: number
  /** 月結當下庫存成本計價帳面（未扣開銷） */
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
}

export interface ConfirmDialogState {
  title: string
  lines: string[]
  tradeSettleSummary?: TradeSettleConfirmSummary
  confirmLabel: string
  variant: 'danger' | 'primary'
  alertOnly?: boolean
  onConfirm: () => void
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
  pendingTradeCount: number
  pendingExpenseCount: number
}

export interface NotebookEntry {
  id: string
  createdAt: Date
  updatedAt: Date
  text: string
}

export interface AppSnapshot {
  transactions: Transaction[]
  openingBalances: Balances
  openingUsdtCost: UsdtInventoryCost
  openingUsdtCabinA: number
  openingVnTwdRate: number | null
  openingVnUsdtRate: number | null
  settlements: DailySettlement[]
  expenseSettlements: ExpenseSettlement[]
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
  usdtCabinBalances: { a: number; b: number }
  totalAssets: TotalAssetsTwd
  vnTwdRate: number | null
  vnUsdtRate: number | null
  /** POS 頁：套用 A/B 內部互轉（只改分倉，總 P 不變） */
  onRebalanceCabins?: (targetCabinA: number) => void
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
  /** buy 顯示當日買入均價；sell 顯示每筆利潤 */
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
  error: string
  isEditing: boolean
  disabled: boolean
  onFieldChange: (field: 'usdt' | 'fiat' | 'rate', value: string) => void
  onTradeDateChange: (value: string) => void
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
  error: string
  isEditing: boolean
  disabled: boolean
  onFieldChange: (field: 'vn' | 'pay' | 'rate', value: string) => void
  onTradeDateChange: (value: string) => void
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
  expenseType: ExpenseType
  amount: string
  note: string
  error: string
  isEditing: boolean
  disabled: boolean
  onExpenseTypeChange: (value: ExpenseType) => void
  onAmountChange: (value: string) => void
  onNoteChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onCancel: () => void
}


export interface ExpensePageSummaryProps {
  transactions: ExpenseTransaction[]
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
}

export interface SettlementRecordBodyProps {
  twdBalance: number
  usdtBalance: number
  vnBalance: number
  twdAvg: number | null
  vnPoolRate: number | null
  vnUsdtPoolRate: number | null
  displayAssets: TotalAssetsTwd
  dayBuyTwd: number | null
  dayBuyVn: number | null
  dayUsdtProfit: number | undefined
  dayVnProfit: number | undefined
  dayTotalProfit: number
}


export interface ExpenseSettlementsPanelProps {
  settlements: ExpenseSettlement[]
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
  currentBalances: Balances
  form: OpeningBalanceForm
  error: string
  onFieldChange: (field: keyof OpeningBalanceForm, value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export interface MonthlyClosesListProps {
  closes: MonthlyClose[]
  expandedId: string | null
  onExpandedChange: (id: string | null) => void
  onStartClose: () => void
  onOpeningBalance: () => void
  onResetAll: () => void
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
  /** 本筆動到的 USDT 總量 */
  totalUsdt: number
  /** 買入為 +、賣出／付 U 為 −（僅顯示用） */
  direction: 'in' | 'out'
  initialCabinA: number
  cabinBalances: { a: number; b: number }
  error: string
  onCancel: () => void
  onConfirm: (cabinAAmount: number) => void
}
