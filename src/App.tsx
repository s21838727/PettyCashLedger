/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Filter,
  Receipt,
  Upload,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  Edit2,
  AlertCircle,
  CheckCircle2,
  Download,
  Printer,
  Settings,
  RefreshCw,
  Layers,
  Calendar,
  User,
  Building2,
  FileSpreadsheet,
  Check,
  ExternalLink
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { initGoogleAuth, googleSignIn, getAccessToken, exportToGoogleSheets } from './utils/googleSheets';
import { User as FirebaseUser } from 'firebase/auth';

// Types
export interface Transaction {
  id: string;
  departmentId: string;
  date: string;
  voucherNo: string;
  invoiceNo?: string;
  vendor?: string;
  description: string;
  category: string;
  spent: number; // 支出 (- debit)
  replenishment: number; // 收入/撥補 (+ credit)
  custodian: string; // 經辦人
  handler: string;   // 資金經手人
  receiptImage?: string; // base64 or URL
  notes?: string;
}

export interface Department {
  id: string;
  name: string;
  initialFund: number;
  custodian: string;
  targetSpreadsheetId?: string; // 指定的 Google Sheet ID 或網址
}

const CATEGORIES = [
  '辦公文具',
  '差旅交通',
  '餐飲招待',
  '郵電快遞',
  '雜支',
  '設備維修',
  '補充撥補'
];

const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept-1', name: '創新研發部', initialFund: 5000, custodian: '王俊傑', targetSpreadsheetId: '' },
];

const INITIAL_TRANSACTIONS: Transaction[] = [];

