import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createNoteAsync, deleteNoteAsync, loadNotesAsync, updateNoteAsync } from './api/notes'
import {
  loadPersistedAppStateAsync,
  savePersistedAppStateAsync,
  canPullProdStateToLocal,
  canResetAllLocally,
  pullProdStateToLocalAsync,
  type PersistedAppState,
} from './persistence'
import type {
  AppSnapshot,
  Balances,
  ConfirmDialogState,
  CumulativeExpenseEntry,
  DailySettlement,
  DailyWorkTab,
  DailyMobileTradePane,
  EditingCategory,
  ExpenseSettlement,
  ExpenseTransaction,
  MonthlyClose,
  NotebookEntry,
  OpeningBalanceForm,
  PageTab,
  Transaction,
  TransactionType,
  TwdCabinNotes,
  TwdCabinNoteFieldKey,
  UsdtCabin,
  UsdtInventoryCost,
  UsdtTransaction,
  VnPayCurrency,
  VnTradeTransaction,
} from './types'
import { EMPTY_USDT_COST, INITIAL_BALANCES, TRADE_PANE_CODE, tradePaneEditLabel, tradePaneEditingBannerLabel } from './constants'
import { EMPTY_TWD_CABIN_NOTES } from './types'
import {
  formatRateCalc,
  formatVnRateCalc,
  resolveUsdtTradeFields,
  resolveVnTradeFields,
} from './utils/form'
import {
  assessRateDeviation,
  formatRateDeviationConfirmLines,
  formatRateDeviationConfirmTitle,
} from './utils/rateSanity'
import {
  applyOpeningUsdtDeltaToCabin,
  buildDeleteConfirmLines,
  buildMonthlyClose,
  buildMonthlyClosePreview,
  buildTradeSettleConfirmSummary,
  computeArchivedDateRange,
  computeSettleDayInventoryRates,
  computeSettleDayUsdtProfit,
  computeSettleDayUsdtSellProfitById,
  computeSettleDayVnProfit,
  computeSettleDayVnSellProfitById,
  computeTotalAssetsAtCostRates,
  computeUsdtCabinBalances,
  deductUsdtFromCabinsBAC,
  expensePayCurrency as resolveExpensePayCurrency,
  expenseSettlementsFromCumulative,
  expenseUsdtAmount,
  filterExpenseTransactions,
  filterTradeTransactions,
  getLastTradeSettlementAt,
  filterUsdtTransactions,
  filterVnTradeTransactions,
  isExpenseTransaction,
  isUsdtTransaction,
  isVnTradeTransaction,
  migrateUsdtCabinAttribution,
  normalizeCabinAlloc,
  normalizeLoadedSettlement,
  normalizeLoadedTransactions,
  repairTradeTimestampsAfterSettle,
  normalizeMonthlyClose,
  normalizeUsdtCabinSnapshot,
  normalizeVnTradeTransaction,
  openingBalanceToForm,
  alignOpeningUsdtCabinsToSnapshot,
  recalculateBalances,
  suggestMonthlyPeriodLabel,
  resolveCabinAAmount,
  resolveCabinBAmount,
  settlementFromTotalAssets,
  validateTransactions,
  resolveUsdtSpendValidationError,
  resolveVnTwdLegValidationError,
  balanceImpactFromCumulativeExpense,
  computeDayExpenseTwdCashTotal,
  computeDayExpenseUsdtTotal,
  computeDayExpenseTotal,
  vnTradePayAmount,
} from './domain'
import {
  dateInputValueFromDate,
  defaultTradeDateInputValue,
  formatExpenseTwdInput,
  formatExpenseUsdtInput,
  formatNumber,
  formatSettlementDateTime,
  formatSettlementDateTimeForBusinessDate,
  formatTwdCompactInput,
  formatTwdTableCompact,
  formatVnCompactInput,
  isValidDateInputValue,
  coerceDisplayZeroBalance,
  parseExpenseTwdInput,
  parseExpenseUsdtInput,
  parseTwdAdjustInput,
  parseUsdtAdjustInput,
  parseVnAdjustInput,
  compareTradeListOrder,
  resolveTradeDate,
  timestampForNewTrade,
  timestampForEditedTrade,
  timestampFromDateInput,
} from './utils/format'
import { formCardClass, recordCardClass } from './utils/uiClasses'
import {
  AppNav,
  CabinAllocModal,
  CabinRebalanceModal,
  ConfirmModal,
  CumulativeExpensesPanel,
  DailyBalanceStrip,
  DailyTradeSettleBar,
  DailyMobileTradeTabBar,
  EditingBanner,
  ExpenseForm,
  ExpensePageSummary,
  ExpenseTable,
  MobileNavCloseIcon,
  MobileNavMenuIcon,
  MonthlyArchivePanel,
  MonthlyClosesList,
  NotebookPanel,
  OpeningBalanceModal,
  OpeningUsdtCabinPickModal,
  SettlementsPanel,
  TradeForm,
  TransactionTable,
  UndoBanner,
  VnTradeForm,
  VnTradeTable,
  useTransactionVisibleRows,
} from './components'

const MOBILE_TAB_LABEL: Record<Exclude<PageTab, 'daily' | 'notes'>, string> = {
  expenses: 'EXP',
  cumulative_expenses: 'EXP.SUM',
  settlements: 'SET.',
  month: '月結',
  monthly: 'SETUP',
}

type PendingCabinAlloc =
  | {
      kind: 'usdt'
      type: TransactionType
      usdt: number
      fiat: number
      rate: number
      isEditing: boolean
      tradeDate: string
      note: string
      initialCabinA: number
      initialCabinB: number
      direction: 'in' | 'out'
    }
  | {
      kind: 'vn'
      type: TransactionType
      payCurrency: VnPayCurrency
      vn: number
      pay: number
      rate: number
      isEditing: boolean
      tradeDate: string
      note: string
      initialCabinA: number
      initialCabinB: number
      direction: 'in' | 'out'
    }

