import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  BookOrder,
  BookOrderPaymentStatus,
  BookOrderSubject,
  BookStockInventory,
  SaveBookOrderInput,
} from '../types/models';
import {
  computeBookOrderStats,
  exportBookOrdersToExcel,
  exportBookOrdersToPdf,
  formatBookOrderDate,
  getBookSubjectLabel,
} from '../utils/bookOrderExport';

type OrderFilter = 'all' | 'pending' | 'done';
type EditableStockSubject = 'maths' | 'science' | 'social_science';

interface AdminBookOrdersTabProps {
  orders: BookOrder[];
  stock: BookStockInventory;
  isLiveSyncActive: boolean;
  isBusy: boolean;
  onSaveOrder: (input: SaveBookOrderInput) => Promise<void>;
  onToggleOrderStatus: (orderId: string, nextStatus: BookOrderPaymentStatus) => Promise<void>;
  onDeleteOrder: (order: BookOrder) => Promise<void>;
  onUpdateStock: (next: { maths: number; science: number; social_science: number }) => Promise<void>;
  onNotify?: (message: string, isError?: boolean) => void;
}

const SUBJECT_OPTIONS: Array<{ value: BookOrderSubject; label: string }> = [
  { value: 'maths', label: 'ગણિત' },
  { value: 'science', label: 'વિજ્ઞાન' },
  { value: 'social_science', label: 'સામાજિક વિજ્ઞાન' },
  { value: 'combo', label: 'કોમ્બો' },
];