export default function App() {
  const [departments, setDepartments] = useState<Department[]>(() => {
    const saved = localStorage.getItem('petty_cash_depts_v6');
    return saved ? JSON.parse(saved) : INITIAL_DEPARTMENTS;
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('petty_cash_txs_v6');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });

  const [activeDeptId, setActiveDeptId] = useState<string>(() => departments[0]?.id || 'dept-1');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Google Sheets Export States
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user) => setGoogleUser(user),
      () => setGoogleUser(null)
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSheetsExport = async () => {
    let token = await getAccessToken();
    if (!token) {
      try {
        const result = await googleSignIn();
        if (result) {
          token = result.accessToken;
          setGoogleUser(result.user);
        } else {
          return;
        }
      } catch (err) {
        console.error('Google sign in error:', err);
        alert('Google 登入失敗，請授權 Google Sheets 權限以繼續。');
        return;
      }
    }

    if (!token) return;

    setIsExportingSheets(true);
    setSheetUrl(null);
    try {
      const url = await exportToGoogleSheets(
        currentDept.name,
        currentDept.custodian,
        transactionsWithBalance.map(t => ({
          date: t.date,
          voucherNo: t.voucherNo,
          invoiceNo: t.invoiceNo,
          description: t.description,
          category: t.category,
          spent: t.spent,
          replenishment: t.replenishment,
          balance: t.balance,
          custodian: t.custodian,
          handler: t.handler || t.custodian
        })),
        token,
        currentDept.targetSpreadsheetId
      );
      setSheetUrl(url);
    } catch (err: any) {
      console.error('Google Sheets export error:', err);
      alert('匯出至 Google Sheets 失敗：' + (err.message || '未知錯誤'));
    } finally {
      setIsExportingSheets(false);
    }
  };

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    voucherNo: `V${new Date().toISOString().slice(0, 10).replace(/-/g, '')}01`,
    invoiceNo: '',
    vendor: '',
    description: '',
    category: CATEGORIES[0],
    type: 'spent' as 'spent' | 'replenishment',
    amount: '',
    custodian: departments[0]?.custodian || '王俊傑',
    handler: departments[0]?.custodian || '王俊傑',
    notes: '',
    receiptImage: ''
  });

  // AI OCR scanning state
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Advisor state
  const [aiInsights, setAiInsights] = useState<{ title: string; suggestion: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Department settings modal
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [deptFormData, setDeptFormData] = useState({
    name: '',
    initialFund: 5000,
    custodian: '',
    targetSpreadsheetId: ''
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('petty_cash_depts_v6', JSON.stringify(departments));
  }, [departments]);

  useEffect(() => {
    localStorage.setItem('petty_cash_txs_v6', JSON.stringify(transactions));
  }, [transactions]);

  // Current active department
  const currentDept = useMemo(() => {
    return departments.find(d => d.id === activeDeptId) || departments[0];
  }, [departments, activeDeptId]);

  // Filtered transactions for active department
  const deptTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.departmentId !== activeDeptId) return false;
      if (categoryFilter !== 'ALL' && tx.category !== categoryFilter) return false;
      if (startDateFilter && tx.date < startDateFilter) return false;
      if (endDateFilter && tx.date > endDateFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchDesc = tx.description.toLowerCase().includes(term);
        const matchVoucher = tx.voucherNo.toLowerCase().includes(term);
        const matchInvoice = tx.invoiceNo?.toLowerCase().includes(term) || false;
        const matchVendor = tx.vendor?.toLowerCase().includes(term) || false;
        const matchCustodian = tx.custodian.toLowerCase().includes(term);
        const matchHandler = tx.handler?.toLowerCase().includes(term) || false;
        if (!matchDesc && !matchVoucher && !matchInvoice && !matchVendor && !matchCustodian && !matchHandler) return false;
      }
      return true;
    });
  }, [transactions, activeDeptId, categoryFilter, startDateFilter, endDateFilter, searchTerm]);

  // Calculate running balances
  const transactionsWithBalance = useMemo(() => {
    let running = currentDept.initialFund;
    const sorted = [...transactions.filter(tx => tx.departmentId === activeDeptId)].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.id.localeCompare(b.id);
    });

    const balanceMap = new Map<string, number>();
    sorted.forEach(tx => {
      running = running - tx.spent + tx.replenishment;
      balanceMap.set(tx.id, running);
    });

    return deptTransactions.map(tx => ({
      ...tx,
      balance: balanceMap.get(tx.id) || 0
    }));
  }, [transactions, deptTransactions, activeDeptId, currentDept.initialFund]);

  // Summary statistics for active department
  const stats = useMemo(() => {
    const all = transactions.filter(tx => tx.departmentId === activeDeptId);
    let totalSpent = 0;
    let totalReplenished = 0;
    let currentBalance = currentDept.initialFund;

    const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach(tx => {
      totalSpent += tx.spent;
      totalReplenished += tx.replenishment;
      currentBalance = currentBalance - tx.spent + tx.replenishment;
    });

    return {
      initialFund: currentDept.initialFund,
      totalSpent,
      totalReplenished,
      currentBalance,
      isLow: currentBalance < (currentDept.initialFund * 0.2)
    };
  }, [transactions, activeDeptId, currentDept]);

  // Handle open add modal
  const handleOpenAddModal = () => {
    setEditingTxId(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      voucherNo: `V${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.floor(10 + Math.random() * 90)}`,
      invoiceNo: '',
      vendor: '',
      description: '',
      category: CATEGORIES[0],
      type: 'spent',
      amount: '',
      custodian: currentDept.custodian,
      handler: currentDept.custodian,
      notes: '',
      receiptImage: ''
    });
    setIsModalOpen(true);
  };

  // Handle edit modal
  const handleOpenEditModal = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setFormData({
      date: tx.date,
      voucherNo: tx.voucherNo,
      invoiceNo: tx.invoiceNo || '',
      vendor: tx.vendor || '',
      description: tx.description,
      category: tx.category,
      type: tx.replenishment > 0 ? 'replenishment' : 'spent',
      amount: tx.replenishment > 0 ? tx.replenishment.toString() : tx.spent.toString(),
      custodian: tx.custodian,
      handler: tx.handler || tx.custodian,
      notes: tx.notes || '',
      receiptImage: tx.receiptImage || ''
    });
    setIsModalOpen(true);
  };

  // Handle submit transaction
  const handleSubmitTx = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(formData.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('請輸入有效的金額');
      return;
    }

    const newTx: Transaction = {
      id: editingTxId || `tx-${Date.now()}`,
      departmentId: activeDeptId,
      date: formData.date,
      voucherNo: formData.voucherNo || `V${Date.now().toString().slice(-6)}`,
      invoiceNo: formData.invoiceNo,
      vendor: formData.vendor,
      description: formData.description,
      category: formData.category,
      spent: formData.type === 'spent' ? numAmount : 0,
      replenishment: formData.type === 'replenishment' ? numAmount : 0,
      custodian: formData.custodian,
      handler: formData.handler,
      notes: formData.notes,
      receiptImage: formData.receiptImage
    };

    if (editingTxId) {
      setTransactions(transactions.map(t => t.id === editingTxId ? newTx : t));
    } else {
      setTransactions([newTx, ...transactions]);
    }
    setIsModalOpen(false);
  };

  // Handle delete transaction
  const handleDeleteTx = (id: string) => {
    if (confirm('確定要刪除這筆零用金記錄嗎？')) {
      setTransactions(transactions.filter(t => t.id !== id));
    }
  };

  // Handle image upload & AI OCR parsing
  const handleReceiptImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      setFormData(prev => ({ ...prev, receiptImage: base64String }));
      setIsScanning(true);

      try {
        const res = await fetch('/api/gemini/parse-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64Data, mimeType })
        });
        const data = await res.json();
        if (res.ok) {
          setFormData(prev => ({
            ...prev,
            date: data.date || prev.date,
            vendor: data.vendor || prev.vendor,
            invoiceNo: data.invoiceNo || prev.invoiceNo,
            description: data.description || prev.description,
            amount: data.amount ? data.amount.toString() : prev.amount,
            category: CATEGORIES.includes(data.category) ? data.category : prev.category
          }));
        } else {
          alert('AI 辨識發票失敗：' + (data.error || '未知錯誤'));
        }
      } catch (err) {
        console.error('OCR error:', err);
        alert('AI 辨識發票連線失敗');
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Excel Export
  const handleExportExcel = () => {
    const exportData = transactionsWithBalance.map((tx, idx) => ({
      '項次': idx + 1,
      '日期': tx.date,
      '單據編號': tx.voucherNo,
      '發票號碼': tx.invoiceNo || '-',
      '商家/廠商': tx.vendor || '-',
      '摘要說明': tx.description,
      '類別': tx.category,
      '支出金額 (-)': tx.spent > 0 ? tx.spent : '',
      '撥補/收入 (+)': tx.replenishment > 0 ? tx.replenishment : '',
      '結餘': tx.balance,
      '經辦人': tx.custodian,
      '資金經手人': tx.handler || tx.custodian,
      '備註': tx.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '零用金明細表');

    XLSX.writeFile(workbook, `${currentDept.name}_零用金明細表_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Print report
  const handlePrint = () => {
    window.print();
  };

  // AI Financial Advisory Analysis
  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/gemini/analyze-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: deptTransactions,
          budget: currentDept.initialFund,
          currentBalance: stats.currentBalance
        })
      });
      const data = await res.json();
      if (res.ok && data.suggestions) {
        setAiInsights(data.suggestions);
      } else {
        alert('AI 分析失敗');
      }
    } catch (err) {
      console.error(err);
      alert('AI 分析連線錯誤');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-sky-50/70 text-slate-900 flex flex-col font-sans">
      {/* Top Bar Contract (Strict 3-zone layout) */}
      <header className="flex items-center justify-between gap-8 px-8 py-4 bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">部門零用金管理系統</h1>
            <p className="text-xs text-slate-500 hidden sm:block">Petty Cash Ledger & Expense Management</p>
          </div>
        </div>

        {/* Zone 2: 4-5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <span className="text-indigo-600 font-semibold cursor-pointer">明細紀錄表</span>
          <a href="#summary" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">財務摘要</a>
          <a href="#analytics" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">支出分析</a>
          <a href="#departments" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">部門管理</a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleGoogleSheetsExport}
            disabled={isExportingSheets}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors whitespace-nowrap shadow-sm disabled:opacity-50"
            title={currentDept.targetSpreadsheetId ? "同步至指定的 Google Sheet" : "未指定試算表將自動新建"}
          >
            {isExportingSheets ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            <span>{isExportingSheets ? '同步中...' : (currentDept.targetSpreadsheetId ? '同步至指定 Google Sheet' : '匯出至 Google Sheets')}</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors whitespace-nowrap border border-emerald-200"
          >
            <Download className="w-4 h-4" />
            <span>匯出 Excel</span>
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>新增支出 / 撥補</span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">

        {/* Google Sheet Success Banner */}
        {sheetUrl && (
          <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold">成功同步至 Google Sheets！</p>
                <p className="text-xs text-emerald-700">資料已成功寫入指定的 Google 雲端試算表。</p>
              </div>
            </div>
            <a
              href={sheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
            >
              <span>開啟 Google Sheet</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        
        {/* Department Selector Tabs & Status Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-2">部門:</span>
            {departments.map(dept => (
              <button
                key={dept.id}
                onClick={() => setActiveDeptId(dept.id)}
                className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                  activeDeptId === dept.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {dept.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500">
              經辦人: <strong className="text-slate-800">{currentDept.custodian}</strong>
              {currentDept.targetSpreadsheetId && (
                <span className="ml-3 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  已綁定指定 Google Sheet
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setDeptFormData({
                  name: currentDept.name,
                  initialFund: currentDept.initialFund,
                  custodian: currentDept.custodian,
                  targetSpreadsheetId: currentDept.targetSpreadsheetId || ''
                });
                setIsDeptModalOpen(true);
              }}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="部門設定與指定 Google Sheet 綁定"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Low Balance Alert Banner */}
        {stats.isLow && (
          <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 shadow-xs">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-bold">零用金餘額偏低提醒 ({currentDept.name})</p>
                <p className="text-xs text-amber-700">目前餘額 NT$ {stats.currentBalance.toLocaleString()} 已低於設定額度之 20%，請儘速辦理零用金撥補申請。</p>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingTxId(null);
                setFormData({
                  date: new Date().toISOString().split('T')[0],
                  voucherNo: `R${Date.now().toString().slice(-8)}`,
                  invoiceNo: '',
                  vendor: '會計部撥補',
                  description: `${currentDept.name} 零用金定期撥補`,
                  category: '補充撥補',
                  type: 'replenishment',
                  amount: (currentDept.initialFund - stats.currentBalance).toString(),
                  custodian: currentDept.custodian,
                  handler: currentDept.custodian,
                  notes: '自動撥補申請',
                  receiptImage: ''
                });
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs whitespace-nowrap transition-colors"
            >
              立即申請撥補
            </button>
          </div>
        )}

        {/* KPI Summary Cards */}
        <div id="summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">期初零用金額度</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">NT$ {stats.initialFund.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-1">固定核定額度</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">目前即時餘額</p>
              <h3 className={`text-2xl font-bold mt-1 tabular-nums ${stats.currentBalance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                NT$ {stats.currentBalance.toLocaleString()}
              </h3>
              <p className="text-xs text-slate-400 mt-1">自動計算累計餘額</p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stats.isLow ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">本期累計支出</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1 tabular-nums">NT$ {stats.totalSpent.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-1">各項費用總計</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">本期累計撥補</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">NT$ {stats.totalReplenished.toLocaleString()}</h3>
              <p className="text-xs text-slate-400 mt-1">會計撥款總計</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filters and Search Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋摘要、單據/發票、經辦/經管人..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
            >
              <option value="ALL">所有類別</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={startDateFilter}
                onChange={e => setStartDateFilter(e.target.value)}
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span>至</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={e => setEndDateFilter(e.target.value)}
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              {(startDateFilter || endDateFilter) && (
                <button
                  onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }}
                  className="text-indigo-600 hover:underline ml-1"
                >
                  清除
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>列印報表</span>
            </button>
          </div>
        </div>

        {/* Transactions Ledger Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{currentDept.name} — 零用金明細紀錄</h2>
              <p className="text-xs text-slate-500">依照日期自動計算結餘，支援指定 Google Sheets 雲端同步。</p>
            </div>
            <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1 rounded-full border border-indigo-200">
              共 {transactionsWithBalance.length} 筆記錄
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/85 text-slate-500 text-xs font-semibold tracking-wider">
                  <th className="py-3 px-4">日期</th>
                  <th className="py-3 px-4">單據 / 發票號碼</th>
                  <th className="py-3 px-4">商家 / 摘要說明</th>
                  <th className="py-3 px-4">類別</th>
                  <th className="py-3 px-4 text-right">支出 (-)</th>
                  <th className="py-3 px-4 text-right">收入 (+)</th>
                  <th className="py-3 px-4 text-right">結餘 (Balance)</th>
                  <th className="py-3 px-4">經辦人</th>
                  <th className="py-3 px-4">資金經手人</th>
                  <th className="py-3 px-4 text-center">憑證</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {transactionsWithBalance.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      尚無零用金紀錄，點擊右上角「新增支出 / 撥補」開始記帳
                    </td>
                  </tr>
                ) : (
                  transactionsWithBalance.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{tx.date}</td>
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{tx.voucherNo}</div>
                        {tx.invoiceNo && <div className="text-indigo-600 text-[11px]">發票: {tx.invoiceNo}</div>}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">{tx.description}</div>
                        {tx.vendor && <div className="text-slate-400 text-[11px] truncate">廠商: {tx.vendor}</div>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                          tx.category === '補充撥補' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {tx.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-rose-600 tabular-nums">
                        {tx.spent > 0 ? `NT$ ${tx.spent.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-emerald-600 tabular-nums">
                        {tx.replenishment > 0 ? `NT$ ${tx.replenishment.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        NT$ {tx.balance.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{tx.custodian}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{tx.handler || tx.custodian}</td>
                      <td className="py-3 px-4 text-center">
                        {tx.receiptImage ? (
                          <button
                            onClick={() => {
                              const win = window.open();
                              win?.document.write(`<img src="${tx.receiptImage}" style="max-width:100%;"/>`);
                            }}
                            className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors inline-flex items-center gap-1 text-[11px]"
                            title="檢視收據"
                          >
                            <Receipt className="w-4 h-4" />
                            <span>檢視</span>
                          </button>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEditModal(tx)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="編輯"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTx(tx.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Financial Advisory Insights Section */}
        <div id="analytics" className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4" />
                <span>Gemini AI 智慧財務長與支出稽核</span>
              </div>
              <h3 className="text-xl font-bold">智慧分析與費用管控建議</h3>
              <p className="text-indigo-200 text-xs mt-1">一鍵分析近期各類別支出異常、預算消耗速度及節省優化建議。</p>
            </div>
            <button
              onClick={handleRunAiAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isAnalyzing ? 'AI 分析中...' : '執行 AI 智慧分析'}</span>
            </button>
          </div>

          {aiInsights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {aiInsights.map((item, idx) => (
                <div key={idx} className="bg-white/10 border border-white/10 p-5 rounded-2xl backdrop-blur-md space-y-2">
                  <div className="flex items-center gap-2 text-indigo-300 font-semibold text-xs">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/30 flex items-center justify-center text-[11px]">{idx + 1}</span>
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-indigo-100 leading-relaxed">{item.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-slate-200 bg-white text-center text-xs text-slate-500">
        部門零用金管理系統 &copy; 2026 · 具備自動結餘計算與指定 Google Sheets 雲端同步功能
      </footer>

      {/* Add / Edit Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingTxId ? '編輯零用金紀錄' : '新增支出 / 撥補'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* AI Receipt Upload Box */}
            {!editingTxId && (
              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>AI 智慧收據 / 發票自動辨識 (OCR)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>上傳發票圖片</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReceiptImageUpload}
                  />
                </div>
                {isScanning && (
                  <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium py-1 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gemini AI 正在解析收據與發票號碼...</span>
                  </div>
                )}
                {formData.receiptImage && !isScanning && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>發票圖片已成功上傳並自動填入發票號碼與金額！</span>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmitTx} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">交易類型</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'spent', category: formData.category === '補充撥補' ? '辦公文具' : formData.category })}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-colors ${
                        formData.type === 'spent' ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      支出 (-)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'replenishment', category: '補充撥補' })}
                      className={`py-2 text-xs font-semibold rounded-xl border transition-colors ${
                        formData.type === 'replenishment' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      撥補 (+)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">日期</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">單據編號</label>
                  <input
                    type="text"
                    required
                    value={formData.voucherNo}
                    onChange={e => setFormData({ ...formData, voucherNo: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">發票號碼 (選填)</label>
                  <input
                    type="text"
                    placeholder="例: AB12345678"
                    value={formData.invoiceNo}
                    onChange={e => setFormData({ ...formData, invoiceNo: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">費用類別</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">商家 / 供應商 (選填)</label>
                  <input
                    type="text"
                    placeholder="例: 7-ELEVEN, 台灣高鐵"
                    value={formData.vendor}
                    onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">金額 (NT$)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="請輸入金額"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">經辦人</label>
                  <input
                    type="text"
                    required
                    value={formData.custodian}
                    onChange={e => setFormData({ ...formData, custodian: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">資金經手人</label>
                  <input
                    type="text"
                    required
                    value={formData.handler}
                    onChange={e => setFormData({ ...formData, handler: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">備註 (選填)</label>
                  <input
                    type="text"
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">摘要 / 用途說明</label>
                <input
                  type="text"
                  required
                  placeholder="例: 購買辦公室文具與A4紙"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
                >
                  確認儲存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Department Settings Modal */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">部門設定與 Google Sheet 綁定</h3>
              <button onClick={() => setIsDeptModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={e => {
              e.preventDefault();
              setDepartments(departments.map(d => d.id === activeDeptId ? {
                ...d,
                name: deptFormData.name,
                initialFund: Number(deptFormData.initialFund),
                custodian: deptFormData.custodian,
                targetSpreadsheetId: deptFormData.targetSpreadsheetId.trim()
              } : d));
              setIsDeptModalOpen(false);
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">部門名稱</label>
                <input
                  type="text"
                  required
                  value={deptFormData.name}
                  onChange={e => setDeptFormData({ ...deptFormData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">期初核定零用金總額 (NT$)</label>
                <input
                  type="number"
                  required
                  value={deptFormData.initialFund}
                  onChange={e => setDeptFormData({ ...deptFormData, initialFund: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">預設經辦人 / 會計</label>
                <input
                  type="text"
                  required
                  value={deptFormData.custodian}
                  onChange={e => setDeptFormData({ ...deptFormData, custodian: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">指定 Google Sheet 網址或試算表 ID (選填)</label>
                <input
                  type="text"
                  placeholder="例: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5... 或 ID"
                  value={deptFormData.targetSpreadsheetId}
                  onChange={e => setDeptFormData({ ...deptFormData, targetSpreadsheetId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  若填寫指定的 Google Sheet 網址或 ID，同步時將直接寫入該試算表；若留空則會自動建立一個新的 Google Sheet。
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm"
                >
                  儲存設定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