function dailyTradePaneClass(
  mobilePane: DailyMobileTradePane,
  desktopTab: DailyWorkTab,
  pane: DailyMobileTradePane,
  parentTab: DailyWorkTab,
): string {
  return [
    'flex flex-col gap-1 sm:gap-1.5',
    mobilePane !== pane ? 'max-lg:hidden' : '',
    desktopTab !== parentTab ? 'lg:hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function App() {
  const tableVisibleRows = useTransactionVisibleRows()
  const persistedRef = useRef<PersistedAppState | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const persistReadyRef = useRef(false)

  const [activeTab, setActiveTab] = useState<PageTab>('daily')
  const [dailyWorkTab, setDailyWorkTab] = useState<DailyWorkTab>('usdt')
  const [mobileTradePane, setMobileTradePane] = useState<DailyMobileTradePane>('buy_u')
  const [openingBalances, setOpeningBalances] = useState<Balances>({ ...INITIAL_BALANCES })
  const [openingUsdtCost, setOpeningUsdtCost] = useState<UsdtInventoryCost>({ ...EMPTY_USDT_COST })
  const [openingUsdtCabinA, setOpeningUsdtCabinA] = useState(0)
  const [openingUsdtCabinB, setOpeningUsdtCabinB] = useState(0)
  const [twdCabinNotes, setTwdCabinNotes] = useState<TwdCabinNotes>({ ...EMPTY_TWD_CABIN_NOTES })
  const [openingVnTwdRate, setOpeningVnTwdRate] = useState<number | null>(null)
  const [openingVnUsdtRate, setOpeningVnUsdtRate] = useState<number | null>(null)
  const [settlements, setSettlements] = useState<DailySettlement[]>([])
  const [expenseSettlements, setExpenseSettlements] = useState<ExpenseSettlement[]>([])
  const [cumulativeExpenses, setCumulativeExpenses] = useState<CumulativeExpenseEntry[]>([])
  const [monthlyCloses, setMonthlyCloses] = useState<MonthlyClose[]>([])
  const [selectedMonthlyCloseId, setSelectedMonthlyCloseId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [notes, setNotes] = useState<NotebookEntry[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteError, setNoteError] = useState('')

  const [buyUsdtAmount, setBuyUsdtAmount] = useState('')
  const [buyFiatAmount, setBuyFiatAmount] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [buyTradeDate, setBuyTradeDate] = useState(defaultTradeDateInputValue)
  const [buyNote, setBuyNote] = useState('')
  const [buyError, setBuyError] = useState('')

  const [sellUsdtAmount, setSellUsdtAmount] = useState('')
  const [sellFiatAmount, setSellFiatAmount] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [sellTradeDate, setSellTradeDate] = useState(defaultTradeDateInputValue)
  const [sellNote, setSellNote] = useState('')
  const [sellError, setSellError] = useState('')

  const [vnBuyVnAmount, setVnBuyVnAmount] = useState('')
  const [vnBuyPayAmount, setVnBuyPayAmount] = useState('')
  const [vnBuyPayCurrency, setVnBuyPayCurrency] = useState<VnPayCurrency>('usdt')
  const [vnBuyRate, setVnBuyRate] = useState('')
  const [vnBuyTradeDate, setVnBuyTradeDate] = useState(defaultTradeDateInputValue)
  const [vnBuyNote, setVnBuyNote] = useState('')
  const [vnBuyError, setVnBuyError] = useState('')

  const [vnSellVnAmount, setVnSellVnAmount] = useState('')
  const [vnSellPayAmount, setVnSellPayAmount] = useState('')
  const [vnSellPayCurrency, setVnSellPayCurrency] = useState<VnPayCurrency>('twd')
  const [vnSellRate, setVnSellRate] = useState('')
  const [vnSellTradeDate, setVnSellTradeDate] = useState(defaultTradeDateInputValue)
  const [vnSellNote, setVnSellNote] = useState('')
  const [vnSellError, setVnSellError] = useState('')

  const [cabinAllocPending, setCabinAllocPending] = useState<PendingCabinAlloc | null>(null)
  const [cabinAllocError, setCabinAllocError] = useState('')
  const [editCabinAAmount, setEditCabinAAmount] = useState<number | null>(null)
  const [editCabinBAmount, setEditCabinBAmount] = useState<number | null>(null)

  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseNote, setExpenseNote] = useState('')
  const [expenseDate, setExpenseDate] = useState(defaultTradeDateInputValue)
  const [expenseFormPayCurrency, setExpenseFormPayCurrency] = useState<VnPayCurrency>('twd')
  const [expenseError, setExpenseError] = useState('')

  const [openingBalanceModalOpen, setOpeningBalanceModalOpen] = useState(false)
  const [cabinRebalanceModalOpen, setCabinRebalanceModalOpen] = useState(false)
  const [openingUsdtCabinPickAdjust, setOpeningUsdtCabinPickAdjust] = useState<number | null>(null)
  const [openingBalanceForm, setOpeningBalanceForm] = useState<OpeningBalanceForm>(() =>
    openingBalanceToForm({ ...EMPTY_USDT_COST }, null, null),
  )
  const [openingBalanceError, setOpeningBalanceError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<AppSnapshot | null>(null)
  const [undoMessage, setUndoMessage] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [pullProdBusy, setPullProdBusy] = useState(false)
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const buyBodyScrollRef = useRef<HTMLDivElement>(null)
  const sellBodyScrollRef = useRef<HTMLDivElement>(null)
  const vnBuyBodyScrollRef = useRef<HTMLDivElement>(null)
  const vnSellBodyScrollRef = useRef<HTMLDivElement>(null)
  const syncBodyScrollLock = useRef(false)

  useEffect(() => {
    let cancelled = false

    void Promise.all([loadPersistedAppStateAsync(), loadNotesAsync()]).then(
      ([stateResult, notesResult]) => {
        if (cancelled) return

        if (!stateResult.ok) {
          setLoadError(stateResult.error)
          setReady(true)
          return
        }

        const data = stateResult.state
        if (data) {
          persistedRef.current = data
          setActiveTab(data.activeTab)
          setDailyWorkTab(data.dailyWorkTab ?? 'usdt')
          setMobileTradePane(data.dailyWorkTab === 'vn' ? 'buy_vn' : 'buy_u')
          setOpeningBalances({ ...data.openingBalances })
          setOpeningUsdtCost({ ...data.openingUsdtCost })
          setOpeningVnTwdRate(data.openingVnTwdRate ?? null)
          setOpeningVnUsdtRate(data.openingVnUsdtRate ?? null)
          setSettlements(data.settlements.map(normalizeLoadedSettlement))
          setExpenseSettlements(data.expenseSettlements ?? [])
          setCumulativeExpenses(data.cumulativeExpenses ?? [])
          setMonthlyCloses((data.monthlyCloses ?? []).map((item) => normalizeMonthlyClose(item)))
          setSelectedMonthlyCloseId(null)
          const settledAt = getLastTradeSettlementAt(
            data.settlements.map(normalizeLoadedSettlement),
          )
          const normalizedTx = repairTradeTimestampsAfterSettle(
            normalizeLoadedTransactions(data.transactions),
            settledAt,
          )
          const migrated = migrateUsdtCabinAttribution(
            data.openingBalances,
            data.openingUsdtCabinA,
            normalizedTx,
            data.openingUsdtCabinB,
          )
          let nextOpeningA = migrated.openingUsdtCabinA
          let nextOpeningB = migrated.openingUsdtCabinB
          if (data.usdtCabinSnapshot) {
            const currentCabins = computeUsdtCabinBalances(
              data.openingBalances,
              nextOpeningA,
              migrated.transactions,
              settledAt,
              nextOpeningB,
            )
            const totalUsdt = recalculateBalances(
              migrated.transactions,
              data.openingBalances,
              settledAt,
            ).usdt
            const aligned = alignOpeningUsdtCabinsToSnapshot(
              nextOpeningA,
              nextOpeningB,
              currentCabins,
              data.usdtCabinSnapshot,
              totalUsdt,
            )
            nextOpeningA = aligned.a
            nextOpeningB = aligned.b
          }
          setOpeningUsdtCabinA(nextOpeningA)
          setOpeningUsdtCabinB(nextOpeningB)
          setTwdCabinNotes(
            data.twdCabinNotes
              ? {
                  a: String(data.twdCabinNotes.a ?? ''),
                  b: String(data.twdCabinNotes.b ?? ''),
                  t: String(data.twdCabinNotes.t ?? ''),
                  c: String(data.twdCabinNotes.c ?? ''),
                  d: String(data.twdCabinNotes.d ?? ''),
                  e: String(data.twdCabinNotes.e ?? ''),
                  f: String(data.twdCabinNotes.f ?? ''),
                  pf: String(data.twdCabinNotes.pf ?? ''),
                }
              : { ...EMPTY_TWD_CABIN_NOTES },
          )
          setTransactions(migrated.transactions)
          setOpeningBalanceForm(
            openingBalanceToForm(
              data.openingUsdtCost,
              data.openingVnTwdRate ?? null,
              data.openingVnUsdtRate ?? null,
            ),
          )
        }

        if (notesResult.ok) {
          setNotes(notesResult.notes)
        } else {
          console.error('[notes] load failed:', notesResult.error)
          setNotes([])
        }

        persistReadyRef.current = true
        setReady(true)
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // 切換分頁時關閉手機選單
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab change should collapse mobile nav
    setMobileNavOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (!highlightedTransactionId) return
    const timer = window.setTimeout(() => setHighlightedTransactionId(null), 2400)
    return () => window.clearTimeout(timer)
  }, [highlightedTransactionId])

  const flashNewTransaction = (id: string) => {
    setHighlightedTransactionId(id)
  }

  const closeMobileNav = () => setMobileNavOpen(false)

  const syncTransactionBodyScroll = (source: 'buy' | 'sell', scrollTop: number) => {
    if (syncBodyScrollLock.current) return
    syncBodyScrollLock.current = true
    const target = source === 'buy' ? sellBodyScrollRef.current : buyBodyScrollRef.current
    if (target && target.scrollTop !== scrollTop) {
      target.scrollTop = scrollTop
    }
    syncBodyScrollLock.current = false
  }

  const syncVnBodyScroll = (source: 'buy' | 'sell', scrollTop: number) => {
    if (syncBodyScrollLock.current) return
    syncBodyScrollLock.current = true
    const target = source === 'buy' ? vnSellBodyScrollRef.current : vnBuyBodyScrollRef.current
    if (target && target.scrollTop !== scrollTop) {
      target.scrollTop = scrollTop
    }
    syncBodyScrollLock.current = false
  }

  const lastTradeSettledAt = useMemo(
    () => getLastTradeSettlementAt(settlements),
    [settlements],
  )

  const balances = useMemo(
    () => recalculateBalances(transactions, openingBalances, lastTradeSettledAt),
    [transactions, openingBalances, lastTradeSettledAt],
  )

  const usdtCabinBalances = useMemo(
    () =>
      computeUsdtCabinBalances(
        openingBalances,
        openingUsdtCabinA,
        transactions,
        lastTradeSettledAt,
        openingUsdtCabinB,
      ),
    [openingBalances, openingUsdtCabinA, openingUsdtCabinB, transactions, lastTradeSettledAt],
  )

  useEffect(() => {
    if (!persistReadyRef.current) return

    const cabinSnapshot = normalizeUsdtCabinSnapshot(
      balances.usdt,
      usdtCabinBalances.a,
      usdtCabinBalances.b,
      usdtCabinBalances.c,
    )

    const payload: PersistedAppState = {
      activeTab,
      dailyWorkTab,
      openingBalances,
      openingUsdtCost,
      openingUsdtCabinA,
      openingUsdtCabinB,
      usdtCabinSnapshot: cabinSnapshot,
      twdCabinNotes,
      openingVnTwdRate,
      openingVnUsdtRate,
      transactions,
      settlements,
      expenseSettlements,
      cumulativeExpenses,
      monthlyCloses,
    }

    const timer = window.setTimeout(() => {
      void savePersistedAppStateAsync(payload)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [
    activeTab,
    dailyWorkTab,
    openingBalances,
    openingUsdtCost,
    openingUsdtCabinA,
    openingUsdtCabinB,
    twdCabinNotes,
    openingVnTwdRate,
    openingVnUsdtRate,
    transactions,
    settlements,
    expenseSettlements,
    cumulativeExpenses,
    monthlyCloses,
    balances.usdt,
    usdtCabinBalances.a,
    usdtCabinBalances.b,
    usdtCabinBalances.c,
  ])

  const usdtTransactions = useMemo(
    () => filterUsdtTransactions(transactions),
    [transactions],
  )

  /** 資產卡顯示用：凍結為前一日結算 @（不因當日買賣即時變動） */
  const displayInventoryCost = openingUsdtCost

  const vnTradeTransactions = useMemo(
    () => filterVnTradeTransactions(transactions),
    [transactions],
  )

  const expenseTransactions = useMemo(
    () => filterExpenseTransactions(transactions),
    [transactions],
  )

  const tradeTransactions = useMemo(
    () => filterTradeTransactions(transactions),
    [transactions],
  )

  const createSnapshot = (): AppSnapshot => ({
    transactions,
    openingBalances,
    openingUsdtCost,
    openingUsdtCabinA,
    openingUsdtCabinB,
    twdCabinNotes,
    openingVnTwdRate,
    openingVnUsdtRate,
    settlements,
    expenseSettlements,
    cumulativeExpenses,
    monthlyCloses,
    selectedMonthlyCloseId,
    activeTab,
    dailyWorkTab,
    notes,
  })

  const restoreSnapshot = (snapshot: AppSnapshot) => {
    setTransactions(snapshot.transactions)
    setOpeningBalances(snapshot.openingBalances)
    setOpeningUsdtCost(snapshot.openingUsdtCost)
    setOpeningUsdtCabinA(snapshot.openingUsdtCabinA ?? 0)
    setOpeningUsdtCabinB(snapshot.openingUsdtCabinB ?? 0)
    setTwdCabinNotes({
      ...EMPTY_TWD_CABIN_NOTES,
      ...(snapshot.twdCabinNotes ?? {}),
    })
    setOpeningVnTwdRate(snapshot.openingVnTwdRate ?? null)
    setOpeningVnUsdtRate(snapshot.openingVnUsdtRate ?? null)
    setSettlements(snapshot.settlements.map(normalizeLoadedSettlement))
    setExpenseSettlements(snapshot.expenseSettlements ?? [])
    setCumulativeExpenses(snapshot.cumulativeExpenses ?? [])
    setMonthlyCloses((snapshot.monthlyCloses ?? []).map((item) => normalizeMonthlyClose(item)))
    setSelectedMonthlyCloseId(snapshot.selectedMonthlyCloseId ?? null)
    setActiveTab(snapshot.activeTab)
    const restoredWorkTab = snapshot.dailyWorkTab ?? 'usdt'
    setDailyWorkTab(restoredWorkTab)
    setMobileTradePane(restoredWorkTab === 'vn' ? 'buy_vn' : 'buy_u')
    setNotes(snapshot.notes ?? [])
  }

  const handleSelectTab = (tab: PageTab) => {
    if (tab !== 'notes' && editingNoteId) {
      resetNoteForm()
    }
    if (tab !== 'month') {
      setSelectedMonthlyCloseId(null)
    }
    setActiveTab(tab)
  }

  const buyTransactions = useMemo(
    () =>
      usdtTransactions
        .filter((tx) => tx.type === 'buy')
        .sort(compareTradeListOrder),
    [usdtTransactions],
  )
  const sellTransactions = useMemo(
    () =>
      usdtTransactions
        .filter((tx) => tx.type === 'sell')
        .sort(compareTradeListOrder),
    [usdtTransactions],
  )
  const vnBuyTransactions = useMemo(
    () =>
      vnTradeTransactions
        .filter((tx) => tx.type === 'buy')
        .sort(compareTradeListOrder),
    [vnTradeTransactions],
  )
  const vnSellTransactions = useMemo(
    () =>
      vnTradeTransactions
        .filter((tx) => tx.type === 'sell')
        .sort(compareTradeListOrder),
    [vnTradeTransactions],
  )

  const totalAssets = useMemo(
    () =>
      computeTotalAssetsAtCostRates(
        balances,
        openingUsdtCost.twd,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
    [balances, openingUsdtCost.twd, openingVnTwdRate, openingVnUsdtRate],
  )

  const resetBuyForm = () => {
    setBuyUsdtAmount('')
    setBuyFiatAmount('')
    setBuyRate('')
    setBuyTradeDate(defaultTradeDateInputValue())
    setBuyNote('')
    setBuyError('')
    if (editingCategory === 'buy') {
      setEditingId(null)
      setEditingCategory(null)
      setEditCabinAAmount(null)
      setEditCabinBAmount(null)
    }
  }

  const resetSellForm = () => {
    setSellUsdtAmount('')
    setSellFiatAmount('')
    setSellRate('')
    setSellTradeDate(defaultTradeDateInputValue())
    setSellNote('')
    setSellError('')
    if (editingCategory === 'sell') {
      setEditingId(null)
      setEditingCategory(null)
      setEditCabinAAmount(null)
      setEditCabinBAmount(null)
    }
  }

  const clearBuyForm = () => {
    setBuyUsdtAmount('')
    setBuyFiatAmount('')
    setBuyRate('')
    setBuyNote('')
    setBuyError('')
  }

  const clearSellForm = () => {
    setSellUsdtAmount('')
    setSellFiatAmount('')
    setSellRate('')
    setSellNote('')
    setSellError('')
  }

  const updateBuyForm = (field: 'usdt' | 'fiat' | 'rate', value: string) => {
    if (field === 'usdt') setBuyUsdtAmount(value)
    else if (field === 'fiat') setBuyFiatAmount(value)
    else setBuyRate(value)
  }

  const updateSellForm = (field: 'usdt' | 'fiat' | 'rate', value: string) => {
    if (field === 'usdt') setSellUsdtAmount(value)
    else if (field === 'fiat') setSellFiatAmount(value)
    else setSellRate(value)
  }

  const resetVnBuyForm = () => {
    setVnBuyVnAmount('')
    setVnBuyPayAmount('')
    setVnBuyPayCurrency('usdt')
    setVnBuyRate('')
    setVnBuyTradeDate(defaultTradeDateInputValue())
    setVnBuyNote('')
    setVnBuyError('')
    if (editingCategory === 'vn_buy') {
      setEditingId(null)
      setEditingCategory(null)
      setEditCabinAAmount(null)
      setEditCabinBAmount(null)
    }
  }

  const resetVnSellForm = () => {
    setVnSellVnAmount('')
    setVnSellPayAmount('')
    setVnSellPayCurrency('twd')
    setVnSellRate('')
    setVnSellTradeDate(defaultTradeDateInputValue())
    setVnSellNote('')
    setVnSellError('')
    if (editingCategory === 'vn_sell') {
      setEditingId(null)
      setEditingCategory(null)
      setEditCabinAAmount(null)
      setEditCabinBAmount(null)
    }
  }

  const clearVnBuyForm = () => {
    setVnBuyVnAmount('')
    setVnBuyPayAmount('')
    setVnBuyRate('')
    setVnBuyNote('')
    setVnBuyError('')
  }

  const clearVnSellForm = () => {
    setVnSellVnAmount('')
    setVnSellPayAmount('')
    setVnSellRate('')
    setVnSellNote('')
    setVnSellError('')
  }

  const resetExpenseForm = () => {
    setExpenseAmount('')
    setExpenseNote('')
    setExpenseDate(defaultTradeDateInputValue())
    setExpenseFormPayCurrency('twd')
    setExpenseError('')
    if (editingCategory === 'expense') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetNoteForm = () => {
    setNoteDraft('')
    setNoteError('')
    setEditingNoteId(null)
  }

  const handleNoteSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setNoteError('')

    const text = noteDraft.trim()
    if (!text) {
      setNoteError('請輸入內容')
      return
    }

    if (editingNoteId) {
      const result = await updateNoteAsync(editingNoteId, text)
      if (!result.ok) {
        setNoteError(result.error)
        return
      }
      setNotes((prev) =>
        prev.map((entry) => (entry.id === result.note.id ? result.note : entry)),
      )
      resetNoteForm()
      return
    }

    const result = await createNoteAsync(text)
    if (!result.ok) {
      setNoteError(result.error)
      return
    }
    setNotes((prev) => [result.note, ...prev])
    resetNoteForm()
  }

  const handleEditNote = (entry: NotebookEntry) => {
    if (editingCategory !== null) {
      cancelEditing()
    }
    setEditingNoteId(entry.id)
    setNoteDraft(entry.text)
    setNoteError('')
  }

  const handleDeleteNote = (id: string) => {
    const entry = notes.find((item) => item.id === id)
    if (!entry) return

    setConfirmDialog({
      title: '確定刪除此筆記？',
      lines: [entry.text],
      confirmLabel: '刪除',
      variant: 'danger',
      onConfirm: () => {
        void (async () => {
          const result = await deleteNoteAsync(id)
          setConfirmDialog(null)
          if (!result.ok) {
            setNoteError(result.error)
            return
          }
          setNotes((prev) => prev.filter((item) => item.id !== id))
          if (editingNoteId === id) {
            resetNoteForm()
          }
        })()
      },
    })
  }

  const updateVnBuyForm = (field: 'vn' | 'pay' | 'rate', value: string) => {
    if (field === 'vn') setVnBuyVnAmount(value)
    else if (field === 'pay') setVnBuyPayAmount(value)
    else setVnBuyRate(value)
  }

  const updateVnSellForm = (field: 'vn' | 'pay' | 'rate', value: string) => {
    if (field === 'vn') setVnSellVnAmount(value)
    else if (field === 'pay') setVnSellPayAmount(value)
    else setVnSellRate(value)
  }

  const handleMobileTradePaneChange = (pane: DailyMobileTradePane) => {
    if (pane === mobileTradePane) return
    if (editingCategory === 'buy' && pane !== 'buy_u') resetBuyForm()
    else if (editingCategory === 'sell' && pane !== 'sell_u') resetSellForm()
    else if (editingCategory === 'vn_buy' && pane !== 'buy_vn') resetVnBuyForm()
    else if (editingCategory === 'vn_sell' && pane !== 'sell_vn') resetVnSellForm()
    else if (editingCategory === 'expense') resetExpenseForm()
    setMobileTradePane(pane)
    if (pane === 'buy_u' || pane === 'sell_u') setDailyWorkTab('usdt')
    else if (pane === 'buy_vn' || pane === 'sell_vn') setDailyWorkTab('vn')
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  const handleExpenseSubmit = (e: FormEvent) => {
    e.preventDefault()

    setExpenseError('')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    if (!isValidDateInputValue(expenseDate)) {
      setExpenseError('請輸入有效日期')
      return
    }

    let amountTwd: number
    let amountUsdt: number | undefined

    if (expenseFormPayCurrency === 'usdt') {
      const usdt = parseExpenseUsdtInput(expenseAmount)
      if (usdt === null) {
        setExpenseError('請輸入有效的正數 USDT 金額')
        return
      }
      const usdtUnit = openingUsdtCost.twd
      if (usdtUnit === null || usdtUnit <= 0) {
        setExpenseError('尚無 U@，無法換算 U 開銷台幣等值')
        return
      }
      amountUsdt = usdt
      amountTwd = Math.round(usdt * usdtUnit)
      if (amountTwd <= 0) {
        setExpenseError('換算台幣等值無效')
        return
      }
    } else {
      const twd = parseExpenseTwdInput(expenseAmount)
      if (twd === null) {
        setExpenseError('請輸入有效的正數金額')
        return
      }
      amountTwd = twd
      amountUsdt = undefined
    }

    const isEditing = editingId !== null && editingCategory === 'expense'

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isExpenseTransaction(tx)
            ? {
                ...tx,
                timestamp: timestampFromDateInput(expenseDate, tx.timestamp),
                expenseType: 'other' as const,
                expenseSource: 'standalone' as const,
                payCurrency: expenseFormPayCurrency,
                amountTwd,
                amountUsdt,
                note: expenseNote.trim(),
              }
            : tx,
        )
      }
      const newTransaction: ExpenseTransaction = {
        id: crypto.randomUUID(),
        timestamp: timestampFromDateInput(expenseDate),
        category: 'expense',
        expenseType: 'other',
        expenseSource: 'standalone',
        payCurrency: expenseFormPayCurrency,
        amountTwd,
        amountUsdt,
        note: expenseNote.trim(),
      }
      return [newTransaction, ...list]
    }

    setTransactions(buildUpdatedList(transactions))
    resetExpenseForm()
  }

  const handleAddCumulativeExpense = (timestamp: Date, amountTwd: number, note: string) => {
    setCumulativeExpenses((prev) => [
      { id: crypto.randomUUID(), timestamp, amountTwd, note },
      ...prev,
    ])
  }

  const handleUpdateCumulativeExpense = (
    id: string,
    timestamp: Date,
    amountTwd: number,
    note: string,
  ) => {
    setCumulativeExpenses((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, timestamp, amountTwd, note } : entry)),
    )
  }

  const executeDeleteCumulativeExpense = (id: string) => {
    const entry = cumulativeExpenses.find((item) => item.id === id)
    if (!entry) return

    const snapshot = createSnapshot()
    const { twdCash, usdt } = balanceImpactFromCumulativeExpense(entry)

    if (twdCash > 0 || usdt > 0) {
      setOpeningBalances((prev) => ({
        ...prev,
        twd: prev.twd + twdCash,
        usdt: prev.usdt + usdt,
      }))
      if (usdt > 0) {
        // RECON 扣艙為 B→A→C；加回時歸 B
        setOpeningUsdtCabinB((prev) => prev + usdt)
      }
    }

    setCumulativeExpenses((prev) => prev.filter((item) => item.id !== id))
    setUndoSnapshot(snapshot)
    const parts: string[] = []
    if (twdCash > 0) parts.push(`+${formatTwdTableCompact(twdCash)} T`)
    if (usdt > 0) parts.push(`+${formatNumber(usdt)} U`)
    setUndoMessage(
      parts.length > 0 ? `已刪除 EXP.SUM 並加回帳上（${parts.join(' · ')}）` : '已刪除 EXP.SUM',
    )
  }

  const handleDeleteCumulativeExpense = (id: string) => {
    const entry = cumulativeExpenses.find((item) => item.id === id)
    if (!entry) return

    const { twdCash, usdt } = balanceImpactFromCumulativeExpense(entry)
    const lines = [formatTwdTableCompact(entry.amountTwd), entry.note.trim() || '—']
    if (twdCash > 0 || usdt > 0) {
      const restore: string[] = []
      if (twdCash > 0) restore.push(`+${formatTwdTableCompact(twdCash)} T`)
      if (usdt > 0) restore.push(`+${formatNumber(usdt)} U`)
      lines.push(`將加回 ${restore.join(' · ')}`)
    }

    setConfirmDialog({
      title: '',
      lines,
      cancelLabel: 'C',
      confirmLabel: 'Del',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        executeDeleteCumulativeExpense(id)
      },
    })
  }

  const executeExpenseReconcile = (note = '') => {
    const pending = filterExpenseTransactions(transactions)
    if (pending.length === 0) return

    const expenseTwdEquivTotal = computeDayExpenseTotal(pending)
    if (expenseTwdEquivTotal <= 0) return
    const expenseTwdCashTotal = computeDayExpenseTwdCashTotal(pending)
    const expenseUsdtTotal = computeDayExpenseUsdtTotal(pending)

    const snapshot = createSnapshot()

    const cabinsAfterExpense =
      expenseUsdtTotal > 0
        ? deductUsdtFromCabinsBAC(usdtCabinBalances, expenseUsdtTotal)
        : usdtCabinBalances
    // 只從期初扣開銷，勿用 balances 覆寫（避免進行中交易被灌進期初而多扣／錯帳）
    setOpeningBalances((prev) => ({
      ...prev,
      twd: prev.twd - expenseTwdCashTotal,
      usdt: prev.usdt - expenseUsdtTotal,
    }))
    if (expenseUsdtTotal > 0) {
      setOpeningUsdtCabinA(cabinsAfterExpense.a)
      setOpeningUsdtCabinB(cabinsAfterExpense.b)
    }

    setTransactions((prev) => prev.filter((tx) => !isExpenseTransaction(tx)))
    setCumulativeExpenses((prev) => [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        amountTwd: expenseTwdEquivTotal,
        note: note.trim() || 'RECON',
        items: pending.map((tx) => ({
          amountTwd: tx.amountTwd,
          note: tx.note,
          timestamp: tx.timestamp,
          payCurrency: resolveExpensePayCurrency(tx),
          amountUsdt:
            resolveExpensePayCurrency(tx) === 'usdt' ? expenseUsdtAmount(tx) : undefined,
        })),
      },
      ...prev,
    ])
    resetExpenseForm()
    setUndoSnapshot(snapshot)
    const parts: string[] = []
    if (expenseTwdCashTotal > 0) parts.push(`−${formatTwdTableCompact(expenseTwdCashTotal)} T`)
    if (expenseUsdtTotal > 0) parts.push(`−${formatNumber(expenseUsdtTotal)} U`)
    setUndoMessage(
      parts.length > 0
        ? `已對帳扣款並寫入 EXP.SUM（${parts.join(' · ')}）`
        : '已對帳並寫入 EXP.SUM',
    )
  }

  const handleExpenseReconcile = () => {
    const pending = filterExpenseTransactions(transactions)
    if (pending.length === 0) return

    const twdCash = computeDayExpenseTwdCashTotal(pending)
    const usdtTotal = computeDayExpenseUsdtTotal(pending)
    const lines = [`#${pending.length}`]
    if (twdCash > 0) lines.push(`−${formatTwdTableCompact(twdCash)} T`)
    if (usdtTotal > 0) lines.push(`−${formatNumber(usdtTotal)} U`)
    setConfirmDialog({
      title: 'RECON 扣帳並封存',
      lines,
      noteInput: true,
      cancelLabel: 'Cancel',
      confirmLabel: 'RECON',
      variant: 'primary',
      onConfirm: (note) => {
        setConfirmDialog(null)
        executeExpenseReconcile(note)
      },
    })
  }

  const handleSubmit = (type: TransactionType, e: FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const usdtStr = isBuy ? buyUsdtAmount : sellUsdtAmount
    const fiatStr = isBuy ? buyFiatAmount : sellFiatAmount
    const rateStr = isBuy ? buyRate : sellRate
    const setError = isBuy ? setBuyError : setSellError
    const otherSetError = isBuy ? setSellError : setBuyError

    setError('')
    otherSetError('')
    setVnBuyError('')
    setVnSellError('')
    setExpenseError('')

    const isEditing = editingId !== null && editingCategory === type

    const tradeDate = isBuy ? buyTradeDate : sellTradeDate
    if (!isValidDateInputValue(tradeDate)) {
      setError('請選擇有效日期')
      return
    }
    const note = (isBuy ? buyNote : sellNote).trim()

    const resolved = resolveUsdtTradeFields(usdtStr, fiatStr, rateStr)
    if (!resolved.ok) {
      setError(resolved.error)
      return
    }
    const { usdt, fiat, rate } = resolved

    const openAlloc = () => {
      setCabinAllocError('')
      setCabinAllocPending({
        kind: 'usdt',
        type,
        usdt,
        fiat,
        rate,
        isEditing,
        tradeDate,
        note,
        initialCabinA: isEditing && editCabinAAmount !== null ? editCabinAAmount : usdt,
        initialCabinB: isEditing && editCabinBAmount !== null ? editCabinBAmount : 0,
        direction: isBuy ? 'in' : 'out',
      })
    }

    const rateCheck = assessRateDeviation(rate, openingUsdtCost.twd)
    if (rateCheck?.level === 'confirm') {
      setConfirmDialog({
        title: formatRateDeviationConfirmTitle('usdt'),
        lines: formatRateDeviationConfirmLines(rateCheck, 'usdt'),
        confirmLabel: '仍要儲存',
        variant: 'primary',
        onConfirm: () => {
          setConfirmDialog(null)
          openAlloc()
        },
      })
      return
    }

    openAlloc()
  }

  const commitUsdtTrade = (
    type: TransactionType,
    usdt: number,
    fiat: number,
    rate: number,
    isEditing: boolean,
    tradeDate: string,
    cabinAAmount: number,
    cabinBAmount: number,
    note: string,
  ): string | null => {
    const isBuy = type === 'buy'
    const setError = isBuy ? setBuyError : setSellError
    const newId = crypto.randomUUID()
    const cabinAlloc = normalizeCabinAlloc(usdt, cabinAAmount, cabinBAmount)
    const noteValue = note.trim() || undefined

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isUsdtTransaction(tx)
            ? {
                ...tx,
                type,
                fiatCurrency: 'twd' as const,
                usdtAmount: usdt,
                fiatAmount: fiat,
                rate,
                ...cabinAlloc,
                // 畫面日用 tradeDate；timestamp 盡量跟日走，但不早於結帳線
                tradeDate,
                timestamp: timestampForEditedTrade(
                  tradeDate,
                  tx.timestamp,
                  lastTradeSettledAt,
                ),
                note: noteValue,
              }
            : tx,
        )
      }
      const newTransaction: UsdtTransaction = {
        id: newId,
        timestamp: timestampForNewTrade(
          tradeDate,
          list.map((tx) => tx.timestamp),
        ),
        tradeDate,
        category: 'usdt',
        type,
        fiatCurrency: 'twd',
        usdtAmount: usdt,
        fiatAmount: fiat,
        rate,
        ...cabinAlloc,
        note: noteValue,
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = resolveUsdtSpendValidationError(
      validateTransactions(
        updatedTransactions,
        openingBalances,
        lastTradeSettledAt,
        openingUsdtCabinA,
        openingUsdtCabinB,
      ),
      {
        spendsTwd: type === 'buy',
        balances,
        cabins: usdtCabinBalances,
        usdtAmount: usdt,
        cabinAAmount,
        cabinBAmount,
        fiatAmount: type === 'buy' ? fiat : undefined,
      },
    )
    if (validationError) {
      setError(validationError)
      return null
    }

    setTransactions(updatedTransactions)
    if (isBuy) {
      resetBuyForm()
    } else {
      resetSellForm()
    }
    setEditCabinAAmount(null)
    setEditCabinBAmount(null)
    return isEditing ? null : newId
  }

  const handleVnSubmit = (type: TransactionType, e: FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const vnStr = isBuy ? vnBuyVnAmount : vnSellVnAmount
    const payStr = isBuy ? vnBuyPayAmount : vnSellPayAmount
    const rateStr = isBuy ? vnBuyRate : vnSellRate
    const payCurrency = isBuy ? vnBuyPayCurrency : vnSellPayCurrency
    const setError = isBuy ? setVnBuyError : setVnSellError
    const otherSetError = isBuy ? setVnSellError : setVnBuyError

    setError('')
    otherSetError('')
    setBuyError('')
    setSellError('')
    setExpenseError('')

    const editCategory = isBuy ? 'vn_buy' : 'vn_sell'
    const isEditing = editingId !== null && editingCategory === editCategory

    const tradeDate = isBuy ? vnBuyTradeDate : vnSellTradeDate
    if (!isValidDateInputValue(tradeDate)) {
      setError('請選擇有效日期')
      return
    }
    const note = (isBuy ? vnBuyNote : vnSellNote).trim()

    const resolved = resolveVnTradeFields(vnStr, payStr, rateStr, payCurrency)
    if (!resolved.ok) {
      setError(resolved.error)
      return
    }
    const { vn, pay, rate } = resolved

    const finishWithoutCabin = () => {
      const newId = commitVnTrade(
        type,
        payCurrency,
        vn,
        pay,
        rate,
        isEditing,
        tradeDate,
        null,
        null,
        note,
      )
      if (newId) {
        flashNewTransaction(newId)
      }
    }

    const openAlloc = () => {
      setCabinAllocError('')
      setCabinAllocPending({
        kind: 'vn',
        type,
        payCurrency: 'usdt',
        vn,
        pay,
        rate,
        isEditing,
        tradeDate,
        note,
        initialCabinA: isEditing && editCabinAAmount !== null ? editCabinAAmount : pay,
        initialCabinB: isEditing && editCabinBAmount !== null ? editCabinBAmount : 0,
        direction: isBuy ? 'out' : 'in',
      })
    }

    const afterRateOk = () => {
      if (payCurrency === 'usdt') {
        openAlloc()
      } else {
        finishWithoutCabin()
      }
    }

    const vnReferenceRate =
      payCurrency === 'twd' ? openingVnTwdRate : openingVnUsdtRate
    const rateCheck = assessRateDeviation(rate, vnReferenceRate)
    if (rateCheck?.level === 'confirm') {
      setConfirmDialog({
        title: formatRateDeviationConfirmTitle('vn'),
        lines: formatRateDeviationConfirmLines(rateCheck, 'vn'),
        confirmLabel: '仍要儲存',
        variant: 'primary',
        onConfirm: () => {
          setConfirmDialog(null)
          afterRateOk()
        },
      })
      return
    }

    afterRateOk()
  }

  const commitVnTrade = (
    type: TransactionType,
    payCurrency: VnPayCurrency,
    vn: number,
    pay: number,
    rate: number,
    isEditing: boolean,
    tradeDate: string,
    cabinAAmount: number | null,
    cabinBAmount: number | null = null,
    note: string = '',
  ): string | null => {
    const isBuy = type === 'buy'
    const setError = isBuy ? setVnBuyError : setVnSellError
    const newId = crypto.randomUUID()
    const noteValue = note.trim() || undefined

    const cabinAlloc =
      payCurrency === 'usdt' && cabinAAmount !== null
        ? normalizeCabinAlloc(pay, cabinAAmount, cabinBAmount ?? 0)
        : null

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isVnTradeTransaction(tx)
            ? {
                ...tx,
                type,
                payCurrency,
                vnAmount: vn,
                twdAmount: payCurrency === 'twd' ? pay : 0,
                usdtAmount: payCurrency === 'usdt' ? pay : 0,
                rate,
                cabin: cabinAlloc?.cabin,
                cabinAAmount: cabinAlloc?.cabinAAmount,
                cabinBAmount: cabinAlloc?.cabinBAmount,
                // 畫面日用 tradeDate；timestamp 盡量跟日走，但不早於結帳線
                tradeDate,
                timestamp: timestampForEditedTrade(
                  tradeDate,
                  tx.timestamp,
                  lastTradeSettledAt,
                ),
                note: noteValue,
              }
            : tx,
        )
      }
      const newTransaction: VnTradeTransaction = {
        id: newId,
        timestamp: timestampForNewTrade(
          tradeDate,
          list.map((tx) => tx.timestamp),
        ),
        tradeDate,
        category: 'vn_trade',
        type,
        payCurrency,
        vnAmount: vn,
        twdAmount: payCurrency === 'twd' ? pay : 0,
        usdtAmount: payCurrency === 'usdt' ? pay : 0,
        rate,
        ...(cabinAlloc ?? {}),
        note: noteValue,
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const cabinAForCheck = cabinAlloc?.cabinAAmount ?? 0
    const cabinBForCheck = cabinAlloc?.cabinBAmount ?? 0
    const validationError =
      payCurrency === 'usdt'
        ? resolveUsdtSpendValidationError(
            validateTransactions(
              updatedTransactions,
              openingBalances,
              lastTradeSettledAt,
              openingUsdtCabinA,
              openingUsdtCabinB,
            ),
            {
              spendsTwd: false,
              balances,
              cabins: usdtCabinBalances,
              usdtAmount: pay,
              cabinAAmount: cabinAForCheck,
              cabinBAmount: cabinBForCheck,
            },
          )
        : resolveVnTwdLegValidationError(
            validateTransactions(
              updatedTransactions,
              openingBalances,
              lastTradeSettledAt,
              openingUsdtCabinA,
              openingUsdtCabinB,
            ),
            {
              type,
              balances,
              vnAmount: vn,
              twdAmount: pay,
            },
          )
    if (validationError) {
      setError(validationError)
      return null
    }

    setTransactions(updatedTransactions)
    if (isBuy) {
      resetVnBuyForm()
    } else {
      resetVnSellForm()
    }
    setEditCabinAAmount(null)
    setEditCabinBAmount(null)
    return isEditing ? null : newId
  }

  const handleCabinAllocConfirm = (cabinAAmount: number, cabinBAmount: number) => {
    if (!cabinAllocPending) return
    setCabinAllocError('')

    if (cabinAllocPending.kind === 'usdt') {
      const { type, usdt, fiat, rate, isEditing, tradeDate, note } = cabinAllocPending
      const cabinAlloc = normalizeCabinAlloc(usdt, cabinAAmount, cabinBAmount)
      const updatedList: Transaction[] = isEditing
        ? transactions.map((tx) =>
            tx.id === editingId && isUsdtTransaction(tx)
              ? {
                  ...tx,
                  type,
                  fiatCurrency: 'twd' as const,
                  usdtAmount: usdt,
                  fiatAmount: fiat,
                  rate,
                  ...cabinAlloc,
                  tradeDate,
                  timestamp: timestampForEditedTrade(
                    tradeDate,
                    tx.timestamp,
                    lastTradeSettledAt,
                  ),
                }
              : tx,
          )
        : [
            {
              id: crypto.randomUUID(),
              timestamp: timestampForNewTrade(
                tradeDate,
                transactions.map((tx) => tx.timestamp),
              ),
              tradeDate,
              category: 'usdt' as const,
              type,
              fiatCurrency: 'twd' as const,
              usdtAmount: usdt,
              fiatAmount: fiat,
              rate,
              ...cabinAlloc,
            },
            ...transactions,
          ]
      const validationError = resolveUsdtSpendValidationError(
        validateTransactions(
          updatedList,
          openingBalances,
          lastTradeSettledAt,
          openingUsdtCabinA,
          openingUsdtCabinB,
        ),
        {
          spendsTwd: type === 'buy',
          balances,
          cabins: usdtCabinBalances,
          usdtAmount: usdt,
          cabinAAmount,
          cabinBAmount,
          fiatAmount: type === 'buy' ? fiat : undefined,
        },
      )
      if (validationError) {
        setCabinAllocError(validationError)
        return
      }
      const newId = commitUsdtTrade(
        type,
        usdt,
        fiat,
        rate,
        isEditing,
        tradeDate,
        cabinAAmount,
        cabinBAmount,
        note,
      )
      setCabinAllocPending(null)
      if (newId) flashNewTransaction(newId)
      return
    }

    const { type, vn, pay, rate, isEditing, tradeDate, note } = cabinAllocPending
    const newId = commitVnTrade(
      type,
      'usdt',
      vn,
      pay,
      rate,
      isEditing,
      tradeDate,
      cabinAAmount,
      cabinBAmount,
      note,
    )
    if (!newId) {
      return
    }
    setCabinAllocPending(null)
    setEditCabinAAmount(null)
    setEditCabinBAmount(null)
    flashNewTransaction(newId)
  }

  const handleEdit = (tx: UsdtTransaction) => {
    resetNoteForm()
    setActiveTab('daily')
    setDailyWorkTab('usdt')
    setMobileTradePane(tx.type === 'buy' ? 'buy_u' : 'sell_u')
    setEditingId(tx.id)
    setEditingCategory(tx.type)
    setEditCabinAAmount(resolveCabinAAmount(tx))
    setEditCabinBAmount(resolveCabinBAmount(tx))
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    if (tx.type === 'buy') {
      setBuyUsdtAmount(String(tx.usdtAmount))
      setBuyFiatAmount(formatTwdCompactInput(tx.fiatAmount))
      setBuyRate(formatRateCalc(tx.rate))
      setBuyTradeDate(resolveTradeDate(tx))
      setBuyNote(tx.note ?? '')
    } else {
      setSellUsdtAmount(String(tx.usdtAmount))
      setSellFiatAmount(formatTwdCompactInput(tx.fiatAmount))
      setSellRate(formatRateCalc(tx.rate))
      setSellTradeDate(resolveTradeDate(tx))
      setSellNote(tx.note ?? '')
    }
  }

  const handleEditVn = (tx: VnTradeTransaction) => {
    resetNoteForm()
    const normalized = normalizeVnTradeTransaction(tx)
    setActiveTab('daily')
    setDailyWorkTab('vn')
    setMobileTradePane(normalized.type === 'buy' ? 'buy_vn' : 'sell_vn')
    setEditingId(normalized.id)
    setEditingCategory(normalized.type === 'buy' ? 'vn_buy' : 'vn_sell')
    setEditCabinAAmount(
      normalized.payCurrency === 'usdt' ? resolveCabinAAmount(normalized) : null,
    )
    setEditCabinBAmount(
      normalized.payCurrency === 'usdt' ? resolveCabinBAmount(normalized) : null,
    )
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    if (normalized.type === 'buy') {
      setVnBuyPayCurrency(normalized.payCurrency)
      setVnBuyVnAmount(formatVnCompactInput(normalized.vnAmount))
      setVnBuyPayAmount(
        normalized.payCurrency === 'twd'
          ? formatTwdCompactInput(vnTradePayAmount(normalized))
          : String(vnTradePayAmount(normalized)),
      )
      setVnBuyRate(formatVnRateCalc(normalized.rate))
      setVnBuyTradeDate(resolveTradeDate(normalized))
      setVnBuyNote(normalized.note ?? '')
    } else {
      setVnSellPayCurrency(normalized.payCurrency)
      setVnSellVnAmount(formatVnCompactInput(normalized.vnAmount))
      setVnSellPayAmount(
        normalized.payCurrency === 'twd'
          ? formatTwdCompactInput(vnTradePayAmount(normalized))
          : String(vnTradePayAmount(normalized)),
      )
      setVnSellRate(formatVnRateCalc(normalized.rate))
      setVnSellTradeDate(resolveTradeDate(normalized))
      setVnSellNote(normalized.note ?? '')
    }
  }

  const handleEditExpense = (tx: ExpenseTransaction) => {
    resetNoteForm()
    setActiveTab('expenses')
    setEditingId(tx.id)
    setEditingCategory('expense')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')
    setExpenseError('')
    const pay = resolveExpensePayCurrency(tx)
    setExpenseFormPayCurrency(pay)
    setExpenseAmount(
      pay === 'usdt'
        ? formatExpenseUsdtInput(expenseUsdtAmount(tx))
        : formatExpenseTwdInput(tx.amountTwd),
    )
    setExpenseNote(tx.note)
    setExpenseDate(dateInputValueFromDate(tx.timestamp))
  }

  const executeDelete = (id: string) => {
    const snapshot = createSnapshot()
    setTransactions((prev) => prev.filter((item) => item.id !== id))

    if (editingId === id) {
      resetBuyForm()
      resetSellForm()
      resetVnBuyForm()
      resetVnSellForm()
      resetExpenseForm()
      setEditingId(null)
      setEditingCategory(null)
    }

    setUndoSnapshot(snapshot)
    setUndoMessage('已刪除一筆紀錄')
  }

  const handleDelete = (id: string) => {
    const tx = transactions.find((item) => item.id === id)
    if (!tx) return

    setConfirmDialog({
      title: '',
      lines: buildDeleteConfirmLines(tx),
      cancelLabel: 'C',
      confirmLabel: 'Del',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        executeDelete(id)
      },
    })
  }

  const cancelEditing = () => {
    if (editingCategory === 'buy') resetBuyForm()
    else if (editingCategory === 'sell') resetSellForm()
    else if (editingCategory === 'vn_buy') resetVnBuyForm()
    else if (editingCategory === 'vn_sell') resetVnSellForm()
    else if (editingCategory === 'expense') resetExpenseForm()
  }

  const isEditingBuy = editingCategory === 'buy'
  const isEditingSell = editingCategory === 'sell'
  const isEditingVnBuy = editingCategory === 'vn_buy'
  const isEditingVnSell = editingCategory === 'vn_sell'
  const isEditingExpense = editingCategory === 'expense'
  const isEditingNote = editingNoteId !== null
  const isEditingAny = editingCategory !== null || isEditingNote

  const editingBannerLabel =
    editingCategory === 'buy'
      ? tradePaneEditingBannerLabel('buy_u')
      : editingCategory === 'sell'
        ? tradePaneEditingBannerLabel('sell_u')
        : editingCategory === 'vn_buy'
          ? tradePaneEditingBannerLabel('buy_vn')
          : editingCategory === 'vn_sell'
            ? tradePaneEditingBannerLabel('sell_vn')
            : editingCategory === 'expense'
              ? '正在編輯 EXP'
              : isEditingNote
                ? '正在編輯筆記'
              : null

  const executeTradeSettle = (businessDate?: string) => {
    const snapshot = createSnapshot()
    const tradeTxs = filterTradeTransactions(transactions)
    if (tradeTxs.length === 0) return

    const settleRates = computeSettleDayInventoryRates(
      openingBalances,
      openingUsdtCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      transactions,
    )
    const inventoryAtSettle = settleRates.usdt

    const assetsAtSettle = computeTotalAssetsAtCostRates(
      balances,
      inventoryAtSettle.twd,
      settleRates.vnTwdRate,
      settleRates.vnUsdtRate,
    )
    const settledDayUsdtProfit = computeSettleDayUsdtProfit(
      inventoryAtSettle.twd,
      transactions,
    )
    const settledDayVnProfit = computeSettleDayVnProfit(
      settleRates.vnTwdRate,
      inventoryAtSettle.twd,
      transactions,
    )
    const settledDayProfit = settledDayUsdtProfit + settledDayVnProfit

    const usdtSellProfits = computeSettleDayUsdtSellProfitById(
      inventoryAtSettle.twd,
      transactions,
    )
    const vnSellProfits = computeSettleDayVnSellProfitById(
      settleRates.vnTwdRate,
      inventoryAtSettle.twd,
      transactions,
    )
    const sellProfitById: Record<string, number> = {}
    for (const [id, info] of usdtSellProfits) {
      sellProfitById[id] = info.profit
    }
    for (const [id, info] of vnSellProfits) {
      sellProfitById[id] = info.profit
    }

    const now = new Date()
    const dateLabel = businessDate
      ? formatSettlementDateTimeForBusinessDate(businessDate, now)
      : formatSettlementDateTime(now)

    const settlement: DailySettlement = {
      id: crypto.randomUUID(),
      settledAt: now,
      dateLabel,
      twdBalance: balances.twd,
      usdtBalance: balances.usdt,
      vnBalance: balances.vn,
      usdtInventoryAvgTwd: inventoryAtSettle.twd,
      usdtInventoryAvgVn: inventoryAtSettle.vn,
      dayBuyAvgTwd: settleRates.dayBuyAvgTwd,
      dayBuyAvgVn: settleRates.dayBuyAvgVn,
      ...settlementFromTotalAssets(assetsAtSettle),
      transactionCount: tradeTxs.length,
      dayUsdtProfit: settledDayUsdtProfit,
      dayVnProfit: settledDayVnProfit,
      dayTotalProfit: settledDayProfit,
      trades: tradeTxs.map((tx) => ({
        ...tx,
        timestamp: new Date(tx.timestamp),
      })),
      sellProfitById:
        Object.keys(sellProfitById).length > 0 ? sellProfitById : undefined,
    }

    setSettlements((prev) => [settlement, ...prev])
    setOpeningUsdtCost(inventoryAtSettle)
    setOpeningVnTwdRate(settleRates.vnTwdRate)
    setOpeningVnUsdtRate(settleRates.vnUsdtRate)
    setOpeningBalances({ ...balances })
    setOpeningUsdtCabinA(usdtCabinBalances.a)
    setOpeningUsdtCabinB(usdtCabinBalances.b)

    // 保留進行中開銷（由 EXP 頁 RECON 處理）
    setTransactions((prev) => prev.filter(isExpenseTransaction))
    resetBuyForm()
    resetSellForm()
    resetVnBuyForm()
    resetVnSellForm()
    resetExpenseForm()
    setEditingId(null)
    setEditingCategory(null)
    setActiveTab('settlements')

    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成 ${dateLabel} 交易結算`)
  }

  const handleTradeSettle = () => {
    if (tradeTransactions.length === 0) {
      setConfirmDialog({
        title: '',
        lines: ['無交易'],
        confirmLabel: 'OK',
        variant: 'primary',
        alertOnly: true,
        onConfirm: () => setConfirmDialog(null),
      })
      return
    }

    setConfirmDialog({
      title: '',
      lines: [],
      tradeSettleSummary: buildTradeSettleConfirmSummary(
        transactions,
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
      cancelLabel: 'C',
      confirmLabel: 'OK',
      variant: 'primary',
      onConfirm: (businessDate) => {
        setConfirmDialog(null)
        executeTradeSettle(businessDate)
      },
    })
  }

  const handleUndo = () => {
    if (!undoSnapshot) return
    restoreSnapshot(undoSnapshot)
    setUndoSnapshot(null)
    setUndoMessage('')
  }

  const dismissUndo = () => {
    setUndoSnapshot(null)
    setUndoMessage('')
  }

  const executeMonthlyClose = () => {
    const expenseBatches = expenseSettlementsFromCumulative(cumulativeExpenses)
    if (settlements.length === 0 && expenseBatches.length === 0) return

    const snapshot = createSnapshot()
    const latest = settlements[0]
    const closingBalances = latest
      ? {
          twd: latest.twdBalance,
          usdt: latest.usdtBalance,
          vn: latest.vnBalance,
        }
      : { ...balances }
    const closingUsdtCost = latest
      ? {
          twd: latest.usdtInventoryAvgTwd,
          vn: latest.usdtInventoryAvgVn,
        }
      : { ...openingUsdtCost }
    const closingVnTwdRate = latest?.dayVnTwdRate ?? openingVnTwdRate
    const closingVnUsdtRate = latest?.dayVnUsdtRate ?? openingVnUsdtRate
    const closingBookAssets = latest?.totalAssetsTwd ?? totalAssets.total
    const { end } = computeArchivedDateRange(settlements, expenseBatches)
    const periodLabel = suggestMonthlyPeriodLabel(end ?? new Date())

    const monthlyClose = buildMonthlyClose(
      periodLabel,
      settlements,
      expenseBatches,
      closingBalances,
      closingUsdtCost,
      closingVnTwdRate,
      closingVnUsdtRate,
      closingBookAssets,
    )

    setMonthlyCloses((prev) => [monthlyClose, ...prev])
    setSettlements([])
    setCumulativeExpenses([])
    setSelectedMonthlyCloseId(monthlyClose.id)
    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成 ${periodLabel} 月結`)
    setActiveTab('month')
  }

  const handleOpenMonthlyClose = () => {
    const expenseBatches = expenseSettlementsFromCumulative(cumulativeExpenses)
    const pendingTradeCount = tradeTransactions.length

    if (settlements.length === 0 && expenseBatches.length === 0) {
      setConfirmDialog({
        title: '',
        lines: ['無可月結內容'],
        confirmLabel: 'OK',
        variant: 'primary',
        alertOnly: true,
        onConfirm: () => setConfirmDialog(null),
      })
      return
    }

    const latest = settlements[0]
    const closingBalances = latest
      ? {
          twd: latest.twdBalance,
          usdt: latest.usdtBalance,
          vn: latest.vnBalance,
        }
      : { ...balances }
    const closingBookAssets = latest?.totalAssetsTwd ?? totalAssets.total
    const preview = buildMonthlyClosePreview(
      settlements,
      expenseBatches,
      [],
      pendingTradeCount,
      closingBalances,
      closingBookAssets,
    )
    const periodLabel = preview.periodLabel

    setConfirmDialog({
      title: '',
      lines: [],
      monthlyCloseSummary: {
        periodLabel,
        tradeCount: preview.tradeCount,
        expenseItemCount: preview.expenseItemCount,
        grossProfit: preview.grossProfit,
        expenseTotal: preview.expenseTotal,
        netProfit: preview.netProfit,
        dateRangeLabel: preview.dateRangeLabel,
      },
      cancelLabel: 'C',
      confirmLabel: 'OK',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeMonthlyClose()
      },
    })
  }

  const executeResetAll = () => {
    if (!canResetAllLocally()) return
    setTransactions([])
    setSettlements([])
    setExpenseSettlements([])
    setCumulativeExpenses([])
    setMonthlyCloses([])
    setSelectedMonthlyCloseId(null)
    setOpeningBalances({ ...INITIAL_BALANCES })
    setOpeningUsdtCost({ ...EMPTY_USDT_COST })
    setOpeningUsdtCabinA(0)
    setOpeningUsdtCabinB(0)
    setTwdCabinNotes({ ...EMPTY_TWD_CABIN_NOTES })
    setOpeningVnTwdRate(null)
    setOpeningVnUsdtRate(null)
    resetBuyForm()
    resetSellForm()
    resetVnBuyForm()
    resetVnSellForm()
    resetExpenseForm()
    setEditingId(null)
    setEditingCategory(null)
    setUndoSnapshot(null)
    setUndoMessage('')
    setActiveTab('daily')
    setDailyWorkTab('usdt')
  }

  const handleResetAll = () => {
    if (!canResetAllLocally()) return
    setConfirmDialog({
      title: '清空',
      lines: [],
      confirmLabel: 'CLR',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        executeResetAll()
      },
    })
  }

  const handleOpenOpeningBalance = () => {
    setOpeningBalanceForm(
      openingBalanceToForm(
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
    )
    setOpeningBalanceError('')
    setOpeningBalanceModalOpen(true)
  }

  const parseOpeningBalanceForm = (): {
    balances: Balances
    usdtCost: UsdtInventoryCost
    vnTwdRate: number | null
    vnUsdtRate: number | null
  } | null => {
    const twdAdjust = parseTwdAdjustInput(openingBalanceForm.twdAdjust)
    if (twdAdjust === 'invalid') {
      setOpeningBalanceError('T 調整請輸入有效數字，例如 +20（萬）')
      return null
    }
    const usdtAdjust = parseUsdtAdjustInput(openingBalanceForm.usdtAdjust)
    if (usdtAdjust === 'invalid') {
      setOpeningBalanceError('USDT 調整請輸入有效數字，例如 +1000')
      return null
    }
    const vnAdjust = parseVnAdjustInput(openingBalanceForm.vnAdjust)
    if (vnAdjust === 'invalid') {
      setOpeningBalanceError('VN 調整請輸入有效數字，例如 +1.2（億）')
      return null
    }

    const openingTwdBase = coerceDisplayZeroBalance(openingBalances.twd, 'twd')
    const liveTwdBase = coerceDisplayZeroBalance(balances.twd, 'twd')
    // 顯示為 0.00 的微小負數視為歸零（扣盡），避免萬位四捨五入擋住儲存
    let effectiveTwdAdjust = twdAdjust
    let nextLiveTwd = liveTwdBase + twdAdjust
    if (
      twdAdjust !== 0 &&
      nextLiveTwd < 0 &&
      coerceDisplayZeroBalance(nextLiveTwd, 'twd') === 0
    ) {
      effectiveTwdAdjust = -liveTwdBase
      nextLiveTwd = 0
    }

    const twd = openingTwdBase + effectiveTwdAdjust
    const usdt = coerceDisplayZeroBalance(openingBalances.usdt, 'usdt') + usdtAdjust
    const vn = coerceDisplayZeroBalance(openingBalances.vn, 'vn') + vnAdjust

    // 以「目前水位」判斷夠不夠扣（賣出換來的現金也可歸零）
    const nextLiveUsdt = coerceDisplayZeroBalance(balances.usdt, 'usdt') + usdtAdjust
    const nextLiveVn = coerceDisplayZeroBalance(balances.vn, 'vn') + vnAdjust
    const parts: string[] = []
    if (twdAdjust !== 0 && coerceDisplayZeroBalance(nextLiveTwd, 'twd') < 0) {
      parts.push(`T 最多可扣至 0（目前 ${formatTwdCompactInput(balances.twd)}）`)
    }
    if (usdtAdjust !== 0 && nextLiveUsdt < 0) {
      parts.push(`P 最多可扣 ${formatNumber(coerceDisplayZeroBalance(balances.usdt, 'usdt'))}`)
    }
    if (vnAdjust !== 0 && nextLiveVn < 0) {
      parts.push(`VN 最多可扣至 0（目前 ${formatVnCompactInput(balances.vn)}）`)
    }
    if (parts.length > 0) {
      setOpeningBalanceError(parts.join('；'))
      return null
    }

    const parseOptionalRate = (value: string): number | null | 'invalid' => {
      const trimmed = value.trim()
      if (!trimmed) return null
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed) || parsed <= 0) return 'invalid'
      return parsed
    }

    const usdtCostTwd = parseOptionalRate(openingBalanceForm.usdtCostTwd)
    if (usdtCostTwd === 'invalid') {
      setOpeningBalanceError('USDT 料金 (TWD) 請輸入有效正數或留空')
      return null
    }
    const usdtCostVn = parseOptionalRate(openingBalanceForm.usdtCostVn)
    if (usdtCostVn === 'invalid') {
      setOpeningBalanceError('USDT 料金 (VN) 請輸入有效正數或留空')
      return null
    }
    const vnTwdRate = parseOptionalRate(openingBalanceForm.vnTwdRate)
    if (vnTwdRate === 'invalid') {
      setOpeningBalanceError('VN 池料金 (VN/TWD) 請輸入有效正數或留空')
      return null
    }
    const vnUsdtRate = parseOptionalRate(openingBalanceForm.vnUsdtRate)
    if (vnUsdtRate === 'invalid') {
      setOpeningBalanceError('VN 池料金 (VN/U) 請輸入有效正數或留空')
      return null
    }

    if (usdt > 0 && usdtCostTwd === null) {
      setOpeningBalanceError('有 USDT 庫存時請填寫 USDT 料金 (TWD)')
      return null
    }

    const inventoryChanged =
      twdAdjust !== 0 || usdtAdjust !== 0 || vnAdjust !== 0
    const ratesChanged =
      usdtCostTwd !== openingUsdtCost.twd ||
      usdtCostVn !== openingUsdtCost.vn ||
      vnTwdRate !== openingVnTwdRate ||
      vnUsdtRate !== openingVnUsdtRate
    if (!inventoryChanged && !ratesChanged) {
      setOpeningBalanceError('請輸入庫存增減，或修改料金')
      return null
    }

    setOpeningBalanceError('')
    return {
      balances: { twd, usdt, vn },
      usdtCost: { twd: usdtCostTwd, vn: usdtCostVn },
      vnTwdRate,
      vnUsdtRate,
    }
  }

  const executeApplyOpeningBalance = (cabin: UsdtCabin | null) => {
    const parsed = parseOpeningBalanceForm()
    if (!parsed) return

    const usdtAdjust = parseUsdtAdjustInput(openingBalanceForm.usdtAdjust)
    if (usdtAdjust === 'invalid') return

    if (usdtAdjust !== 0) {
      if (!cabin) {
        setOpeningBalanceError('請選擇 P 增減的艙位')
        setOpeningBalanceModalOpen(true)
        return
      }
      const nextLiveUsdt =
        coerceDisplayZeroBalance(balances.usdt, 'usdt') + usdtAdjust
      const cabinResult = applyOpeningUsdtDeltaToCabin(
        openingUsdtCabinA,
        openingUsdtCabinB,
        usdtCabinBalances,
        usdtAdjust,
        cabin,
        nextLiveUsdt,
      )
      if (!cabinResult.ok) {
        setOpeningBalanceError(cabinResult.error)
        setOpeningBalanceModalOpen(true)
        return
      }
      setOpeningUsdtCabinA(cabinResult.a)
      setOpeningUsdtCabinB(cabinResult.b)
    }

    setOpeningBalances(parsed.balances)
    setOpeningUsdtCost(parsed.usdtCost)
    setOpeningVnTwdRate(parsed.vnTwdRate)
    setOpeningVnUsdtRate(parsed.vnUsdtRate)
    setOpeningBalanceModalOpen(false)
    setOpeningBalanceError('')
    setOpeningUsdtCabinPickAdjust(null)
    handleSelectTab('daily')
  }

  const promptOpeningBalanceConfirm = (cabin: UsdtCabin | null) => {
    const parsed = parseOpeningBalanceForm()
    if (!parsed) return

    const changes: string[] = []
    if (parsed.balances.twd !== openingBalances.twd) {
      changes.push(
        `T ${formatTwdCompactInput(openingBalances.twd)} → ${formatTwdCompactInput(parsed.balances.twd)}`,
      )
    }
    if (parsed.balances.usdt !== openingBalances.usdt) {
      const cabinLabel = cabin ? `（${cabin}）` : ''
      changes.push(
        `P ${formatNumber(openingBalances.usdt)} → ${formatNumber(parsed.balances.usdt)}${cabinLabel}`,
      )
    }
    if (parsed.balances.vn !== openingBalances.vn) {
      changes.push(
        `VN ${formatVnCompactInput(openingBalances.vn)} → ${formatVnCompactInput(parsed.balances.vn)}`,
      )
    }
    const addRateChange = (label: string, before: number | null, after: number | null) => {
      if (before !== after) changes.push(`${label} ${before ?? '—'} → ${after ?? '—'}`)
    }
    addRateChange('P@T', openingUsdtCost.twd, parsed.usdtCost.twd)
    addRateChange('P@VN', openingUsdtCost.vn, parsed.usdtCost.vn)
    addRateChange('VN@T', openingVnTwdRate, parsed.vnTwdRate)
    addRateChange('VN@P', openingVnUsdtRate, parsed.vnUsdtRate)

    if (changes.length === 0) {
      setOpeningBalanceModalOpen(false)
      setOpeningBalanceError('')
      setOpeningUsdtCabinPickAdjust(null)
      return
    }

    setOpeningUsdtCabinPickAdjust(null)
    setOpeningBalanceModalOpen(false)
    setConfirmDialog({
      title: '',
      lines: changes,
      cancelLabel: 'C',
      confirmLabel: 'OK',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeApplyOpeningBalance(cabin)
      },
    })
  }

  const handleRebalanceCabins = (nextCabins: { a: number; b: number; c: number }) => {
    const current = usdtCabinBalances
    // 直接套用互轉後的 A/B 差值，避免用 balances.usdt 重算時把 B 的增量 clamp 進 C
    const nextOpeningA = openingUsdtCabinA + (nextCabins.a - current.a)
    const nextOpeningB = openingUsdtCabinB + (nextCabins.b - current.b)
    const snapshot = {
      a: Math.max(0, nextCabins.a),
      b: Math.max(0, nextCabins.b),
      c: Math.max(0, nextCabins.c),
    }
    setOpeningUsdtCabinA(nextOpeningA)
    setOpeningUsdtCabinB(nextOpeningB)
    setCabinRebalanceModalOpen(false)
    handleSelectTab('daily')
    // 戶轉分倉後立刻寫入 A/B/C 絕對數量，避免 debounce 內重整遺失
    void (async () => {
      const ok = await savePersistedAppStateAsync({
        activeTab: 'daily',
        dailyWorkTab,
        openingBalances,
        openingUsdtCost,
        openingUsdtCabinA: nextOpeningA,
        openingUsdtCabinB: nextOpeningB,
        usdtCabinSnapshot: snapshot,
        twdCabinNotes,
        openingVnTwdRate,
        openingVnUsdtRate,
        transactions,
        settlements,
        expenseSettlements,
        cumulativeExpenses,
        monthlyCloses,
      })
      if (!ok) {
        setConfirmDialog({
          title: '分倉儲存失敗',
          lines: ['無法寫入後端，重整後可能還原。請確認 exchange-api 已更新並重新套用分倉。'],
          confirmLabel: '知道了',
          variant: 'primary',
          alertOnly: true,
          onConfirm: () => setConfirmDialog(null),
        })
      }
    })()
  }

  const handlePullProdState = () => {
    if (!canPullProdStateToLocal() || pullProdBusy) return
    setConfirmDialog({
      title: 'PULL',
      lines: [],
      confirmLabel: 'PULL',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        setPullProdBusy(true)
        void pullProdStateToLocalAsync().then((result) => {
          setPullProdBusy(false)
          if (!result.ok) {
            setConfirmDialog({
              title: '拉取失敗',
              lines: [result.error],
              confirmLabel: '知道了',
              variant: 'primary',
              alertOnly: true,
              onConfirm: () => setConfirmDialog(null),
            })
            return
          }
          window.location.reload()
        })
      },
    })
  }

  const handleSaveOpeningBalance = () => {
    const parsed = parseOpeningBalanceForm()
    if (!parsed) return

    const usdtAdjust = parseUsdtAdjustInput(openingBalanceForm.usdtAdjust)
    if (usdtAdjust === 'invalid') return

    if (usdtAdjust !== 0) {
      setOpeningUsdtCabinPickAdjust(usdtAdjust)
      return
    }

    promptOpeningBalanceConfirm(null)
  }

  const handleTwdCabinNoteChange = (cabin: TwdCabinNoteFieldKey, value: string) => {
    setTwdCabinNotes((prev) => ({ ...prev, [cabin]: value }))
  }

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 text-slate-600">
        載入中…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-slate-50 px-6 text-center">
        <p className="font-medium text-slate-800">無法載入資料</p>
        <p className="text-sm text-slate-600">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="h-dvh overflow-hidden bg-slate-50 text-slate-900">
      <ConfirmModal dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} />
      <CabinAllocModal
        key={
          cabinAllocPending
            ? `${cabinAllocPending.kind}-${cabinAllocPending.direction}-${cabinAllocPending.initialCabinA}-${cabinAllocPending.initialCabinB}-${
                cabinAllocPending.kind === 'usdt' ? cabinAllocPending.usdt : cabinAllocPending.pay
              }`
            : 'cabin-alloc-closed'
        }
        open={cabinAllocPending !== null}
        totalUsdt={
          cabinAllocPending?.kind === 'usdt'
            ? cabinAllocPending.usdt
            : cabinAllocPending?.kind === 'vn'
              ? cabinAllocPending.pay
              : 0
        }
        direction={cabinAllocPending?.direction ?? 'in'}
        initialCabinA={cabinAllocPending?.initialCabinA ?? 0}
        initialCabinB={cabinAllocPending?.initialCabinB ?? 0}
        cabinBalances={usdtCabinBalances}
        error={cabinAllocError}
        onCancel={() => {
          setCabinAllocPending(null)
          setCabinAllocError('')
        }}
        onDismissError={() => setCabinAllocError('')}
        onConfirm={handleCabinAllocConfirm}
      />
      <OpeningBalanceModal
        open={openingBalanceModalOpen}
        liveBalances={balances}
        form={openingBalanceForm}
        error={openingBalanceError}
        onFieldChange={(field, value) => {
          setOpeningBalanceError('')
          setOpeningBalanceForm((prev) => ({ ...prev, [field]: value }))
        }}
        onCancel={() => {
          setOpeningBalanceModalOpen(false)
          setOpeningBalanceError('')
          setOpeningUsdtCabinPickAdjust(null)
        }}
        onConfirm={handleSaveOpeningBalance}
      />
      <OpeningUsdtCabinPickModal
        open={openingUsdtCabinPickAdjust !== null}
        adjust={openingUsdtCabinPickAdjust ?? 0}
        cabins={usdtCabinBalances}
        onCancel={() => setOpeningUsdtCabinPickAdjust(null)}
        onConfirm={(cabin) => promptOpeningBalanceConfirm(cabin)}
      />
      <CabinRebalanceModal
        open={cabinRebalanceModalOpen}
        cabins={usdtCabinBalances}
        onCancel={() => setCabinRebalanceModalOpen(false)}
        onConfirm={handleRebalanceCabins}
      />
      <div className="flex h-full w-full">
        <aside className="hidden h-full w-[6rem] shrink-0 border-r border-slate-200 bg-white px-1 py-3 lg:flex lg:flex-col">
          <AppNav
            activeTab={activeTab}
            settlementsCount={settlements.length}
            onSelect={handleSelectTab}
            layout="sidebar"
          />
        </aside>

        <div
          className={`fixed inset-0 z-40 lg:hidden ${mobileNavOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          aria-hidden={!mobileNavOpen}
        >
          <button
            type="button"
            aria-label="關閉選單"
            tabIndex={mobileNavOpen ? 0 : -1}
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-in-out ${
              mobileNavOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={closeMobileNav}
          />
          <aside
            className={`absolute inset-y-0 left-0 flex w-56 flex-col bg-gradient-to-b from-slate-100 via-slate-50 to-white shadow-2xl transition-transform duration-300 ease-in-out ${
              mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-end border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-sm">
              <button
                type="button"
                aria-label="關閉選單"
                tabIndex={mobileNavOpen ? 0 : -1}
                onClick={closeMobileNav}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
              >
                <MobileNavCloseIcon />
              </button>
            </div>
            <AppNav
              activeTab={activeTab}
              settlementsCount={settlements.length}
              onSelect={handleSelectTab}
              onNavigate={closeMobileNav}
              layout="drawer"
            />
          </aside>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1 lg:hidden">
            <button
              type="button"
              aria-label={mobileNavOpen ? '關閉選單' : '開啟選單'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
              className="rounded-md p-1 text-slate-700 transition hover:bg-slate-100"
            >
              {mobileNavOpen ? <MobileNavCloseIcon /> : <MobileNavMenuIcon />}
            </button>
            {activeTab !== 'daily' && activeTab !== 'notes' && (
              <p className="min-w-0 flex-1 text-xs font-medium text-slate-800">
                {MOBILE_TAB_LABEL[activeTab]}
              </p>
            )}
          </header>

        <main
          className={`flex min-h-0 flex-1 flex-col px-2 py-1 pb-4 sm:px-3 lg:overflow-y-auto lg:pb-1 ${
            mobileNavOpen ? 'overflow-hidden touch-none' : 'overflow-y-auto overscroll-y-contain'
          }`}
        >
          {undoSnapshot && undoMessage && (
            <UndoBanner message={undoMessage} onUndo={handleUndo} onDismiss={dismissUndo} />
          )}

          {activeTab === 'daily' ? (
            <div className="mx-auto flex w-full max-w-6xl flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={cancelEditing} />
              )}
              <DailyBalanceStrip
                balances={balances}
                inventoryCost={displayInventoryCost}
                usdtCabinBalances={usdtCabinBalances}
                twdCabinNotes={twdCabinNotes}
                onTwdCabinNoteChange={handleTwdCabinNoteChange}
                totalAssets={totalAssets}
                vnTwdRate={openingVnTwdRate}
                vnUsdtRate={openingVnUsdtRate}
              />
              <DailyMobileTradeTabBar
                value={mobileTradePane}
                onChange={handleMobileTradePaneChange}
              />

              <section className="grid shrink-0 gap-1 sm:gap-2 lg:grid-cols-2 lg:items-start">
                <div
                  className={dailyTradePaneClass(mobileTradePane, dailyWorkTab, 'buy_u', 'usdt')}
                >
                  <div className={formCardClass('emerald', isEditingBuy)}>
                    <TradeForm
                      type="buy"
                      title={TRADE_PANE_CODE.buy_u}
                      editTitle={tradePaneEditLabel('buy_u')}
                      usdt={buyUsdtAmount}
                      fiat={buyFiatAmount}
                      rate={buyRate}
                      tradeDate={buyTradeDate}
                      note={buyNote}
                      error={buyError}
                      isEditing={isEditingBuy}
                      disabled={isEditingAny && !isEditingBuy}
                      onFieldChange={updateBuyForm}
                      onTradeDateChange={setBuyTradeDate}
                      onNoteChange={setBuyNote}
                      onSubmit={(e) => handleSubmit('buy', e)}
                      onCancel={resetBuyForm}
                      onClear={clearBuyForm}
                      accentClass="text-emerald-700"
                      buttonClass="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600/30"
                      focusClass="focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      balances={balances}
                      openingBalances={openingBalances}
                      openingUsdtCost={openingUsdtCost}
                      transactions={transactions}
                    />
                  </div>
                  <div className={recordCardClass('emerald')}>
                    <TransactionTable
                      transactions={buyTransactions}
                      editingId={editingId}
                      highlightedId={highlightedTransactionId}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      accent="buy"
                      sideLabel="買入"
                      showDayAverage
                      visibleRows={tableVisibleRows}
                      bodyScrollRef={buyBodyScrollRef}
                      onBodyScroll={(scrollTop) => syncTransactionBodyScroll('buy', scrollTop)}
                    />
                  </div>
                </div>

                <div
                  className={dailyTradePaneClass(mobileTradePane, dailyWorkTab, 'sell_u', 'usdt')}
                >
                  <div className={formCardClass('rose', isEditingSell)}>
                    <TradeForm
                      type="sell"
                      title={TRADE_PANE_CODE.sell_u}
                      editTitle={tradePaneEditLabel('sell_u')}
                      usdt={sellUsdtAmount}
                      fiat={sellFiatAmount}
                      rate={sellRate}
                      tradeDate={sellTradeDate}
                      note={sellNote}
                      error={sellError}
                      isEditing={isEditingSell}
                      disabled={isEditingAny && !isEditingSell}
                      onFieldChange={updateSellForm}
                      onTradeDateChange={setSellTradeDate}
                      onNoteChange={setSellNote}
                      onSubmit={(e) => handleSubmit('sell', e)}
                      onCancel={resetSellForm}
                      onClear={clearSellForm}
                      accentClass="text-rose-700"
                      buttonClass="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600/30"
                      focusClass="focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                      balances={balances}
                      openingBalances={openingBalances}
                      openingUsdtCost={openingUsdtCost}
                      transactions={transactions}
                      excludeTransactionId={isEditingSell ? editingId : null}
                    />
                  </div>
                  <div className={recordCardClass('rose')}>
                    <TransactionTable
                      transactions={sellTransactions}
                      editingId={editingId}
                      highlightedId={highlightedTransactionId}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      accent="sell"
                      sideLabel="賣出"
                      showDayAverage
                      visibleRows={tableVisibleRows}
                      bodyScrollRef={sellBodyScrollRef}
                      onBodyScroll={(scrollTop) => syncTransactionBodyScroll('sell', scrollTop)}
                    />
                  </div>
                </div>

                <div
                  className={dailyTradePaneClass(mobileTradePane, dailyWorkTab, 'buy_vn', 'vn')}
                >
                  <div className={formCardClass('violet', isEditingVnBuy)}>
                    <VnTradeForm
                      type="buy"
                      title={TRADE_PANE_CODE.buy_vn}
                      editTitle={tradePaneEditLabel('buy_vn')}
                      payCurrency={vnBuyPayCurrency}
                      onPayCurrencyChange={setVnBuyPayCurrency}
                      vn={vnBuyVnAmount}
                      pay={vnBuyPayAmount}
                      rate={vnBuyRate}
                      tradeDate={vnBuyTradeDate}
                      note={vnBuyNote}
                      error={vnBuyError}
                      isEditing={isEditingVnBuy}
                      disabled={isEditingAny && !isEditingVnBuy}
                      onFieldChange={updateVnBuyForm}
                      onTradeDateChange={setVnBuyTradeDate}
                      onNoteChange={setVnBuyNote}
                      onSubmit={(e) => handleVnSubmit('buy', e)}
                      onCancel={resetVnBuyForm}
                      onClear={clearVnBuyForm}
                      accentClass="text-violet-700"
                      buttonClass="bg-violet-600 hover:bg-violet-700 focus:ring-violet-600/30"
                      focusClass="focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                      balances={balances}
                      usdtInventoryCostTwd={openingUsdtCost.twd}
                      openingBalances={openingBalances}
                      openingVnTwdRate={openingVnTwdRate}
                      openingVnUsdtRate={openingVnUsdtRate}
                      openingUsdtCost={openingUsdtCost}
                      transactions={transactions}
                    />
                  </div>
                  <div className={recordCardClass('violet')}>
                    <VnTradeTable
                      transactions={vnBuyTransactions}
                      editingId={editingId}
                      highlightedId={highlightedTransactionId}
                      onEdit={handleEditVn}
                      onDelete={handleDelete}
                      accent="buy"
                      sideLabel="買入"
                      showDayAverage
                      visibleRows={tableVisibleRows}
                      bodyScrollRef={vnBuyBodyScrollRef}
                      onBodyScroll={(scrollTop) => syncVnBodyScroll('buy', scrollTop)}
                    />
                  </div>
                </div>

                <div
                  className={dailyTradePaneClass(mobileTradePane, dailyWorkTab, 'sell_vn', 'vn')}
                >
                  <div className={formCardClass('rose', isEditingVnSell)}>
                    <VnTradeForm
                      type="sell"
                      title={TRADE_PANE_CODE.sell_vn}
                      editTitle={tradePaneEditLabel('sell_vn')}
                      payCurrency={vnSellPayCurrency}
                      onPayCurrencyChange={setVnSellPayCurrency}
                      vn={vnSellVnAmount}
                      pay={vnSellPayAmount}
                      rate={vnSellRate}
                      tradeDate={vnSellTradeDate}
                      note={vnSellNote}
                      error={vnSellError}
                      isEditing={isEditingVnSell}
                      disabled={isEditingAny && !isEditingVnSell}
                      onFieldChange={updateVnSellForm}
                      onTradeDateChange={setVnSellTradeDate}
                      onNoteChange={setVnSellNote}
                      onSubmit={(e) => handleVnSubmit('sell', e)}
                      onCancel={resetVnSellForm}
                      onClear={clearVnSellForm}
                      accentClass="text-amber-700"
                      buttonClass="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30"
                      focusClass="focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      balances={balances}
                      usdtInventoryCostTwd={openingUsdtCost.twd}
                      openingBalances={openingBalances}
                      openingVnTwdRate={openingVnTwdRate}
                      openingVnUsdtRate={openingVnUsdtRate}
                      openingUsdtCost={openingUsdtCost}
                      transactions={transactions}
                      excludeTransactionId={isEditingVnSell ? editingId : null}
                    />
                  </div>
                  <div className={recordCardClass('rose')}>
                    <VnTradeTable
                      transactions={vnSellTransactions}
                      editingId={editingId}
                      highlightedId={highlightedTransactionId}
                      onEdit={handleEditVn}
                      onDelete={handleDelete}
                      accent="sell"
                      sideLabel="賣出"
                      showSellAverage
                      openingBalances={openingBalances}
                      openingUsdtCost={openingUsdtCost}
                      allTransactions={transactions}
                      visibleRows={tableVisibleRows}
                      bodyScrollRef={vnSellBodyScrollRef}
                      onBodyScroll={(scrollTop) => syncVnBodyScroll('sell', scrollTop)}
                    />
                  </div>
                </div>
              </section>
              <DailyTradeSettleBar
                tradeCount={tradeTransactions.length}
                onSettle={handleTradeSettle}
              />
            </div>
          ) : activeTab === 'expenses' ? (
            <div className="flex flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={cancelEditing} />
              )}
              <section className="mx-auto w-full max-w-sm min-w-0 shrink-0">
                <div
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                    isEditingExpense
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : 'border-slate-200/90'
                  }`}
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <ExpenseForm
                      amount={expenseAmount}
                      note={expenseNote}
                      expenseDate={expenseDate}
                      payCurrency={expenseFormPayCurrency}
                      onPayCurrencyChange={setExpenseFormPayCurrency}
                      error={expenseError}
                      isEditing={isEditingExpense}
                      disabled={isEditingAny && !isEditingExpense}
                      onAmountChange={setExpenseAmount}
                      onNoteChange={setExpenseNote}
                      onExpenseDateChange={setExpenseDate}
                      onSubmit={handleExpenseSubmit}
                      onCancel={resetExpenseForm}
                    />
                  </div>
                  <div className="px-2.5 py-1">
                    <ExpenseTable
                      transactions={expenseTransactions}
                      editingId={editingId}
                      onEdit={handleEditExpense}
                      onDelete={handleDelete}
                      visibleRows={tableVisibleRows}
                    />
                  </div>
                  <ExpensePageSummary
                    transactions={expenseTransactions}
                    onReconcile={handleExpenseReconcile}
                  />
                </div>
              </section>
            </div>
          ) : activeTab === 'cumulative_expenses' ? (
            <CumulativeExpensesPanel
              entries={cumulativeExpenses}
              onAdd={handleAddCumulativeExpense}
              onUpdate={handleUpdateCumulativeExpense}
              onDelete={handleDeleteCumulativeExpense}
            />
          ) : activeTab === 'notes' ? (
            <div className="flex flex-col">
              {editingBannerLabel && (
                <EditingBanner label={editingBannerLabel} onCancel={resetNoteForm} />
              )}
              <NotebookPanel
                entries={notes}
                draft={noteDraft}
                editingId={editingNoteId}
                error={noteError}
                disabled={isEditingAny && !isEditingNote}
                onDraftChange={setNoteDraft}
                onSubmit={handleNoteSubmit}
                onCancelEdit={resetNoteForm}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
              />
            </div>
          ) : activeTab === 'settlements' ? (
            <>
              <SettlementsPanel settlements={settlements} />
            </>
          ) : activeTab === 'month' ? (
            <MonthlyArchivePanel
              closes={monthlyCloses}
              selectedId={selectedMonthlyCloseId}
              onSelect={setSelectedMonthlyCloseId}
            />
          ) : (
            <>
              <MonthlyClosesList
                onOpeningBalance={handleOpenOpeningBalance}
                onCabinRebalance={() => setCabinRebalanceModalOpen(true)}
                onMonthlyClose={handleOpenMonthlyClose}
                onPullProdState={
                  canPullProdStateToLocal() ? handlePullProdState : undefined
                }
                pullProdBusy={pullProdBusy}
                onResetAll={canResetAllLocally() ? handleResetAll : undefined}
              />
            </>
          )}
        </main>
        </div>
      </div>
    </div>
  )
}

export default App
