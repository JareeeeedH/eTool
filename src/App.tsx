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
  UsdtInventoryCost,
  UsdtTransaction,
  VnPayCurrency,
  VnTradeTransaction,
} from './types'
import { EMPTY_USDT_COST, INITIAL_BALANCES, TRADE_PANE_CODE, tradePaneEditLabel, tradePaneEditingBannerLabel } from './constants'
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
  adjustOpeningUsdtCabins,
  buildDeleteConfirmLines,
  buildTradeSettleConfirmSummary,
  calculateBuyDayAverageRate,
  calculateVnBuyDayAverageRate,
  computeInventoryCost,
  computeSellProfitById,
  computeTotalAssetsTwd,
  computeUsdtCabinBalances,
  computeUsdtDayTotalProfit,
  computeVnDayTotalProfit,
  computeVnTradeAnalytics,
  filterExpenseTransactions,
  filterTradeTransactions,
  getLastTradeSettlementAt,
  filterUsdtTransactions,
  filterVnTradeTransactions,
  getBusinessDayLabel,
  isExpenseTransaction,
  isUsdtTransaction,
  isVnTradeTransaction,
  migrateUsdtCabinAttribution,
  normalizeCabinAlloc,
  normalizeLoadedSettlement,
  normalizeLoadedTransactions,
  normalizeMonthlyClose,
  normalizeUsdtCabinSnapshot,
  normalizeVnTradeTransaction,
  openingBalanceToForm,
  alignOpeningUsdtCabinsToSnapshot,
  openingUsdtCabinsAfterRebalance,
  recalculateBalances,
  resolveCabinAAmount,
  resolveCabinBAmount,
  settlementFromTotalAssets,
  validateTransactions,
  resolveUsdtSpendValidationError,
  vnTradePayAmount,
} from './domain'
import {
  dateInputValueFromDate,
  defaultTradeDateInputValue,
  formatExpenseTwdInput,
  formatNumber,
  formatSettlementDateTime,
  formatTwd,
  formatTwdCompactInput,
  formatVnCompactInput,
  isValidDateInputValue,
  coerceDisplayZeroBalance,
  parseExpenseTwdInput,
  parseTwdAdjustInput,
  parseUsdtAdjustInput,
  parseVnAdjustInput,
  timestampForNewTrade,
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
  DailyWorkTabBar,
  EditingBanner,
  ExpenseForm,
  ExpensePageSummary,
  ExpenseTable,
  MobileNavCloseIcon,
  MobileNavMenuIcon,
  MonthlyClosesList,
  NotebookPanel,
  OpeningBalanceModal,
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
      initialCabinA: number
      initialCabinB: number
      direction: 'in' | 'out'
    }
  | {
      kind: 'vn'
      type: TransactionType
      payCurrency: 'usdt'
      vn: number
      pay: number
      rate: number
      isEditing: boolean
      tradeDate: string
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
  const [buyError, setBuyError] = useState('')

  const [sellUsdtAmount, setSellUsdtAmount] = useState('')
  const [sellFiatAmount, setSellFiatAmount] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [sellTradeDate, setSellTradeDate] = useState(defaultTradeDateInputValue)
  const [sellError, setSellError] = useState('')

  const [vnBuyVnAmount, setVnBuyVnAmount] = useState('')
  const [vnBuyPayAmount, setVnBuyPayAmount] = useState('')
  const [vnBuyPayCurrency, setVnBuyPayCurrency] = useState<VnPayCurrency>('usdt')
  const [vnBuyRate, setVnBuyRate] = useState('')
  const [vnBuyTradeDate, setVnBuyTradeDate] = useState(defaultTradeDateInputValue)
  const [vnBuyError, setVnBuyError] = useState('')

  const [vnSellVnAmount, setVnSellVnAmount] = useState('')
  const [vnSellPayAmount, setVnSellPayAmount] = useState('')
  const [vnSellPayCurrency, setVnSellPayCurrency] = useState<VnPayCurrency>('twd')
  const [vnSellRate, setVnSellRate] = useState('')
  const [vnSellTradeDate, setVnSellTradeDate] = useState(defaultTradeDateInputValue)
  const [vnSellError, setVnSellError] = useState('')

  const [cabinAllocPending, setCabinAllocPending] = useState<PendingCabinAlloc | null>(null)
  const [cabinAllocError, setCabinAllocError] = useState('')
  const [editCabinAAmount, setEditCabinAAmount] = useState<number | null>(null)
  const [editCabinBAmount, setEditCabinBAmount] = useState<number | null>(null)

  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseNote, setExpenseNote] = useState('')
  const [expenseDate, setExpenseDate] = useState(defaultTradeDateInputValue)
  const [expenseError, setExpenseError] = useState('')

  const [openingBalanceModalOpen, setOpeningBalanceModalOpen] = useState(false)
  const [cabinRebalanceModalOpen, setCabinRebalanceModalOpen] = useState(false)
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
          // 月結功能暫不使用：不載入、並在下次存檔時清掉本機月結
          setMonthlyCloses([])
          setSelectedMonthlyCloseId(null)
          const normalizedTx = normalizeLoadedTransactions(data.transactions)
          const migrated = migrateUsdtCabinAttribution(
            data.openingBalances,
            data.openingUsdtCabinA,
            normalizedTx,
            data.openingUsdtCabinB,
          )
          let nextOpeningA = migrated.openingUsdtCabinA
          let nextOpeningB = migrated.openingUsdtCabinB
          if (data.usdtCabinSnapshot) {
            const settledAt = getLastTradeSettlementAt(
              data.settlements.map(normalizeLoadedSettlement),
            )
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

  const inventoryCost = useMemo(
    () => computeInventoryCost(openingBalances, openingUsdtCost, transactions),
    [openingBalances, openingUsdtCost, transactions],
  )

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

  const businessDayLabel = useMemo(
    () => getBusinessDayLabel(tradeTransactions),
    [tradeTransactions],
  )

  const createSnapshot = (): AppSnapshot => ({
    transactions,
    openingBalances,
    openingUsdtCost,
    openingUsdtCabinA,
    openingUsdtCabinB,
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
    if (tab === 'monthly') {
      setSelectedMonthlyCloseId(null)
    }
    setActiveTab(tab)
  }

  const buyTransactions = useMemo(
    () => usdtTransactions.filter((tx) => tx.type === 'buy'),
    [usdtTransactions],
  )
  const sellTransactions = useMemo(
    () => usdtTransactions.filter((tx) => tx.type === 'sell'),
    [usdtTransactions],
  )
  const vnBuyTransactions = useMemo(
    () => vnTradeTransactions.filter((tx) => tx.type === 'buy'),
    [vnTradeTransactions],
  )
  const vnSellTransactions = useMemo(
    () => vnTradeTransactions.filter((tx) => tx.type === 'sell'),
    [vnTradeTransactions],
  )
  const sellProfitById = useMemo(
    () => computeSellProfitById(openingBalances, openingUsdtCost, transactions),
    [openingBalances, openingUsdtCost, transactions],
  )

  const vnTradeAnalytics = useMemo(
    () =>
      computeVnTradeAnalytics(
        openingBalances,
        openingVnTwdRate,
        openingVnUsdtRate,
        openingUsdtCost,
        transactions,
      ),
    [openingBalances, openingVnTwdRate, openingVnUsdtRate, openingUsdtCost, transactions],
  )

  const totalAssets = useMemo(
    () =>
      computeTotalAssetsTwd(
        balances,
        inventoryCost,
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
        transactions,
      ),
    [balances, inventoryCost, openingBalances, openingUsdtCost, openingVnTwdRate, openingVnUsdtRate, transactions],
  )

  const resetBuyForm = () => {
    setBuyUsdtAmount('')
    setBuyFiatAmount('')
    setBuyRate('')
    setBuyTradeDate(defaultTradeDateInputValue())
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
    setBuyError('')
  }

  const clearSellForm = () => {
    setSellUsdtAmount('')
    setSellFiatAmount('')
    setSellRate('')
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
    setVnBuyError('')
  }

  const clearVnSellForm = () => {
    setVnSellVnAmount('')
    setVnSellPayAmount('')
    setVnSellRate('')
    setVnSellError('')
  }

  const resetExpenseForm = () => {
    setExpenseAmount('')
    setExpenseNote('')
    setExpenseDate(defaultTradeDateInputValue())
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

  const handleWorkTabChange = (tab: DailyWorkTab) => {
    if (tab === dailyWorkTab) return
    if (editingCategory === 'buy') resetBuyForm()
    else if (editingCategory === 'sell') resetSellForm()
    else if (editingCategory === 'vn_buy') resetVnBuyForm()
    else if (editingCategory === 'vn_sell') resetVnSellForm()
    else if (editingCategory === 'expense') resetExpenseForm()
    setDailyWorkTab(tab)
    setMobileTradePane(tab === 'usdt' ? 'buy_u' : 'buy_vn')
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  const handleMobileTradePaneChange = (pane: DailyMobileTradePane) => {
    if (pane === mobileTradePane) return
    if (editingCategory === 'buy' && pane !== 'buy_u') resetBuyForm()
    else if (editingCategory === 'sell' && pane !== 'sell_u') resetSellForm()
    else if (editingCategory === 'vn_buy' && pane !== 'buy_vn') resetVnBuyForm()
    else if (editingCategory === 'vn_sell' && pane !== 'sell_vn') resetVnSellForm()
    setMobileTradePane(pane)
    setDailyWorkTab(pane === 'buy_u' || pane === 'sell_u' ? 'usdt' : 'vn')
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

    const amount = parseExpenseTwdInput(expenseAmount)
    if (amount === null) {
      setExpenseError('請輸入有效的正數金額')
      return
    }
    if (!isValidDateInputValue(expenseDate)) {
      setExpenseError('請輸入有效日期')
      return
    }

    const isEditing = editingId !== null && editingCategory === 'expense'

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isExpenseTransaction(tx)
            ? {
                ...tx,
                timestamp: timestampFromDateInput(expenseDate, tx.timestamp),
                expenseType: 'other',
                amountTwd: amount,
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
        amountTwd: amount,
        note: expenseNote.trim(),
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(
      updatedTransactions,
      openingBalances,
      lastTradeSettledAt,
      openingUsdtCabinA,
      openingUsdtCabinB,
    )
    if (validationError) {
      setExpenseError(validationError)
      return
    }

    setTransactions(updatedTransactions)
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
    setCumulativeExpenses((prev) => prev.filter((entry) => entry.id !== id))
  }

  const handleDeleteCumulativeExpense = (id: string) => {
    const entry = cumulativeExpenses.find((item) => item.id === id)
    if (!entry) return

    setConfirmDialog({
      title: '',
      lines: [formatTwd(entry.amountTwd), entry.note.trim() || '—'],
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

    const total = pending.reduce((sum, tx) => sum + tx.amountTwd, 0)
    if (total <= 0) return

    const snapshot = createSnapshot()
    setTransactions((prev) => prev.filter((tx) => !isExpenseTransaction(tx)))
    setCumulativeExpenses((prev) => [
      {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        amountTwd: total,
        note: note.trim(),
        items: pending.map((tx) => ({
          amountTwd: tx.amountTwd,
          note: tx.note,
          timestamp: tx.timestamp,
        })),
      },
      ...prev,
    ])
    resetExpenseForm()
    setUndoSnapshot(snapshot)
    setUndoMessage('已對帳並寫入 EXP.SUM')
  }

  const handleExpenseReconcile = () => {
    const pending = filterExpenseTransactions(transactions)
    if (pending.length === 0) return

    const total = pending.reduce((sum, tx) => sum + tx.amountTwd, 0)
    setConfirmDialog({
      title: '',
      lines: [`#${pending.length}`, formatTwd(total)],
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
        initialCabinA: isEditing && editCabinAAmount !== null ? editCabinAAmount : usdt,
        initialCabinB: isEditing && editCabinBAmount !== null ? editCabinBAmount : 0,
        direction: isBuy ? 'in' : 'out',
      })
    }

    const rateCheck = assessRateDeviation(rate, inventoryCost.twd)
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
  ): string | null => {
    const isBuy = type === 'buy'
    const setError = isBuy ? setBuyError : setSellError
    const newId = crypto.randomUUID()
    const cabinAlloc = normalizeCabinAlloc(usdt, cabinAAmount, cabinBAmount)

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
                timestamp: timestampFromDateInput(tradeDate, tx.timestamp),
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
        category: 'usdt',
        type,
        fiatCurrency: 'twd',
        usdtAmount: usdt,
        fiatAmount: fiat,
        rate,
        ...cabinAlloc,
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

    const resolved = resolveVnTradeFields(vnStr, payStr, rateStr, payCurrency)
    if (!resolved.ok) {
      setError(resolved.error)
      return
    }
    const { vn, pay, rate } = resolved

    const finishWithoutCabin = () => {
      const newId = commitVnTrade(type, payCurrency, vn, pay, rate, isEditing, tradeDate, null)
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
      payCurrency === 'twd'
        ? vnTradeAnalytics.currentVnTwdRate
        : vnTradeAnalytics.currentVnUsdtRate
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
  ): string | null => {
    const isBuy = type === 'buy'
    const setError = isBuy ? setVnBuyError : setVnSellError
    const newId = crypto.randomUUID()

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
                timestamp: timestampFromDateInput(tradeDate, tx.timestamp),
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
        category: 'vn_trade',
        type,
        payCurrency,
        vnAmount: vn,
        twdAmount: payCurrency === 'twd' ? pay : 0,
        usdtAmount: payCurrency === 'usdt' ? pay : 0,
        rate,
        ...(cabinAlloc ?? {}),
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
        : validateTransactions(
            updatedTransactions,
            openingBalances,
            lastTradeSettledAt,
            openingUsdtCabinA,
            openingUsdtCabinB,
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
      const { type, usdt, fiat, rate, isEditing, tradeDate } = cabinAllocPending
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
                  timestamp: timestampFromDateInput(tradeDate, tx.timestamp),
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
      )
      setCabinAllocPending(null)
      if (newId) flashNewTransaction(newId)
      return
    }

    const { type, vn, pay, rate, isEditing, tradeDate } = cabinAllocPending
    const cabinAlloc = normalizeCabinAlloc(pay, cabinAAmount, cabinBAmount)
    const updatedList: Transaction[] = isEditing
      ? transactions.map((tx) =>
          tx.id === editingId && isVnTradeTransaction(tx)
            ? {
                ...tx,
                type,
                payCurrency: 'usdt' as const,
                vnAmount: vn,
                twdAmount: 0,
                usdtAmount: pay,
                rate,
                ...cabinAlloc,
                timestamp: timestampFromDateInput(tradeDate, tx.timestamp),
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
            category: 'vn_trade' as const,
            type,
            payCurrency: 'usdt' as const,
            vnAmount: vn,
            twdAmount: 0,
            usdtAmount: pay,
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
        spendsTwd: false,
        balances,
        cabins: usdtCabinBalances,
        usdtAmount: pay,
        cabinAAmount,
        cabinBAmount,
      },
    )
    if (validationError) {
      setCabinAllocError(validationError)
      return
    }
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
    )
    setCabinAllocPending(null)
    if (newId) flashNewTransaction(newId)
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
      setBuyTradeDate(dateInputValueFromDate(tx.timestamp))
    } else {
      setSellUsdtAmount(String(tx.usdtAmount))
      setSellFiatAmount(formatTwdCompactInput(tx.fiatAmount))
      setSellRate(formatRateCalc(tx.rate))
      setSellTradeDate(dateInputValueFromDate(tx.timestamp))
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
      setVnBuyTradeDate(dateInputValueFromDate(normalized.timestamp))
    } else {
      setVnSellPayCurrency(normalized.payCurrency)
      setVnSellVnAmount(formatVnCompactInput(normalized.vnAmount))
      setVnSellPayAmount(
        normalized.payCurrency === 'twd'
          ? formatTwdCompactInput(vnTradePayAmount(normalized))
          : String(vnTradePayAmount(normalized)),
      )
      setVnSellRate(formatVnRateCalc(normalized.rate))
      setVnSellTradeDate(dateInputValueFromDate(normalized.timestamp))
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
    setExpenseAmount(formatExpenseTwdInput(tx.amountTwd))
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
              ? '正在編輯開銷'
              : isEditingNote
                ? '正在編輯筆記'
              : null

  const executeTradeSettle = () => {
    const snapshot = createSnapshot()
    const tradeTxs = filterTradeTransactions(transactions)

    const inventoryAtSettle = computeInventoryCost(
      openingBalances,
      openingUsdtCost,
      transactions,
    )

    const assetsAtSettle = computeTotalAssetsTwd(
      balances,
      inventoryAtSettle,
      openingBalances,
      openingUsdtCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      transactions,
    )
    const settledDayUsdtProfit = computeUsdtDayTotalProfit(
      openingBalances,
      openingUsdtCost,
      transactions,
    )
    const settledDayVnProfit = computeVnDayTotalProfit(
      openingBalances,
      openingVnTwdRate,
      openingVnUsdtRate,
      openingUsdtCost,
      transactions,
    )
    const settledDayProfit = settledDayUsdtProfit + settledDayVnProfit

    const settlement: DailySettlement = {
      id: crypto.randomUUID(),
      settledAt: new Date(),
      dateLabel: formatSettlementDateTime(new Date()),
      twdBalance: balances.twd,
      usdtBalance: balances.usdt,
      vnBalance: balances.vn,
      usdtInventoryAvgTwd: inventoryAtSettle.twd,
      usdtInventoryAvgVn: inventoryAtSettle.vn,
      dayBuyAvgTwd: calculateBuyDayAverageRate(usdtTransactions, 'twd'),
      dayBuyAvgVn: calculateVnBuyDayAverageRate(
        openingBalances,
        openingUsdtCost,
        transactions,
      ),
      ...settlementFromTotalAssets(assetsAtSettle),
      transactionCount: tradeTxs.length,
      dayUsdtProfit: settledDayUsdtProfit,
      dayVnProfit: settledDayVnProfit,
      dayTotalProfit: settledDayProfit,
    }

    setSettlements((prev) => [settlement, ...prev])
    setOpeningBalances(balances)
    setOpeningUsdtCost(inventoryAtSettle)
    setOpeningUsdtCabinA(usdtCabinBalances.a)
    setOpeningUsdtCabinB(usdtCabinBalances.b)
    setOpeningVnTwdRate(assetsAtSettle.dayVnTwdRate)
    setOpeningVnUsdtRate(assetsAtSettle.dayVnUsdtRate)
    setTransactions((prev) => prev.filter(isExpenseTransaction))
    resetBuyForm()
    resetSellForm()
    resetVnBuyForm()
    resetVnSellForm()
    setEditingId(null)
    setEditingCategory(null)
    setActiveTab('settlements')

    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成 ${businessDayLabel} 交易結算`)
  }

  const handleTradeSettle = () => {
    if (tradeTransactions.length === 0) {
      setConfirmDialog({
        title: '無法結算',
        lines: ['尚無交易紀錄，無法結算。'],
        confirmLabel: '知道了',
        variant: 'primary',
        alertOnly: true,
        onConfirm: () => setConfirmDialog(null),
      })
      return
    }

    setConfirmDialog({
      title: '確定結算今日交易？',
      lines: [],
      tradeSettleSummary: buildTradeSettleConfirmSummary(
        transactions,
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
      confirmLabel: 'OK',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeTradeSettle()
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

    const twd = coerceDisplayZeroBalance(openingBalances.twd, 'twd') + twdAdjust
    const usdt = coerceDisplayZeroBalance(openingBalances.usdt, 'usdt') + usdtAdjust
    const vn = coerceDisplayZeroBalance(openingBalances.vn, 'vn') + vnAdjust

    // 以「目前水位」判斷夠不夠扣（賣出換來的現金也可歸零）
    const nextLiveTwd = coerceDisplayZeroBalance(balances.twd, 'twd') + twdAdjust
    const nextLiveUsdt = coerceDisplayZeroBalance(balances.usdt, 'usdt') + usdtAdjust
    const nextLiveVn = coerceDisplayZeroBalance(balances.vn, 'vn') + vnAdjust
    const parts: string[] = []
    if (twdAdjust !== 0 && nextLiveTwd < 0) {
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

    if (twdAdjust === 0 && usdtAdjust === 0 && vnAdjust === 0) {
      setOpeningBalanceError('請輸入至少一項庫存增減')
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

    setOpeningBalanceError('')
    return {
      balances: { twd, usdt, vn },
      usdtCost: { twd: usdtCostTwd, vn: usdtCostVn },
      vnTwdRate,
      vnUsdtRate,
    }
  }

  const executeApplyOpeningBalance = () => {
    const parsed = parseOpeningBalanceForm()
    if (!parsed) return

    const nextCabins = adjustOpeningUsdtCabins(
      openingBalances.usdt,
      openingUsdtCabinA,
      openingUsdtCabinB,
      parsed.balances.usdt,
    )
    setOpeningUsdtCabinA(nextCabins.a)
    setOpeningUsdtCabinB(nextCabins.b)
    setOpeningBalances(parsed.balances)
    setOpeningUsdtCost(parsed.usdtCost)
    setOpeningVnTwdRate(parsed.vnTwdRate)
    setOpeningVnUsdtRate(parsed.vnUsdtRate)
    setOpeningBalanceModalOpen(false)
    setOpeningBalanceError('')
  }

  const handleRebalanceCabins = (targetCabinA: number, targetCabinB: number) => {
    const total = balances.usdt
    const snapshot = normalizeUsdtCabinSnapshot(
      total,
      targetCabinA,
      targetCabinB,
      Math.max(0, total - targetCabinA - targetCabinB),
    )
    const next = openingUsdtCabinsAfterRebalance(
      openingUsdtCabinA,
      openingUsdtCabinB,
      { a: usdtCabinBalances.a, b: usdtCabinBalances.b },
      snapshot.a,
      snapshot.b,
      total,
    )
    setOpeningUsdtCabinA(next.a)
    setOpeningUsdtCabinB(next.b)
    setCabinRebalanceModalOpen(false)
    // 戶轉分倉後立刻寫入 A/B/C 絕對數量，避免 debounce 內重整遺失
    void (async () => {
      const ok = await savePersistedAppStateAsync({
        activeTab,
        dailyWorkTab,
        openingBalances,
        openingUsdtCost,
        openingUsdtCabinA: next.a,
        openingUsdtCabinB: next.b,
        usdtCabinSnapshot: snapshot,
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

    const hasActivity =
      transactions.length > 0 ||
      settlements.length > 0 ||
      expenseSettlements.length > 0 ||
      monthlyCloses.length > 0

    if (!hasActivity) {
      executeApplyOpeningBalance()
      return
    }

    const changes: string[] = []
    if (parsed.balances.twd !== openingBalances.twd) {
      changes.push(
        `T ${formatTwdCompactInput(openingBalances.twd)} → ${formatTwdCompactInput(parsed.balances.twd)}`,
      )
    }
    if (parsed.balances.usdt !== openingBalances.usdt) {
      changes.push(`P ${formatNumber(openingBalances.usdt)} → ${formatNumber(parsed.balances.usdt)}`)
    }
    if (parsed.balances.vn !== openingBalances.vn) {
      changes.push(
        `VN ${formatVnCompactInput(openingBalances.vn)} → ${formatVnCompactInput(parsed.balances.vn)}`,
      )
    }
    const addRateChange = (label: string, before: number | null, after: number | null) => {
      if (before !== after) changes.push(`${label} ${before ?? '—'} → ${after ?? '—'}`)
    }
    addRateChange('P成本(T)', openingUsdtCost.twd, parsed.usdtCost.twd)
    addRateChange('P成本(VN)', openingUsdtCost.vn, parsed.usdtCost.vn)
    addRateChange('VN池(T)', openingVnTwdRate, parsed.vnTwdRate)
    addRateChange('VN池(P)', openingVnUsdtRate, parsed.vnUsdtRate)

    setOpeningBalanceModalOpen(false)
    setConfirmDialog({
      title: '確認調整',
      lines: changes,
      confirmLabel: '確認',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeApplyOpeningBalance()
      },
    })
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
        }}
        onConfirm={handleSaveOpeningBalance}
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
                inventoryCost={inventoryCost}
                usdtCabinBalances={usdtCabinBalances}
                totalAssets={totalAssets}
                vnTwdRate={vnTradeAnalytics.currentVnTwdRate}
                vnUsdtRate={vnTradeAnalytics.currentVnUsdtRate}
              />
              <DailyMobileTradeTabBar
                className="lg:hidden"
                value={mobileTradePane}
                onChange={handleMobileTradePaneChange}
              />
              <DailyWorkTabBar
                className="hidden lg:flex"
                value={dailyWorkTab}
                onChange={handleWorkTabChange}
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
                      error={buyError}
                      isEditing={isEditingBuy}
                      disabled={isEditingAny && !isEditingBuy}
                      onFieldChange={updateBuyForm}
                      onTradeDateChange={setBuyTradeDate}
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
                      error={sellError}
                      isEditing={isEditingSell}
                      disabled={isEditingAny && !isEditingSell}
                      onFieldChange={updateSellForm}
                      onTradeDateChange={setSellTradeDate}
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
                      sellProfitById={sellProfitById}
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
                      error={vnBuyError}
                      isEditing={isEditingVnBuy}
                      disabled={isEditingAny && !isEditingVnBuy}
                      onFieldChange={updateVnBuyForm}
                      onTradeDateChange={setVnBuyTradeDate}
                      onSubmit={(e) => handleVnSubmit('buy', e)}
                      onCancel={resetVnBuyForm}
                      onClear={clearVnBuyForm}
                      accentClass="text-violet-700"
                      buttonClass="bg-violet-600 hover:bg-violet-700 focus:ring-violet-600/30"
                      focusClass="focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                      balances={balances}
                      usdtInventoryCostTwd={inventoryCost.twd}
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
                      error={vnSellError}
                      isEditing={isEditingVnSell}
                      disabled={isEditingAny && !isEditingVnSell}
                      onFieldChange={updateVnSellForm}
                      onTradeDateChange={setVnSellTradeDate}
                      onSubmit={(e) => handleVnSubmit('sell', e)}
                      onCancel={resetVnSellForm}
                      onClear={clearVnSellForm}
                      accentClass="text-amber-700"
                      buttonClass="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30"
                      focusClass="focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                      balances={balances}
                      usdtInventoryCostTwd={inventoryCost.twd}
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
                      sellProfitById={vnTradeAnalytics.sellProfitById}
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
          ) : (
            <>
              <MonthlyClosesList
                onOpeningBalance={handleOpenOpeningBalance}
                onCabinRebalance={() => setCabinRebalanceModalOpen(true)}
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