export const AdminBookOrdersTab: React.FC<AdminBookOrdersTabProps> = ({
  orders,
  stock,
  isLiveSyncActive,
  isBusy,
  onSaveOrder,
  onToggleOrderStatus,
  onDeleteOrder,
  onUpdateStock,
  onNotify,
}) => {
  const formCardRef = useRef<HTMLFormElement | null>(null);

  // Add / Edit form state
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [subject, setSubject] = useState<BookOrderSubject>('maths');
  const [unitPriceInput, setUnitPriceInput] = useState('0');
  const [quantityInput, setQuantityInput] = useState('1');
  const [paymentStatus, setPaymentStatus] = useState<BookOrderPaymentStatus>('pending');
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Filter & Search state
  const [filter, setFilter] = useState<OrderFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick status toggle loading tracker
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Stock edit modal state
  const [editingStockSubject, setEditingStockSubject] = useState<EditableStockSubject | null>(null);
  const [stockDraftValue, setStockDraftValue] = useState('');
  const [isSavingStock, setIsSavingStock] = useState(false);

  // Delete confirmation modal state
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState<BookOrder | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  // Export busy indicator
  const [exportingType, setExportingType] = useState<'pdf' | 'excel' | null>(null);

  const stats = useMemo(() => computeBookOrderStats(orders, stock), [orders, stock]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter === 'pending' && order.paymentStatus !== 'pending') return false;
      if (filter === 'done' && order.paymentStatus !== 'done') return false;
      if (q) {
        const nameMatch = order.customerName.toLowerCase().includes(q);
        const subMatch = getBookSubjectLabel(order.subject).toLowerCase().includes(q);
        return nameMatch || subMatch;
      }
      return true;
    });
  }, [orders, filter, searchQuery]);

  const parsedUnitPrice = Math.max(0, Math.round(Number(unitPriceInput) || 0));
  const parsedQuantity = Math.max(1, Math.round(Number(quantityInput) || 1));
  const previewTotal = parsedUnitPrice * parsedQuantity;

  const resetForm = () => {
    setEditingOrderId(null);
    setCustomerName('');
    setSubject('maths');
    setUnitPriceInput('0');
    setQuantityInput('1');
    setPaymentStatus('pending');
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customerName.trim();
    if (!cleanName) {
      onNotify?.('કૃપા કરીને ગ્રાહકનું નામ દાખલ કરો.', true);
      return;
    }
    setIsSavingOrder(true);
    try {
      await onSaveOrder({
        ...(editingOrderId ? { id: editingOrderId } : {}),
        customerName: cleanName,
        subject,
        unitPrice: parsedUnitPrice,
        quantity: parsedQuantity,
        paymentStatus,
      });
      resetForm();
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleStartEditOrder = (order: BookOrder) => {
    setEditingOrderId(order.id);
    setCustomerName(order.customerName);
    setSubject(order.subject);
    setUnitPriceInput(String(order.unitPrice));
    setQuantityInput(String(order.quantity));
    setPaymentStatus(order.paymentStatus);
    formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleToggleStatus = async (order: BookOrder, nextStatus: BookOrderPaymentStatus) => {
    if (order.paymentStatus === nextStatus || togglingId === order.id) return;
    setTogglingId(order.id);
    try {
      await onToggleOrderStatus(order.id, nextStatus);
    } finally {
      setTogglingId(null);
    }
  };

  const openStockEditor = (target: EditableStockSubject) => {
    setEditingStockSubject(target);
    setStockDraftValue(String(stock[target]));
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStockSubject) return;
    const nextVal = Math.max(0, Math.min(1000000, Math.round(Number(stockDraftValue) || 0)));
    setIsSavingStock(true);
    try {
      await onUpdateStock({
        maths: editingStockSubject === 'maths' ? nextVal : stock.maths,
        science: editingStockSubject === 'science' ? nextVal : stock.science,
        social_science: editingStockSubject === 'social_science' ? nextVal : stock.social_science,
      });
      setEditingStockSubject(null);
    } finally {
      setIsSavingStock(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteOrder) return;
    setIsDeletingOrder(true);
    try {
      await onDeleteOrder(pendingDeleteOrder);
      if (editingOrderId === pendingDeleteOrder.id) {
        resetForm();
      }
      setPendingDeleteOrder(null);
    } finally {
      setIsDeletingOrder(false);
    }
  };

  const filterLabel =
    filter === 'all' ? 'બધા ઓર્ડર' : filter === 'done' ? 'Done (મળી ગયા)' : 'બાકી ઓર્ડર';

  const handleDownloadPdf = () => {
    setExportingType('pdf');
    try {
      const fileName = exportBookOrdersToPdf(filteredOrders, orders, stock, filterLabel);
      onNotify?.(`PDF રિપોર્ટ ડાઉનલોડ થયો: ${fileName}`);
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'PDF ડાઉનલોડ કરવામાં ભૂલ આવી.',
        true
      );
    } finally {
      setExportingType(null);
    }
  };

  const handleDownloadExcel = () => {
    setExportingType('excel');
    try {
      const fileName = exportBookOrdersToExcel(filteredOrders, orders, stock, filterLabel);
      onNotify?.(`Excel ફાઈલ ડાઉનલોડ થઈ: ${fileName}`);
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Excel ડાઉનલોડ કરવામાં ભૂલ આવી.',
        true
      );
    } finally {
      setExportingType(null);
    }
  };

  const stockRows: Array<{
    key: EditableStockSubject;
    label: string;
    ordered: number;
    total: number;
    inStock: number;
  }> = [
    {
      key: 'maths',
      label: 'ગણિત',
      ordered: stats.orderedMaths,
      total: stock.maths,
      inStock: stats.inStockMaths,
    },
    {
      key: 'science',
      label: 'વિજ્ઞાન',
      ordered: stats.orderedScience,
      total: stock.science,
      inStock: stats.inStockScience,
    },
    {
      key: 'social_science',
      label: 'સામાજિક વિજ્ઞાન',
      ordered: stats.orderedSocial,
      total: stock.social_science,
      inStock: stats.inStockSocial,
    },
  ];

  return (
    <section className="max-w-3xl mx-auto px-3 sm:px-4 py-4 pb-12 space-y-4">
      {/* Header + Live Sync + PDF / Excel Download Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] flex items-center gap-2">
            <span aria-hidden="true">📚</span>
            <span>બુક ઓર્ડર મેનેજમેન્ટ</span>
          </h2>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-[#475569] dark:text-[#94A3B8]">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isLiveSyncActive ? 'bg-[#22C55E] animate-pulse' : 'bg-[#F59E0B]'
              }`}
            />
            <span>{isLiveSyncActive ? 'લાઇવ સિંક ચાલુ' : 'ઓફલાઇન / સિંક થોભેલ'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="book_orders_export_pdf_btn"
            disabled={exportingType !== null}
            onClick={handleDownloadPdf}
            className="flex-1 sm:flex-none min-h-[44px] px-3.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>{exportingType === 'pdf' ? 'બને છે...' : 'PDF ડાઉનલોડ'}</span>
          </button>
          <button
            type="button"
            data-testid="book_orders_export_excel_btn"
            disabled={exportingType !== null}
            onClick={handleDownloadExcel}
            className="flex-1 sm:flex-none min-h-[44px] px-3.5 rounded-xl bg-[#047857] hover:bg-[#065F46] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            <span>{exportingType === 'excel' ? 'બને છે...' : 'Excel ડાઉનલોડ'}</span>
          </button>
        </div>
      </div>

      {/* Top 3 KPI Summary Cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div
          data-testid="book_kpi_total"
          className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] px-2.5 py-3.5 text-center shadow-xs"
        >
          <p className="text-[11px] sm:text-xs font-bold text-[#64748B] dark:text-[#94A3B8]">
            કુલ ઓર્ડર
          </p>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
            ₹{stats.totalAmount}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums">
            {stats.totalOrders} ઓર્ડર · {stats.totalBooks} બુક
          </p>
        </div>

        <div
          data-testid="book_kpi_done"
          className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] px-2.5 py-3.5 text-center shadow-xs"
        >
          <p className="text-[11px] sm:text-xs font-bold text-[#64748B] dark:text-[#94A3B8]">
            મળી ગયા (Done)
          </p>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-[#047857] dark:text-[#34D399] tabular-nums">
            ₹{stats.doneAmount}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums">
            {stats.doneOrders} ઓર્ડર · {stats.doneBooks} બુક
          </p>
        </div>

        <div
          data-testid="book_kpi_pending"
          className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] px-2.5 py-3.5 text-center shadow-xs"
        >
          <p className="text-[11px] sm:text-xs font-bold text-[#64748B] dark:text-[#94A3B8]">
            બાકી
          </p>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-[#D97706] dark:text-[#FBBF24] tabular-nums">
            ₹{stats.pendingAmount}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums">
            {stats.pendingOrders} ઓર્ડર · {stats.pendingBooks} બુક
          </p>
        </div>
      </div>

      {/* Live Stock Inventory Card */}
      <div
        data-testid="book_stock_card"
        className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 shadow-xs"
      >
        <div className="flex items-center gap-2 pb-3 border-b border-[#F1F5F9] dark:border-[#334155]">
          <span aria-hidden="true" className="text-lg">
            📦
          </span>
          <h3 className="text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">સ્ટોક</h3>
        </div>

        <div className="divide-y divide-[#F1F5F9] dark:divide-[#334155]">
          {stockRows.map((row) => (
            <div
              key={row.key}
              className="py-3.5 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                  {row.label}
                </p>
                <p className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums mt-0.5">
                  ઓર્ડર: {row.ordered} · કુલ સ્ટોક: {row.total}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className={`text-sm sm:text-base font-extrabold tabular-nums ${
                    row.inStock < 0
                      ? 'text-[#DC2626] dark:text-[#FCA5A5]'
                      : row.inStock <= 20
                        ? 'text-[#D97706] dark:text-[#FBBF24]'
                        : 'text-[#047857] dark:text-[#34D399]'
                  }`}
                >
                  સ્ટોકમાં {row.inStock}
                </span>
                <button
                  type="button"
                  data-testid={`book_stock_edit_${row.key}`}
                  onClick={() => openStockEditor(row.key)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#EFF4FA] dark:hover:bg-slate-800 border border-[#E2E8F0] dark:border-[#334155] text-xs font-extrabold text-[#DC2626] dark:text-[#FCA5A5] cursor-pointer transition-colors"
                >
                  સુધારો
                </button>
              </div>
            </div>
          ))}

          {/* Combo Row */}
          <div className="pt-3.5 pb-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC]">
                કોમ્બો
              </p>
              <p className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums mt-0.5">
                ઓર્ડર: {stats.orderedCombo}
              </p>
            </div>
            <span className="text-sm font-extrabold text-[#047857] dark:text-[#34D399] shrink-0">
              ત્રણેયમાંથી ઘટે
            </span>
          </div>
        </div>
      </div>

      {/* Add / Edit Book Order Form Card */}
      <form
        ref={formCardRef}
        onSubmit={(e) => void handleSubmitOrder(e)}
        data-testid="book_order_form"
        className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 space-y-3.5 shadow-xs"
      >
        {editingOrderId && (
          <div className="rounded-xl bg-[#EFF6FF] dark:bg-[#1E3A8A]/30 border border-[#BFDBFE] dark:border-[#1D4ED8] px-3 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[#1E3A8A] dark:text-[#93C5FD]">
            <span>ઓર્ડર સુધારો મોડ ચાલુ છે</span>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 underline cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>રદ કરો</span>
            </button>
          </div>
        )}

        <div>
          <label
            htmlFor="book-order-customer-name"
            className="block text-xs font-bold text-[#64748B] dark:text-[#94A3B8] mb-1.5"
          >
            નામ
          </label>
          <input
            id="book-order-customer-name"
            data-testid="book_order_name_input"
            type="text"
            maxLength={80}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="ગ્રાહકનું નામ"
            className="w-full h-12 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F1F5F9] dark:bg-[#0F172A] px-3.5 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] outline-none focus:border-[#2563EB] focus:bg-white dark:focus:bg-[#0F172A]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="book-order-subject"
              className="block text-xs font-bold text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              વિષય
            </label>
            <select
              id="book-order-subject"
              data-testid="book_order_subject_select"
              value={subject}
              onChange={(e) => setSubject(e.target.value as BookOrderSubject)}
              className="w-full h-12 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F1F5F9] dark:bg-[#0F172A] px-3 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] outline-none focus:border-[#2563EB]"
            >
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="book-order-price"
              className="block text-xs font-bold text-[#64748B] dark:text-[#94A3B8] mb-1.5"
            >
              એક બુકની કિંમત (₹)
            </label>
            <input
              id="book-order-price"
              data-testid="book_order_price_input"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              value={unitPriceInput}
              onFocus={() => {
                if (unitPriceInput === '0') setUnitPriceInput('');
              }}
              onBlur={() => {
                if (!unitPriceInput.trim()) setUnitPriceInput('0');
              }}
              onChange={(e) => setUnitPriceInput(e.target.value)}
              className="w-full h-12 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F1F5F9] dark:bg-[#0F172A] px-3.5 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] outline-none focus:border-[#2563EB] tabular-nums"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="book-order-qty"
            className="block text-xs font-bold text-[#64748B] dark:text-[#94A3B8] mb-1.5"
          >
            બુકની સંખ્યા
          </label>
          <input
            id="book-order-qty"
            data-testid="book_order_qty_input"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            value={quantityInput}
            onBlur={() => {
              const n = Math.round(Number(quantityInput) || 1);
              setQuantityInput(String(Math.max(1, n)));
            }}
            onChange={(e) => setQuantityInput(e.target.value)}
            className="w-full h-12 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-[#F1F5F9] dark:bg-[#0F172A] px-3.5 text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] outline-none focus:border-[#2563EB] tabular-nums"
          />
          {previewTotal > 0 && (
            <p className="mt-1.5 text-xs font-bold text-[#1E3A8A] dark:text-[#93C5FD] tabular-nums">
              કુલ રકમ: ₹{parsedUnitPrice} × {parsedQuantity} = ₹{previewTotal}
            </p>
          )}
        </div>

        <div>
          <span className="block text-xs font-bold text-[#64748B] dark:text-[#94A3B8] mb-1.5">
            પેમેન્ટ
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="book_order_status_pending_btn"
              onClick={() => setPaymentStatus('pending')}
              className={`h-12 rounded-xl text-sm font-extrabold border transition-colors cursor-pointer ${
                paymentStatus === 'pending'
                  ? 'bg-[#FEF3C7] dark:bg-[#451A03] border-[#D97706] text-[#92400E] dark:text-[#FDE68A]'
                  : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              બાકી
            </button>
            <button
              type="button"
              data-testid="book_order_status_done_btn"
              onClick={() => setPaymentStatus('done')}
              className={`h-12 rounded-xl text-sm font-extrabold border transition-colors cursor-pointer ${
                paymentStatus === 'done'
                  ? 'bg-[#D1FAE5] dark:bg-[#064E3B] border-[#059669] text-[#065F46] dark:text-[#A7F3D0]'
                  : 'bg-[#F8FAFC] dark:bg-[#0F172A] border-[#E2E8F0] dark:border-[#334155] text-[#475569] dark:text-[#94A3B8]'
              }`}
            >
              Done
            </button>
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          {editingOrderId && (
            <button
              type="button"
              onClick={resetForm}
              className="h-12 px-4 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-sm font-bold cursor-pointer"
            >
              રદ કરો
            </button>
          )}
          <button
            type="submit"
            data-testid="book_order_submit_btn"
            disabled={isSavingOrder || isBusy}
            className="flex-1 h-12 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm sm:text-base font-extrabold shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isSavingOrder
              ? 'સેવ થઈ રહ્યું છે...'
              : editingOrderId
                ? 'ફેરફાર સાચવો'
                : 'ઓર્ડર ઉમેરો'}
          </button>
        </div>
      </form>

      {/* Filter Pills: બધા | બાકી | Done */}
      <div className="grid grid-cols-3 gap-2.5">
        {(
          [
            { id: 'all', label: `બધા (${orders.length})` },
            { id: 'pending', label: `બાકી (${stats.pendingOrders})` },
            { id: 'done', label: `Done (${stats.doneOrders})` },
          ] as const
        ).map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`book_filter_${tab.id}`}
              onClick={() => setFilter(tab.id)}
              className={`min-h-[44px] rounded-full text-xs sm:text-sm font-extrabold border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-xs'
                  : 'bg-white dark:bg-[#1E293B] border-[#E2E8F0] dark:border-[#334155] text-[#334155] dark:text-[#CBD5E1] hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Quick Search Box when orders exist */}
      {orders.length > 0 && (
        <div className="relative">
          <Search className="h-4 w-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ગ્રાહક કે શાળાના નામથી શોધો..."
            className="w-full h-11 rounded-xl border border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] pl-10 pr-9 text-xs sm:text-sm font-semibold outline-none focus:border-[#2563EB]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-8 text-center space-y-2">
          <Download className="h-8 w-8 mx-auto text-[#94A3B8]" />
          <p className="text-sm font-extrabold text-[#334155] dark:text-[#E2E8F0]">
            {orders.length === 0
              ? 'હજુ સુધી કોઈ બુક ઓર્ડર ઉમેરાયો નથી.'
              : 'આ ફિલ્ટરમાં કોઈ ઓર્ડર મળ્યો નથી.'}
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            ઉપરના ફોર્મમાંથી નવો બુક ઓર્ડર ઉમેરો અને PDF અથવા Excel રિપોર્ટ ડાઉનલોડ કરો.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isDone = order.paymentStatus === 'done';
            const isToggling = togglingId === order.id;
            return (
              <div
                key={order.id}
                data-testid={`book_order_card_${order.id}`}
                className="rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-4 shadow-xs flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-extrabold text-[#0F172A] dark:text-[#F8FAFC] break-words">
                    {order.customerName}
                  </p>
                  <p className="mt-0.5 text-xs sm:text-sm font-semibold text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                    {getBookSubjectLabel(order.subject)} · ₹{order.unitPrice} × {order.quantity} = ₹
                    {order.totalAmount}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">
                    {formatBookOrderDate(order)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* Inline Quick Toggle: બાકી | ✓ Done */}
                  <div className="inline-flex rounded-full bg-[#F1F5F9] dark:bg-[#0F172A] p-0.5 border border-[#E2E8F0] dark:border-[#334155]">
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => void handleToggleStatus(order, 'pending')}
                      className={`min-h-[36px] px-3 rounded-full text-xs font-extrabold transition-colors cursor-pointer ${
                        !isDone
                          ? 'bg-[#FEF3C7] dark:bg-[#78350F] text-[#92400E] dark:text-[#FDE68A] shadow-xs'
                          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                      }`}
                    >
                      બાકી
                    </button>
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => void handleToggleStatus(order, 'done')}
                      className={`min-h-[36px] px-3 rounded-full text-xs font-extrabold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                        isDone
                          ? 'bg-[#DCFCE7] dark:bg-[#064E3B] text-[#047857] dark:text-[#6EE7B7] shadow-xs'
                          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A]'
                      }`}
                    >
                      {isDone && <Check className="h-3.5 w-3.5" />}
                      <span>Done</span>
                    </button>
                  </div>

                  {/* Edit & Delete buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStartEditOrder(order)}
                      className="min-h-[36px] px-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-[#EFF4FA] dark:hover:bg-slate-800 border border-[#E2E8F0] dark:border-[#334155] text-xs font-bold text-[#DC2626] dark:text-[#FCA5A5] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>સુધારો</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteOrder(order)}
                      className="min-h-[36px] px-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0F172A] hover:bg-red-50 dark:hover:bg-red-950/40 border border-[#E2E8F0] dark:border-[#334155] text-xs font-bold text-[#DC2626] dark:text-[#FCA5A5] cursor-pointer"
                    >
                      કાઢો
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stock Total Edit Modal */}
      {editingStockSubject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingStockSubject(null)}
        >
          <form
            onSubmit={(e) => void handleSaveStock(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold">
                📦 {getBookSubjectLabel(editingStockSubject)} — કુલ સ્ટોક સુધારો
              </h3>
              <button
                type="button"
                onClick={() => setEditingStockSubject(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label
                htmlFor="book-stock-value-input"
                className="block text-xs font-bold text-[#64748B] dark:text-[#94A3B8] mb-1.5"
              >
                કુલ સ્ટોક (બુકની સંખ્યા)
              </label>
              <input
                id="book-stock-value-input"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000000}
                autoFocus
                value={stockDraftValue}
                onChange={(e) => setStockDraftValue(e.target.value)}
                className="w-full h-12 rounded-xl border border-[#CBD5E1] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#0F172A] px-3.5 text-base font-extrabold tabular-nums outline-none focus:border-[#2563EB]"
              />
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditingStockSubject(null)}
                className="flex-1 h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold cursor-pointer"
              >
                રદ કરો
              </button>
              <button
                type="submit"
                disabled={isSavingStock}
                className="flex-1 h-11 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-extrabold disabled:opacity-60 cursor-pointer"
              >
                {isSavingStock ? 'સેવ થાય છે...' : 'સ્ટોક સાચવો'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {pendingDeleteOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingDeleteOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-[#DC2626] dark:text-[#FCA5A5]">
              ઓર્ડર કાઢી નાખવો છે?
            </h3>
            <div className="rounded-2xl bg-[#F8FAFC] dark:bg-[#0F172A] p-3 text-xs space-y-1">
              <p className="font-extrabold text-sm">{pendingDeleteOrder.customerName}</p>
              <p className="text-[#64748B] dark:text-[#94A3B8] tabular-nums">
                {getBookSubjectLabel(pendingDeleteOrder.subject)} · ₹{pendingDeleteOrder.unitPrice}{' '}
                × {pendingDeleteOrder.quantity} = ₹{pendingDeleteOrder.totalAmount}
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setPendingDeleteOrder(null)}
                className="flex-1 h-11 rounded-xl border border-[#CBD5E1] dark:border-[#334155] text-xs font-bold cursor-pointer"
              >
                રદ કરો
              </button>
              <button
                type="button"
                disabled={isDeletingOrder}
                onClick={() => void handleConfirmDelete()}
                className="flex-1 h-11 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>{isDeletingOrder ? 'કાઢે છે...' : 'હા, કાઢી નાખો'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
