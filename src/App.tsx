import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  loadPersistedAppStateAsync,
  savePersistedAppStateAsync,
  type PersistedAppState,
} from './persistence'
import type {
  AppSnapshot,
  Balances,
  ConfirmDialogState,
  DailySettlement,
  DailyWorkTab,
  EditingCategory,
  ExpenseSettlement,
  ExpenseTransaction,
  ExpenseType,
  MonthlyClose,
  OpeningBalanceForm,
  PageTab,
  Transaction,
  TransactionType,
  UsdtInventoryCost,
  UsdtTransaction,
  VnPayCurrency,
  VnTradeTransaction,
} from './types'
import { EMPTY_USDT_COST, INITIAL_BALANCES } from './constants'
import { calculateRate, formatRateCalc, formatVnRateCalc, syncFormFields, syncVnTradeFormFields } from './utils/form'
import {
  assembleExpenseSettlementsForMonthlyClose,
  buildDeleteConfirmLines,
  buildMonthlyClose,
  buildMonthlyClosePreview,
  buildTradeSettleConfirmLines,
  calculateBuyDayAverageRate,
  calculateVnBuyDayAverageRate,
  computeInventoryCost,
  computeSellProfitById,
  computeTotalAssetsTwd,
  computeUsdtDayTotalProfit,
  computeVnDayTotalProfit,
  computeVnTradeAnalytics,
  filterExpenseTransactions,
  filterTradeTransactions,
  filterUsdtTransactions,
  filterVnTradeTransactions,
  getBusinessDayLabel,
  isExpenseTransaction,
  isUsdtTransaction,
  isVnTradeTransaction,
  normalizeLoadedSettlement,
  normalizeLoadedTransactions,
  normalizeMonthlyClose,
  normalizeVnTradeTransaction,
  openingBalanceToForm,
  recalculateBalances,
  settlementFromTotalAssets,
  suggestMonthlyPeriodLabel,
  validateTransactions,
  calculateVnTwdRate,
  vnTradePayAmount,
} from './domain'
import { formatSettlementDateTime, formatTwd } from './utils/format'
import { formCardClass, recordCardClass } from './utils/uiClasses'
import {
  AppNav,
  ConfirmModal,
  DailyBalanceStrip,
  DailyPageHeader,
  DailyTradeSettleBar,
  DailyWorkTabBar,
  EditingBanner,
  ExpenseForm,
  ExpensePageSummary,
  ExpenseTable,
  MobileNavCloseIcon,
  MobileNavMenuIcon,
  MonthlyCloseDetail,
  MonthlyCloseModal,
  MonthlyClosesList,
  OpeningBalanceModal,
  SettlementsPanel,
  TradeForm,
  TransactionTable,
  UndoBanner,
  VnTradeForm,
  VnTradeTable,
  useTransactionVisibleRows,
} from './components'

function App() {
  const tableVisibleRows = useTransactionVisibleRows()
  const persistedRef = useRef<PersistedAppState | null>(null)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const persistReadyRef = useRef(false)

  const [activeTab, setActiveTab] = useState<PageTab>('daily')
  const [dailyWorkTab, setDailyWorkTab] = useState<DailyWorkTab>('usdt')
  const [openingBalances, setOpeningBalances] = useState<Balances>({ ...INITIAL_BALANCES })
  const [openingUsdtCost, setOpeningUsdtCost] = useState<UsdtInventoryCost>({ ...EMPTY_USDT_COST })
  const [openingVnTwdRate, setOpeningVnTwdRate] = useState<number | null>(null)
  const [openingVnUsdtRate, setOpeningVnUsdtRate] = useState<number | null>(null)
  const [settlements, setSettlements] = useState<DailySettlement[]>([])
  const [expenseSettlements, setExpenseSettlements] = useState<ExpenseSettlement[]>([])
  const [monthlyCloses, setMonthlyCloses] = useState<MonthlyClose[]>([])
  const [selectedMonthlyCloseId, setSelectedMonthlyCloseId] = useState<string | null>(null)
  const [monthlyCloseModalOpen, setMonthlyCloseModalOpen] = useState(false)
  const [monthlyPeriodLabel, setMonthlyPeriodLabel] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])

  const [buyUsdtAmount, setBuyUsdtAmount] = useState('')
  const [buyFiatAmount, setBuyFiatAmount] = useState('')
  const [buyRate, setBuyRate] = useState('')
  const [buyError, setBuyError] = useState('')

  const [sellUsdtAmount, setSellUsdtAmount] = useState('')
  const [sellFiatAmount, setSellFiatAmount] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [sellError, setSellError] = useState('')

  const [vnBuyVnAmount, setVnBuyVnAmount] = useState('')
  const [vnBuyPayAmount, setVnBuyPayAmount] = useState('')
  const [vnBuyPayCurrency, setVnBuyPayCurrency] = useState<VnPayCurrency>('usdt')
  const [vnBuyRate, setVnBuyRate] = useState('')
  const [vnBuyError, setVnBuyError] = useState('')

  const [vnSellVnAmount, setVnSellVnAmount] = useState('')
  const [vnSellPayAmount, setVnSellPayAmount] = useState('')
  const [vnSellPayCurrency, setVnSellPayCurrency] = useState<VnPayCurrency>('twd')
  const [vnSellRate, setVnSellRate] = useState('')
  const [vnSellError, setVnSellError] = useState('')

  const [expenseType, setExpenseType] = useState<ExpenseType>('fuel')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseNote, setExpenseNote] = useState('')
  const [expenseError, setExpenseError] = useState('')
  const [expenseFormFocusKey, setExpenseFormFocusKey] = useState(0)
  const [buyFormFocusKey, setBuyFormFocusKey] = useState(0)
  const [sellFormFocusKey, setSellFormFocusKey] = useState(0)
  const [vnBuyFormFocusKey, setVnBuyFormFocusKey] = useState(0)
  const [vnSellFormFocusKey, setVnSellFormFocusKey] = useState(0)

  const [openingBalanceModalOpen, setOpeningBalanceModalOpen] = useState(false)
  const [openingBalanceForm, setOpeningBalanceForm] = useState<OpeningBalanceForm>(() =>
    openingBalanceToForm(
      { ...INITIAL_BALANCES },
      { ...EMPTY_USDT_COST },
      null,
      null,
    ),
  )
  const [openingBalanceError, setOpeningBalanceError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<AppSnapshot | null>(null)
  const [undoMessage, setUndoMessage] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const buyBodyScrollRef = useRef<HTMLDivElement>(null)
  const sellBodyScrollRef = useRef<HTMLDivElement>(null)
  const vnBuyBodyScrollRef = useRef<HTMLDivElement>(null)
  const vnSellBodyScrollRef = useRef<HTMLDivElement>(null)
  const syncBodyScrollLock = useRef(false)

  useEffect(() => {
    let cancelled = false

    void loadPersistedAppStateAsync().then((result) => {
      if (cancelled) return

      if (!result.ok) {
        setLoadError(result.error)
        setReady(true)
        return
      }

      const data = result.state
      if (data) {
        persistedRef.current = data
        setActiveTab(data.activeTab)
        setDailyWorkTab(data.dailyWorkTab ?? 'usdt')
        setOpeningBalances({ ...data.openingBalances })
        setOpeningUsdtCost({ ...data.openingUsdtCost })
        setOpeningVnTwdRate(data.openingVnTwdRate ?? null)
        setOpeningVnUsdtRate(data.openingVnUsdtRate ?? null)
        setSettlements(data.settlements.map(normalizeLoadedSettlement))
        setExpenseSettlements(data.expenseSettlements ?? [])
        setMonthlyCloses((data.monthlyCloses ?? []).map((item) => normalizeMonthlyClose(item)))
        setTransactions(normalizeLoadedTransactions(data.transactions))
        setOpeningBalanceForm(
          openingBalanceToForm(
            data.openingBalances,
            data.openingUsdtCost,
            data.openingVnTwdRate ?? null,
            data.openingVnUsdtRate ?? null,
          ),
        )
      }

      persistReadyRef.current = true
      setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [activeTab])

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

  useEffect(() => {
    if (!persistReadyRef.current) return

    const payload: PersistedAppState = {
      activeTab,
      dailyWorkTab,
      openingBalances,
      openingUsdtCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      transactions,
      settlements,
      expenseSettlements,
      monthlyCloses,
    }

    const timer = window.setTimeout(() => {
      void savePersistedAppStateAsync(payload)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activeTab, dailyWorkTab, openingBalances, openingUsdtCost, openingVnTwdRate, openingVnUsdtRate, transactions, settlements, expenseSettlements, monthlyCloses])

  const balances = useMemo(
    () => recalculateBalances(transactions, openingBalances),
    [transactions, openingBalances],
  )

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

  const expenseBusinessDayLabel = useMemo(
    () => getBusinessDayLabel(expenseTransactions),
    [expenseTransactions],
  )

  const createSnapshot = (): AppSnapshot => ({
    transactions,
    openingBalances,
    openingUsdtCost,
    openingVnTwdRate,
    openingVnUsdtRate,
    settlements,
    expenseSettlements,
    monthlyCloses,
    selectedMonthlyCloseId,
    activeTab,
    dailyWorkTab,
  })

  const restoreSnapshot = (snapshot: AppSnapshot) => {
    setTransactions(snapshot.transactions)
    setOpeningBalances(snapshot.openingBalances)
    setOpeningUsdtCost(snapshot.openingUsdtCost)
    setOpeningVnTwdRate(snapshot.openingVnTwdRate ?? null)
    setOpeningVnUsdtRate(snapshot.openingVnUsdtRate ?? null)
    setSettlements(snapshot.settlements.map(normalizeLoadedSettlement))
    setExpenseSettlements(snapshot.expenseSettlements ?? [])
    setMonthlyCloses((snapshot.monthlyCloses ?? []).map((item) => normalizeMonthlyClose(item)))
    setSelectedMonthlyCloseId(snapshot.selectedMonthlyCloseId ?? null)
    setActiveTab(snapshot.activeTab)
    setDailyWorkTab(snapshot.dailyWorkTab ?? 'usdt')
    setMonthlyCloseModalOpen(false)
    setMonthlyPeriodLabel('')
  }

  const handleSelectTab = (tab: PageTab) => {
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
    () => computeSellProfitById(openingBalances, openingUsdtCost, usdtTransactions),
    [openingBalances, openingUsdtCost, usdtTransactions],
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

  const monthlyClosePreview = useMemo(
    () =>
      buildMonthlyClosePreview(
        settlements,
        expenseSettlements,
        expenseTransactions,
        tradeTransactions.length,
        balances,
      ),
    [settlements, expenseSettlements, expenseTransactions, tradeTransactions.length, balances],
  )

  const selectedMonthlyClose = useMemo(
    () => monthlyCloses.find((item) => item.id === selectedMonthlyCloseId) ?? null,
    [monthlyCloses, selectedMonthlyCloseId],
  )

  const resetBuyForm = () => {
    setBuyUsdtAmount('')
    setBuyFiatAmount('')
    setBuyRate('')
    setBuyError('')
    if (editingCategory === 'buy') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetSellForm = () => {
    setSellUsdtAmount('')
    setSellFiatAmount('')
    setSellRate('')
    setSellError('')
    if (editingCategory === 'sell') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const updateBuyForm = (field: 'usdt' | 'fiat' | 'rate', value: string) => {
    const next = syncFormFields(field, value, {
      usdt: buyUsdtAmount,
      fiat: buyFiatAmount,
      rate: buyRate,
    })
    setBuyUsdtAmount(next.usdt)
    setBuyFiatAmount(next.fiat)
    setBuyRate(next.rate)
  }

  const updateSellForm = (field: 'usdt' | 'fiat' | 'rate', value: string) => {
    const next = syncFormFields(field, value, {
      usdt: sellUsdtAmount,
      fiat: sellFiatAmount,
      rate: sellRate,
    })
    setSellUsdtAmount(next.usdt)
    setSellFiatAmount(next.fiat)
    setSellRate(next.rate)
  }

  const resetVnBuyForm = () => {
    setVnBuyVnAmount('')
    setVnBuyPayAmount('')
    setVnBuyPayCurrency('usdt')
    setVnBuyRate('')
    setVnBuyError('')
    if (editingCategory === 'vn_buy') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetVnSellForm = () => {
    setVnSellVnAmount('')
    setVnSellPayAmount('')
    setVnSellPayCurrency('twd')
    setVnSellRate('')
    setVnSellError('')
    if (editingCategory === 'vn_sell') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const resetExpenseForm = () => {
    setExpenseType('fuel')
    setExpenseAmount('')
    setExpenseNote('')
    setExpenseError('')
    if (editingCategory === 'expense') {
      setEditingId(null)
      setEditingCategory(null)
    }
  }

  const updateVnBuyForm = (field: 'vn' | 'pay' | 'rate', value: string) => {
    const next = syncVnTradeFormFields(field, value, {
      vn: vnBuyVnAmount,
      pay: vnBuyPayAmount,
      rate: vnBuyRate,
    })
    setVnBuyVnAmount(next.vn)
    setVnBuyPayAmount(next.pay)
    setVnBuyRate(next.rate)
  }

  const updateVnSellForm = (field: 'vn' | 'pay' | 'rate', value: string) => {
    const next = syncVnTradeFormFields(field, value, {
      vn: vnSellVnAmount,
      pay: vnSellPayAmount,
      rate: vnSellRate,
    })
    setVnSellVnAmount(next.vn)
    setVnSellPayAmount(next.pay)
    setVnSellRate(next.rate)
  }

  const handleWorkTabChange = (tab: DailyWorkTab) => {
    if (tab === dailyWorkTab) return
    if (editingCategory === 'buy') resetBuyForm()
    else if (editingCategory === 'sell') resetSellForm()
    else if (editingCategory === 'vn_buy') resetVnBuyForm()
    else if (editingCategory === 'vn_sell') resetVnSellForm()
    else if (editingCategory === 'expense') resetExpenseForm()
    setDailyWorkTab(tab)
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

    const amount = parseFloat(expenseAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      setExpenseError('請輸入有效的正數金額')
      return
    }

    const isEditing = editingId !== null && editingCategory === 'expense'

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isExpenseTransaction(tx)
            ? {
                ...tx,
                expenseType,
                amountTwd: amount,
                note: expenseNote.trim(),
              }
            : tx,
        )
      }
      const newTransaction: ExpenseTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'expense',
        expenseType,
        amountTwd: amount,
        note: expenseNote.trim(),
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(updatedTransactions, openingBalances)
    if (validationError) {
      setExpenseError(validationError)
      return
    }

    setTransactions(updatedTransactions)
    resetExpenseForm()
    if (!isEditing) {
      setExpenseFormFocusKey((key) => key + 1)
    }
  }

  const handleSubmit = (type: TransactionType, e: FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const usdtStr = isBuy ? buyUsdtAmount : sellUsdtAmount
    const fiatStr = isBuy ? buyFiatAmount : sellFiatAmount
    const setError = isBuy ? setBuyError : setSellError
    const otherSetError = isBuy ? setSellError : setBuyError

    setError('')
    otherSetError('')
    setVnBuyError('')
    setVnSellError('')
    setExpenseError('')

    const usdt = parseFloat(usdtStr)
    const fiat = parseFloat(fiatStr)

    if (Number.isNaN(usdt) || Number.isNaN(fiat) || usdt <= 0 || fiat <= 0) {
      setError('請輸入有效的正數金額')
      return
    }

    const rate = calculateRate(fiat, usdt)
    const isEditing = editingId !== null && editingCategory === type

    const buildUpdatedList = (list: Transaction[]): Transaction[] => {
      if (isEditing) {
        return list.map((tx) =>
          tx.id === editingId && isUsdtTransaction(tx)
            ? { ...tx, type, fiatCurrency: 'twd' as const, usdtAmount: usdt, fiatAmount: fiat, rate }
            : tx,
        )
      }
      const newTransaction: UsdtTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'usdt',
        type,
        fiatCurrency: 'twd',
        usdtAmount: usdt,
        fiatAmount: fiat,
        rate,
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(updatedTransactions, openingBalances)
    if (validationError) {
      setError(validationError)
      return
    }

    setTransactions(updatedTransactions)
    if (isBuy) {
      resetBuyForm()
      if (!isEditing) setBuyFormFocusKey((key) => key + 1)
    } else {
      resetSellForm()
      if (!isEditing) setSellFormFocusKey((key) => key + 1)
    }
  }

  const handleVnSubmit = (type: TransactionType, e: FormEvent) => {
    e.preventDefault()

    const isBuy = type === 'buy'
    const vnStr = isBuy ? vnBuyVnAmount : vnSellVnAmount
    const payStr = isBuy ? vnBuyPayAmount : vnSellPayAmount
    const payCurrency = isBuy ? vnBuyPayCurrency : vnSellPayCurrency
    const setError = isBuy ? setVnBuyError : setVnSellError
    const otherSetError = isBuy ? setVnSellError : setVnBuyError

    setError('')
    otherSetError('')
    setBuyError('')
    setSellError('')
    setExpenseError('')

    const vn = parseFloat(vnStr)
    const pay = parseFloat(payStr)

    if (Number.isNaN(vn) || Number.isNaN(pay) || vn <= 0 || pay <= 0) {
      setError('請輸入有效的正數金額')
      return
    }

    const rate = calculateVnTwdRate(vn, pay)
    const editCategory = isBuy ? 'vn_buy' : 'vn_sell'
    const isEditing = editingId !== null && editingCategory === editCategory

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
              }
            : tx,
        )
      }
      const newTransaction: VnTradeTransaction = {
        id: crypto.randomUUID(),
        timestamp: new Date(),
        category: 'vn_trade',
        type,
        payCurrency,
        vnAmount: vn,
        twdAmount: payCurrency === 'twd' ? pay : 0,
        usdtAmount: payCurrency === 'usdt' ? pay : 0,
        rate,
      }
      return [newTransaction, ...list]
    }

    const updatedTransactions = buildUpdatedList(transactions)
    const validationError = validateTransactions(updatedTransactions, openingBalances)
    if (validationError) {
      setError(validationError)
      return
    }

    setTransactions(updatedTransactions)
    if (isBuy) {
      resetVnBuyForm()
      if (!isEditing) setVnBuyFormFocusKey((key) => key + 1)
    } else {
      resetVnSellForm()
      if (!isEditing) setVnSellFormFocusKey((key) => key + 1)
    }
  }

  const handleEdit = (tx: UsdtTransaction) => {
    setActiveTab('daily')
    setDailyWorkTab('usdt')
    setEditingId(tx.id)
    setEditingCategory(tx.type)
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    if (tx.type === 'buy') {
      setBuyUsdtAmount(String(tx.usdtAmount))
      setBuyFiatAmount(String(tx.fiatAmount))
      setBuyRate(formatRateCalc(tx.rate))
    } else {
      setSellUsdtAmount(String(tx.usdtAmount))
      setSellFiatAmount(String(tx.fiatAmount))
      setSellRate(formatRateCalc(tx.rate))
    }
  }

  const handleEditVn = (tx: VnTradeTransaction) => {
    const normalized = normalizeVnTradeTransaction(tx)
    setActiveTab('daily')
    setDailyWorkTab('vn')
    setEditingId(normalized.id)
    setEditingCategory(normalized.type === 'buy' ? 'vn_buy' : 'vn_sell')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')

    if (normalized.type === 'buy') {
      setVnBuyPayCurrency(normalized.payCurrency)
      setVnBuyVnAmount(String(normalized.vnAmount))
      setVnBuyPayAmount(String(vnTradePayAmount(normalized)))
      setVnBuyRate(formatVnRateCalc(normalized.rate))
    } else {
      setVnSellPayCurrency(normalized.payCurrency)
      setVnSellVnAmount(String(normalized.vnAmount))
      setVnSellPayAmount(String(vnTradePayAmount(normalized)))
      setVnSellRate(formatVnRateCalc(normalized.rate))
    }
  }

  const handleEditExpense = (tx: ExpenseTransaction) => {
    setActiveTab('expenses')
    setEditingId(tx.id)
    setEditingCategory('expense')
    setBuyError('')
    setSellError('')
    setVnBuyError('')
    setVnSellError('')
    setExpenseError('')
    setExpenseType(tx.expenseType)
    setExpenseAmount(String(tx.amountTwd))
    setExpenseNote(tx.note)
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
      title: isExpenseTransaction(tx) ? '確定刪除以下開銷？' : '確定刪除以下交易？',
      lines: buildDeleteConfirmLines(tx),
      confirmLabel: '刪除',
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

  const editingBannerLabel =
    editingCategory === 'buy'
      ? '正在編輯收E'
      : editingCategory === 'sell'
        ? '正在編輯出E'
        : editingCategory === 'vn_buy'
          ? '正在編輯買入 VN'
          : editingCategory === 'vn_sell'
            ? '正在編輯賣出 VN'
            : editingCategory === 'expense'
              ? '正在編輯開銷'
              : null

  const isEditingBuy = editingCategory === 'buy'
  const isEditingSell = editingCategory === 'sell'
  const isEditingVnBuy = editingCategory === 'vn_buy'
  const isEditingVnSell = editingCategory === 'vn_sell'
  const isEditingExpense = editingCategory === 'expense'
  const isEditingAny = editingCategory !== null

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
      usdtTransactions,
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
      lines: buildTradeSettleConfirmLines(
        transactions,
        balances,
        inventoryCost,
        openingBalances,
        openingUsdtCost,
        openingVnTwdRate,
        openingVnUsdtRate,
      ),
      confirmLabel: '確認結算',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeTradeSettle()
      },
    })
  }

  const executeResetAll = () => {
    setTransactions([])
    setSettlements([])
    setExpenseSettlements([])
    setMonthlyCloses([])
    setSelectedMonthlyCloseId(null)
    setMonthlyCloseModalOpen(false)
    setMonthlyPeriodLabel('')
    setOpeningBalances({ ...INITIAL_BALANCES })
    setOpeningUsdtCost({ ...EMPTY_USDT_COST })
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
    setConfirmDialog({
      title: '確定清空全部資料？',
      lines: [
        '將刪除所有交易與結算紀錄，並還原初始餘額。',
        '此操作無法復原，僅供測試使用。',
      ],
      confirmLabel: '確認清空',
      variant: 'danger',
      onConfirm: () => {
        setConfirmDialog(null)
        executeResetAll()
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

  const handleOpenOpeningBalance = () => {
    setOpeningBalanceForm(
      openingBalanceToForm(
        openingBalances,
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
    const twd = Number(openingBalanceForm.twd.trim())
    const usdt = Number(openingBalanceForm.usdt.trim())
    const vn = Number(openingBalanceForm.vn.trim())

    if (![twd, usdt, vn].every((value) => Number.isFinite(value) && value >= 0)) {
      setOpeningBalanceError('TWD / USDT / VN 請輸入有效的非負數')
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
      setOpeningBalanceError('USDT 成本 (TWD) 請輸入有效正數或留空')
      return null
    }
    const usdtCostVn = parseOptionalRate(openingBalanceForm.usdtCostVn)
    if (usdtCostVn === 'invalid') {
      setOpeningBalanceError('USDT 成本 (VN) 請輸入有效正數或留空')
      return null
    }
    const vnTwdRate = parseOptionalRate(openingBalanceForm.vnTwdRate)
    if (vnTwdRate === 'invalid') {
      setOpeningBalanceError('VN 池成本 (VN/TWD) 請輸入有效正數或留空')
      return null
    }
    const vnUsdtRate = parseOptionalRate(openingBalanceForm.vnUsdtRate)
    if (vnUsdtRate === 'invalid') {
      setOpeningBalanceError('VN 池成本 (VN/U) 請輸入有效正數或留空')
      return null
    }

    if (usdt > 0 && usdtCostTwd === null) {
      setOpeningBalanceError('有 USDT 庫存時請填寫 USDT 成本 (TWD)')
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

    setOpeningBalances(parsed.balances)
    setOpeningUsdtCost(parsed.usdtCost)
    setOpeningVnTwdRate(parsed.vnTwdRate)
    setOpeningVnUsdtRate(parsed.vnUsdtRate)
    setOpeningBalanceModalOpen(false)
    setOpeningBalanceError('')
  }

  const handleSaveOpeningBalance = () => {
    if (!parseOpeningBalanceForm()) return

    const hasActivity =
      transactions.length > 0 ||
      settlements.length > 0 ||
      expenseSettlements.length > 0 ||
      monthlyCloses.length > 0

    if (!hasActivity) {
      executeApplyOpeningBalance()
      return
    }

    setConfirmDialog({
      title: '確定更新期初餘額？',
      lines: [
        '將更新期初庫存與成本設定。',
        '既有流水與日結紀錄不會刪除，但顯示餘額會依新期初重算。',
        '建議在無進行中資料時調整，或調整後自行核對。',
      ],
      confirmLabel: '確認儲存',
      variant: 'primary',
      onConfirm: () => {
        setConfirmDialog(null)
        executeApplyOpeningBalance()
      },
    })
  }

  const handleOpenMonthlyClose = () => {
    if (
      settlements.length === 0 &&
      expenseSettlements.length === 0 &&
      expenseTransactions.length === 0
    ) {
      setConfirmDialog({
        title: '無法月結',
        lines: ['「每日結算」與「營業開銷」目前皆無紀錄，無法月結。'],
        confirmLabel: '知道了',
        variant: 'primary',
        alertOnly: true,
        onConfirm: () => setConfirmDialog(null),
      })
      return
    }

    setMonthlyPeriodLabel(suggestMonthlyPeriodLabel())
    setMonthlyCloseModalOpen(true)
  }

  const executeMonthlyClose = () => {
    const label = monthlyPeriodLabel.trim()
    if (!label) return

    const snapshot = createSnapshot()
    const hadPendingExpenses = expenseTransactions.length > 0
    const assembledExpenses = assembleExpenseSettlementsForMonthlyClose(
      expenseSettlements,
      expenseTransactions,
      balances,
    )
    const monthlyClose = buildMonthlyClose(
      label,
      settlements,
      assembledExpenses,
      balances,
      inventoryCost,
      openingVnTwdRate,
      openingVnUsdtRate,
      totalAssets.total,
    )

    setMonthlyCloses((prev) => [monthlyClose, ...prev])
    setSettlements([])
    setExpenseSettlements([])
    if (hadPendingExpenses) {
      setTransactions((prev) => prev.filter((tx) => !isExpenseTransaction(tx)))
      setOpeningBalances(balances)
    }
    setSelectedMonthlyCloseId(monthlyClose.id)
    setMonthlyCloseModalOpen(false)
    setMonthlyPeriodLabel('')
    setActiveTab('monthly')

    setUndoSnapshot(snapshot)
    setUndoMessage(`已完成「${monthlyClose.periodLabel}」月結封存`)
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
      <MonthlyCloseModal
        open={monthlyCloseModalOpen}
        periodLabel={monthlyPeriodLabel}
        preview={monthlyClosePreview}
        onPeriodLabelChange={setMonthlyPeriodLabel}
        onCancel={() => {
          setMonthlyCloseModalOpen(false)
          setMonthlyPeriodLabel('')
        }}
        onConfirm={executeMonthlyClose}
      />
      <OpeningBalanceModal
        open={openingBalanceModalOpen}
        form={openingBalanceForm}
        error={openingBalanceError}
        onFieldChange={(field, value) =>
          setOpeningBalanceForm((prev) => ({ ...prev, [field]: value }))
        }
        onCancel={() => {
          setOpeningBalanceModalOpen(false)
          setOpeningBalanceError('')
        }}
        onConfirm={handleSaveOpeningBalance}
      />
      <div className="flex h-full w-full">
        <aside className="hidden w-[6rem] shrink-0 border-r border-slate-200 bg-white px-1 py-3 lg:block">
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
            <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-sm">
              <div>
                <p className="text-[10px] font-medium tracking-wide text-slate-400">MENU</p>
                <p className="text-sm font-semibold text-slate-800">選單</p>
              </div>
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
            <p className="min-w-0 flex-1 text-xs font-medium text-slate-800">
              {activeTab === 'daily'
                ? dailyWorkTab === 'usdt'
                  ? 'E進出'
                  : 'V進出'
                : activeTab === 'expenses'
                  ? '營業開銷'
                  : activeTab === 'monthly'
                      ? selectedMonthlyClose
                        ? selectedMonthlyClose.periodLabel
                        : '月結'
                      : '每日結算'}
            </p>
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
              <DailyPageHeader
                businessDayLabel={businessDayLabel}
                pendingCount={tradeTransactions.length}
                onOpeningBalance={handleOpenOpeningBalance}
                onResetAll={handleResetAll}
              />
              <DailyBalanceStrip
                balances={balances}
                inventoryCost={inventoryCost}
                totalAssets={totalAssets}
                vnTwdRate={vnTradeAnalytics.currentVnTwdRate}
                vnUsdtRate={vnTradeAnalytics.currentVnUsdtRate}
              />
              <DailyWorkTabBar value={dailyWorkTab} onChange={handleWorkTabChange} />

              {dailyWorkTab === 'usdt' ? (
                <section className="grid shrink-0 gap-1 sm:gap-2 lg:grid-cols-2 lg:items-start">
                  <div className="flex flex-col gap-1 sm:gap-1.5">
                    <div className={formCardClass('emerald', isEditingBuy)}>
                      <TradeForm
                        type="buy"
                        title="收E"
                        editTitle="編輯收E"
                        usdt={buyUsdtAmount}
                        fiat={buyFiatAmount}
                        rate={buyRate}
                        error={buyError}
                        isEditing={isEditingBuy}
                        disabled={isEditingAny && !isEditingBuy}
                        focusKey={buyFormFocusKey}
                        onFieldChange={updateBuyForm}
                        onSubmit={(e) => handleSubmit('buy', e)}
                        onCancel={resetBuyForm}
                        accentClass="text-emerald-700"
                        buttonClass="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600/30"
                        focusClass="focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        balances={balances}
                        inventoryUnitCost={inventoryCost.twd}
                      />
                    </div>
                    <div className={recordCardClass('emerald')}>
                      <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-emerald-700">
                        買入紀錄
                      </h2>
                      <TransactionTable
                        transactions={buyTransactions}
                        editingId={editingId}
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

                  <div className="flex flex-col gap-1.5">
                    <div className={formCardClass('rose', isEditingSell)}>
                      <TradeForm
                        type="sell"
                        title="出E"
                        editTitle="編輯出E"
                        usdt={sellUsdtAmount}
                        fiat={sellFiatAmount}
                        rate={sellRate}
                        error={sellError}
                        isEditing={isEditingSell}
                        disabled={isEditingAny && !isEditingSell}
                        focusKey={sellFormFocusKey}
                        onFieldChange={updateSellForm}
                        onSubmit={(e) => handleSubmit('sell', e)}
                        onCancel={resetSellForm}
                        accentClass="text-rose-700"
                        buttonClass="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600/30"
                        focusClass="focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                        balances={balances}
                        inventoryUnitCost={inventoryCost.twd}
                      />
                    </div>
                    <div className={recordCardClass('rose')}>
                      <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-rose-700">
                        賣出紀錄
                      </h2>
                      <TransactionTable
                        transactions={sellTransactions}
                        editingId={editingId}
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
                </section>
              ) : (
                <section className="grid shrink-0 gap-1 sm:gap-2 lg:grid-cols-2 lg:items-start">
                  <div className="flex flex-col gap-1 sm:gap-1.5">
                    <div className={formCardClass('violet', isEditingVnBuy)}>
                      <VnTradeForm
                        type="buy"
                        title="買入 VN"
                        editTitle="編輯買入 VN"
                        payCurrency={vnBuyPayCurrency}
                        onPayCurrencyChange={setVnBuyPayCurrency}
                        vn={vnBuyVnAmount}
                        pay={vnBuyPayAmount}
                        rate={vnBuyRate}
                        error={vnBuyError}
                        isEditing={isEditingVnBuy}
                        disabled={isEditingAny && !isEditingVnBuy}
                        focusKey={vnBuyFormFocusKey}
                        onFieldChange={updateVnBuyForm}
                        onSubmit={(e) => handleVnSubmit('buy', e)}
                        onCancel={resetVnBuyForm}
                        accentClass="text-violet-700"
                        buttonClass="bg-violet-600 hover:bg-violet-700 focus:ring-violet-600/30"
                        focusClass="focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                        balances={balances}
                        usdtInventoryCostTwd={inventoryCost.twd}
                        vnInventoryTwdRate={null}
                      />
                    </div>
                    <div className={recordCardClass('violet')}>
                      <h2 className="mb-1 shrink-0 text-xs font-semibold leading-none text-violet-700">
                        買入紀錄
                      </h2>
                      <VnTradeTable
                        transactions={vnBuyTransactions}
                        editingId={editingId}
                        onEdit={handleEditVn}
                        onDelete={handleDelete}
                        accent="buy"
                        sideLabel="買入"
                        visibleRows={tableVisibleRows}
                        bodyScrollRef={vnBuyBodyScrollRef}
                        onBodyScroll={(scrollTop) => syncVnBodyScroll('buy', scrollTop)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className={formCardClass('rose', isEditingVnSell)}>
                      <VnTradeForm
                        type="sell"
                        title="賣出 VN"
                        editTitle="編輯賣出 VN"
                        payCurrency={vnSellPayCurrency}
                        onPayCurrencyChange={setVnSellPayCurrency}
                        vn={vnSellVnAmount}
                        pay={vnSellPayAmount}
                        rate={vnSellRate}
                        error={vnSellError}
                        isEditing={isEditingVnSell}
                        disabled={isEditingAny && !isEditingVnSell}
                        focusKey={vnSellFormFocusKey}
                        onFieldChange={updateVnSellForm}
                        onSubmit={(e) => handleVnSubmit('sell', e)}
                        onCancel={resetVnSellForm}
                        accentClass="text-amber-700"
                        buttonClass="bg-amber-600 hover:bg-amber-700 focus:ring-amber-600/30"
                        focusClass="focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        balances={balances}
                        usdtInventoryCostTwd={inventoryCost.twd}
                        vnInventoryTwdRate={vnTradeAnalytics.currentVnTwdRate}
                      />
                    </div>
                    <div className={recordCardClass('rose')}>
                      <h2 className="mb-1 shrink-0 text-xs font-semibold leading-none text-amber-700">
                        賣出紀錄
                      </h2>
                      <VnTradeTable
                        transactions={vnSellTransactions}
                        editingId={editingId}
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
              )}
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
              <h1 className="mb-1 shrink-0 text-sm font-semibold text-slate-800">營業開銷</h1>
              <p className="mb-2 shrink-0 text-[10px] text-slate-500">
                <span className="font-medium text-slate-700">{expenseBusinessDayLabel}</span>
                {' 營業日 · '}
                待結{' '}
                <span className="tabular-nums font-medium text-slate-700">
                  {expenseTransactions.length}
                </span>{' '}
                筆 · 台幣餘額{' '}
                <span className="tabular-nums font-medium text-slate-700">
                  {formatTwd(balances.twd)}
                </span>
              </p>
              <section className="mx-auto w-full max-w-2xl shrink-0 space-y-2">
                <div className={formCardClass('orange', isEditingExpense)}>
                  <ExpenseForm
                    expenseType={expenseType}
                    amount={expenseAmount}
                    note={expenseNote}
                    error={expenseError}
                    isEditing={isEditingExpense}
                    disabled={isEditingAny && !isEditingExpense}
                    twdBalance={balances.twd}
                    focusKey={expenseFormFocusKey}
                    onExpenseTypeChange={setExpenseType}
                    onAmountChange={setExpenseAmount}
                    onNoteChange={setExpenseNote}
                    onSubmit={handleExpenseSubmit}
                    onCancel={resetExpenseForm}
                  />
                </div>
                <div className={`${recordCardClass('orange')} flex flex-col`}>
                  <h2 className="mb-1 shrink-0 text-[11px] font-semibold leading-none text-orange-700">
                    開銷紀錄
                  </h2>
                  <ExpenseTable
                    transactions={expenseTransactions}
                    editingId={editingId}
                    onEdit={handleEditExpense}
                    onDelete={handleDelete}
                    visibleRows={tableVisibleRows}
                  />
                  <ExpensePageSummary transactions={expenseTransactions} />
                </div>
              </section>
            </div>
          ) : activeTab === 'settlements' ? (
            <>
              <h1 className="mb-2 shrink-0 text-sm font-semibold text-slate-800">每日結算</h1>
              <SettlementsPanel settlements={settlements} />
            </>
          ) : (
            <>
              <h1 className="mb-2 shrink-0 text-sm font-semibold text-slate-800">月結</h1>
              {selectedMonthlyClose ? (
                <MonthlyCloseDetail
                  monthlyClose={selectedMonthlyClose}
                  onBack={() => setSelectedMonthlyCloseId(null)}
                />
              ) : (
                <MonthlyClosesList
                  closes={monthlyCloses}
                  onSelect={setSelectedMonthlyCloseId}
                  onStartClose={handleOpenMonthlyClose}
                />
              )}
            </>
          )}
        </main>
        </div>
      </div>
    </div>
  )
}

export default App
