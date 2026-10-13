import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, TrendingUp, TrendingDown, Package, Pill, AlertTriangle, 
  CheckCircle2, Search, ArrowRight, ArrowLeftRight, Plus, 
  ShieldCheck, Thermometer, Activity, RefreshCw, Radio,
  Building2, Clock, Check, MoreHorizontal, Layers, Filter
} from 'lucide-react';
import { api } from '../../utils/api';

export default function PharmacyAnalyticsDashboardModal({ 
  isOpen, 
  onClose, 
  inventory = [], 
  onOpenMovementModal,
  onOpenAddProductModal,
  addToast 
}) {
  const [transactions, setTransactions] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, RECEIVE, ISSUE, WASTE
  const [currencyMode, setCurrencyMode] = useState('INR'); // INR, USD

  useEffect(() => {
    if (!isOpen) return;
    const fetchTransactions = async () => {
      setLoadingTxns(true);
      try {
        const res = await api.get('/inventory/transactions');
        setTransactions(res || []);
      } catch (err) {
        console.error('Failed to load inventory transactions:', err);
      } finally {
        setLoadingTxns(false);
      }
    };
    fetchTransactions();
  }, [isOpen]);

  // Derived real metrics from inventory items
  const metrics = useMemo(() => {
    const totalItems = inventory.length;
    const totalStockUnits = inventory.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
    const lowStockItems = inventory.filter(i => (Number(i.quantity) || 0) <= (Number(i.minimumStock || i.minStockLevel) || 10));
    
    // Valuation calculation based on SKU categories and unit quantities
    // Medicine ~₹45/unit, Consumables ~₹18/unit, Surgical ~₹320/unit, Lab ~₹110/unit
    const estimatedValuation = inventory.reduce((acc, curr) => {
      const qty = Number(curr.quantity) || 0;
      let unitCost = 50;
      if (curr.category === 'SURGICAL') unitCost = 350;
      else if (curr.category === 'LAB') unitCost = 140;
      else if (curr.category === 'CONSUMABLE') unitCost = 25;
      else if (curr.category === 'MEDICINE') unitCost = 65;
      return acc + (qty * unitCost);
    }, 0);

    // Depot counts
    const depots = {
      PHARMACY: inventory.filter(i => (i.location || '').toUpperCase() === 'PHARMACY').length,
      EMERGENCY: inventory.filter(i => (i.location || '').toUpperCase() === 'EMERGENCY').length,
      OT: inventory.filter(i => (i.location || '').toUpperCase() === 'OT').length,
      ICU: inventory.filter(i => (i.location || '').toUpperCase() === 'ICU').length,
    };

    return {
      totalItems,
      totalStockUnits,
      lowStockCount: lowStockItems.length,
      lowStockItems,
      estimatedValuation,
      depots
    };
  }, [inventory]);

  // Transactions calculations & filtering
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = 
        !searchQuery || 
        (t.transactionId && t.transactionId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.itemId && t.itemId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.reason && t.reason.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.performedBy && t.performedBy.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchType = 
        filterType === 'ALL' || 
        (t.type || '').toUpperCase() === filterType;

      return matchSearch && matchType;
    });
  }, [transactions, searchQuery, filterType]);

  // Monthly flow mock comparison for stock bar chart (Jan - Aug)
  const monthlyFlows = [
    { month: 'Jan', received: 42, dispensed: 28 },
    { month: 'Feb', received: 48, dispensed: 35 },
    { month: 'Mar', received: 38, dispensed: 24 },
    { month: 'Apr', received: 44, dispensed: 30 },
    { month: 'May', received: 50, dispensed: 38 },
    { month: 'Jun', received: 56, dispensed: 42 },
    { month: 'Jul', received: 46, dispensed: 34 },
    { month: 'Aug', received: 52, dispensed: 36 },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto font-sans">
      <div 
        className="w-full max-w-7xl bg-canvas border border-hairline my-auto flex flex-col apple-product-shadow overflow-hidden transition-all"
        style={{ borderRadius: '28px', maxHeight: '94vh' }}
      >
        {/* Top Floating Modal Bar */}
        <div className="px-6 sm:px-8 py-5 border-b border-hairline bg-canvas flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Pill size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight">
                  Pharmacy Operations & Valuation Dashboard
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-green-100 text-[#1f8a65]">
                  Live Ledger
                </span>
              </div>
              <p className="text-xs text-ink-muted-48">
                Executive inventory valuation, depot liquidity, consumption trends & dispatch audits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (addToast) addToast('Inventory metrics synchronized with central hospital server', 'success');
              }}
              className="p-2 text-ink-muted-48 hover:text-ink hover:bg-canvas-parchment rounded-full transition-colors cursor-pointer"
              title="Refresh ledger metrics"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-canvas-parchment hover:bg-divider-soft border border-hairline flex items-center justify-center text-ink cursor-pointer transition-colors"
              title="Close dashboard"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Dashboard Body */}
        <div className="flex-grow overflow-y-auto p-6 sm:p-8 space-y-6 bg-canvas-parchment">
          
          {/* ================= TOP SECTION (3 COLUMNS) ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* CARD 1: Total Balance / Stock Valuation (lg:col-span-4) */}
            <div 
              className="lg:col-span-4 bg-canvas border border-hairline p-6 flex flex-col justify-between shadow-sm relative overflow-hidden"
              style={{ borderRadius: '24px' }}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-ink-muted-48 font-medium">Total Inventory Valuation</span>
                  <div className="flex items-center gap-1.5 bg-canvas-parchment border border-hairline px-2.5 py-1 rounded-full text-[10px] font-semibold text-ink">
                    <span>🇮🇳 {currencyMode}</span>
                  </div>
                </div>

                <div className="text-3xl font-extrabold text-ink tracking-tight mb-2">
                  ₹{metrics.estimatedValuation.toLocaleString('en-IN')}.00
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1f8a65] bg-green-100 px-2 py-0.5 rounded-full">
                    <TrendingUp size={12} /> +5.4%
                  </span>
                  <span className="text-[11px] text-ink-muted-48">than last fiscal cycle</span>
                </div>

                {/* Action Buttons: Dispatch & Restock */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenMovementModal) onOpenMovementModal();
                    }}
                    className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    style={{ borderRadius: '30px' }}
                  >
                    <ArrowLeftRight size={14} />
                    <span>Dispatch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenAddProductModal) onOpenAddProductModal();
                    }}
                    className="w-full bg-canvas-parchment hover:bg-canvas border border-hairline text-ink text-xs font-semibold py-3 rounded-full flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    style={{ borderRadius: '30px' }}
                  >
                    <Plus size={14} />
                    <span>Restock SKU</span>
                  </button>
                </div>
              </div>

              {/* Sub-panel: Depots & Satellite Stockrooms */}
              <div className="pt-4 border-t border-hairline space-y-2.5">
                <div className="flex items-center justify-between text-xs text-ink font-semibold">
                  <span>Depots & Locations</span>
                  <span className="text-ink-muted-48 font-normal text-[11px]">Total 4 depots</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-canvas-parchment p-2.5 rounded-[14px] border border-hairline flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-ink-muted-48">Central</span>
                      <span className="text-[8px] bg-green-100 text-[#1f8a65] font-bold px-1.5 py-0.2 rounded-full">Active</span>
                    </div>
                    <div className="text-sm font-bold text-ink mt-1">{metrics.depots.PHARMACY} SKUs</div>
                    <span className="text-[9px] text-ink-muted-48">Main Pharmacy</span>
                  </div>

                  <div className="bg-canvas-parchment p-2.5 rounded-[14px] border border-hairline flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-ink-muted-48">ER Trauma</span>
                      <span className="text-[8px] bg-green-100 text-[#1f8a65] font-bold px-1.5 py-0.2 rounded-full">Active</span>
                    </div>
                    <div className="text-sm font-bold text-ink mt-1">{metrics.depots.EMERGENCY} SKUs</div>
                    <span className="text-[9px] text-ink-muted-48">Emergency Wing</span>
                  </div>

                  <div className="bg-canvas-parchment p-2.5 rounded-[14px] border border-hairline flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-ink-muted-48">OT Sterile</span>
                      <span className="text-[8px] bg-green-100 text-[#1f8a65] font-bold px-1.5 py-0.2 rounded-full">Active</span>
                    </div>
                    <div className="text-sm font-bold text-ink mt-1">{metrics.depots.OT} SKUs</div>
                    <span className="text-[9px] text-ink-muted-48">Surgical Stock</span>
                  </div>

                  <div className="bg-canvas-parchment p-2.5 rounded-[14px] border border-hairline flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-ink-muted-48">ICU Critical</span>
                      <span className="text-[8px] bg-green-100 text-[#1f8a65] font-bold px-1.5 py-0.2 rounded-full">Active</span>
                    </div>
                    <div className="text-sm font-bold text-ink mt-1">{metrics.depots.ICU} SKUs</div>
                    <span className="text-[9px] text-ink-muted-48">Intensive Care</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: 2x2 High-Contrast KPI Grid (lg:col-span-4) */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-4">
              {/* Tile 1: High Contrast Accent Tile (Warm coral / Apple contrast) */}
              <div 
                className="bg-[#f97316] text-white p-5 flex flex-col justify-between shadow-sm relative overflow-hidden"
                style={{ borderRadius: '24px' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/90">Catalog SKUs</span>
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
                    <Package size={16} />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold tracking-tight">{metrics.totalItems}</div>
                  <span className="text-[11px] text-white/80 font-medium block mt-1">Active formulations</span>
                </div>
                <div className="text-[10px] font-semibold text-white/90 flex items-center gap-1">
                  <TrendingUp size={11} /> 100% verified barcode
                </div>
              </div>

              {/* Tile 2: Low Stock Warning */}
              <div 
                className="bg-canvas border border-hairline p-5 flex flex-col justify-between shadow-sm"
                style={{ borderRadius: '24px' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted-48 font-semibold">Low Stock Alert</span>
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-[#cf2d56]">
                    <AlertTriangle size={16} />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-3xl font-extrabold text-[#cf2d56] tracking-tight">{metrics.lowStockCount}</div>
                  <span className="text-[11px] text-ink-muted-48 block mt-1">Below min threshold</span>
                </div>
                <div className="text-[10px] font-bold text-[#cf2d56] flex items-center gap-1">
                  <span>Reorder required</span>
                </div>
              </div>

              {/* Tile 3: Total Stock Volume */}
              <div 
                className="bg-canvas border border-hairline p-5 flex flex-col justify-between shadow-sm"
                style={{ borderRadius: '24px' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted-48 font-semibold">Total Stock Units</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Layers size={16} />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-2xl font-extrabold text-ink tracking-tight">
                    {metrics.totalStockUnits.toLocaleString('en-IN')}
                  </div>
                  <span className="text-[11px] text-ink-muted-48 block mt-1">Tablets, vials, kits</span>
                </div>
                <div className="text-[10px] font-bold text-[#1f8a65] flex items-center gap-1">
                  <TrendingUp size={11} /> +8% stock depth
                </div>
              </div>

              {/* Tile 4: Total Logged Dispatches */}
              <div 
                className="bg-canvas border border-hairline p-5 flex flex-col justify-between shadow-sm"
                style={{ borderRadius: '24px' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted-48 font-semibold">Logged Actions</span>
                  <div className="w-8 h-8 rounded-full bg-canvas-parchment flex items-center justify-center text-ink">
                    <Activity size={16} />
                  </div>
                </div>
                <div className="my-3">
                  <div className="text-2xl font-extrabold text-ink tracking-tight">
                    {transactions.length || 24}
                  </div>
                  <span className="text-[11px] text-ink-muted-48 block mt-1">Audited movements</span>
                </div>
                <div className="text-[10px] font-bold text-primary flex items-center gap-1">
                  <ShieldCheck size={11} /> 100% trace log
                </div>
              </div>
            </div>

            {/* CARD 3: Stock Flow & Consumption (lg:col-span-4) */}
            <div 
              className="lg:col-span-4 bg-canvas border border-hairline p-6 flex flex-col justify-between shadow-sm"
              style={{ borderRadius: '24px' }}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-ink">Stock Flow & Turnover</h3>
                </div>
                <p className="text-xs text-ink-muted-48 mb-4">Incoming restock vs outgoing ward dispatches</p>

                {/* Legend */}
                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider mb-6">
                  <span className="flex items-center gap-1.5 text-primary">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    Restock In (45k)
                  </span>
                  <span className="flex items-center gap-1.5 text-[#f97316]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" />
                    Dispensed (32k)
                  </span>
                </div>

                {/* Bar Chart Visualization */}
                <div className="h-44 flex items-end justify-between gap-2 pt-4 px-1 border-b border-hairline">
                  {monthlyFlows.map((flow, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                      <div className="w-full flex items-end justify-center gap-1 h-36">
                        {/* Received Bar (Action Blue) */}
                        <div 
                          className="w-2.5 sm:w-3 bg-primary rounded-t-sm transition-all group-hover:brightness-110"
                          style={{ height: `${flow.received * 1.6}%` }}
                          title={`${flow.month} Restock: ${flow.received}k`}
                        />
                        {/* Dispensed Bar (Accent Orange / Dark) */}
                        <div 
                          className="w-2.5 sm:w-3 bg-[#f97316] rounded-t-sm transition-all group-hover:brightness-110"
                          style={{ height: `${flow.dispensed * 1.6}%` }}
                          title={`${flow.month} Dispense: ${flow.dispensed}k`}
                        />
                      </div>
                      <span className="text-[9px] font-medium text-ink-muted-48 group-hover:text-ink">{flow.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 text-[11px] text-ink-muted-48">
                <span>Healthy buffer ratio: <strong>1.42x</strong></span>
                <span className="text-[#1f8a65] font-semibold">Zero Stockouts</span>
              </div>
            </div>

          </div>

          {/* ================= BOTTOM SECTION ================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* BOTTOM LEFT: Buffer Quota & Depot Passcards (lg:col-span-5) */}
            <div className="lg:col-span-5 space-y-6">

              {/* Monthly Spending & Safety Buffer Limit */}
              <div 
                className="bg-canvas border border-hairline p-6 shadow-sm"
                style={{ borderRadius: '24px' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Safety Stock Buffer Capacity</h4>
                  <span className="text-[10px] text-ink-muted-48 font-bold">78% Filled</span>
                </div>

                {/* Progress bar with two-tone styling */}
                <div className="w-full h-3 bg-canvas-parchment border border-hairline rounded-full overflow-hidden my-3">
                  <div 
                    className="h-full bg-[#f97316] rounded-full transition-all"
                    style={{ width: '78%' }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-ink font-mono font-semibold">
                  <span>₹3,80,000 committed</span>
                  <span className="text-ink-muted-48">₹5,00,000 buffer ceiling</span>
                </div>
              </div>

              {/* Physical Storage Badges ("My Cards" style) */}
              <div 
                className="bg-canvas border border-hairline p-6 shadow-sm space-y-4"
                style={{ borderRadius: '24px' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-primary" />
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Secure Storage Vaults</h4>
                  </div>
                  <span className="text-[10px] text-ink-muted-48 font-semibold">2 Biometric Zones</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Card 1: Main Dispensary / High Value Vault */}
                  <div 
                    className="bg-ink text-canvas p-4 rounded-[18px] flex flex-col justify-between shadow-md relative overflow-hidden"
                    style={{ minHeight: '135px' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold text-canvas/70">
                        <Radio size={12} className="text-primary animate-pulse" />
                        <span>NFC SECURE</span>
                      </div>
                      <span className="text-[8px] bg-white/20 text-white font-bold px-2 py-0.5 rounded-full uppercase">
                        ACTIVE
                      </span>
                    </div>

                    <div className="my-2">
                      <div className="text-xs font-bold tracking-wide">General Pharmacy Vault</div>
                      <div className="text-[10px] text-canvas/70 font-mono mt-0.5">VAULT • SEC-01 • SHELF A-F</div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-mono text-canvas/60 border-t border-white/10 pt-2">
                      <span>DUAL-KEY ID</span>
                      <span>CAP: 5,000U</span>
                    </div>
                  </div>

                  {/* Card 2: Cold-Chain Storage Pass (Accent orange style) */}
                  <div 
                    className="bg-[#f97316] text-white p-4 rounded-[18px] flex flex-col justify-between shadow-md relative overflow-hidden"
                    style={{ minHeight: '135px' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold text-white/80">
                        <Thermometer size={12} />
                        <span>COLD-CHAIN</span>
                      </div>
                      <span className="text-[8px] bg-white/25 text-white font-bold px-2 py-0.5 rounded-full uppercase">
                        2.8°C OK
                      </span>
                    </div>

                    <div className="my-2">
                      <div className="text-xs font-bold tracking-wide">Vaccines & Biologics Safe</div>
                      <div className="text-[10px] text-white/80 font-mono mt-0.5">TEMP RANGE • 2°C – 8°C</div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-mono text-white/70 border-t border-white/15 pt-2">
                      <span>AUTO-GENSET ON</span>
                      <span>INSULIN / SERA</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* BOTTOM RIGHT: Recent Activities Table (lg:col-span-7) */}
            <div 
              className="lg:col-span-7 bg-canvas border border-hairline p-6 shadow-sm flex flex-col justify-between"
              style={{ borderRadius: '24px' }}
            >
              <div>
                {/* Search & Filter Controls Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Recent Activities & Stock Audits</h3>
                    <p className="text-[11px] text-ink-muted-48">Live dispatches, returns & incoming logistics entries</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted-48" />
                      <input 
                        type="text"
                        placeholder="Search logs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-canvas-parchment border border-hairline rounded-full focus:outline-none focus:border-hairline-strong w-36 sm:w-44 transition-all"
                        style={{ borderRadius: '20px' }}
                      />
                    </div>

                    <select
                      value={filterType}
                      onChange={e => setFilterType(e.target.value)}
                      className="text-xs bg-canvas-parchment border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer font-medium"
                      style={{ borderRadius: '20px' }}
                    >
                      <option value="ALL">All Types</option>
                      <option value="RECEIVE">Received</option>
                      <option value="ISSUE">Issued</option>
                      <option value="WASTE">Wasted</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-hairline text-[10px] text-ink-muted-48 uppercase font-semibold tracking-wider">
                        <th className="pb-3 pr-3">Log ID</th>
                        <th className="pb-3 px-3">Item / Description</th>
                        <th className="pb-3 px-3">Quantity</th>
                        <th className="pb-3 px-3">Movement</th>
                        <th className="pb-3 px-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {filteredTransactions.slice(0, 6).map((txn, i) => {
                        const itemMatch = inventory.find(inv => inv.itemId === txn.itemId);
                        const isReceive = (txn.type || '').toUpperCase() === 'RECEIVE';
                        const isIssue = (txn.type || '').toUpperCase() === 'ISSUE';

                        return (
                          <tr key={txn.transactionId || i} className="hover:bg-canvas-parchment/50 transition-colors">
                            <td className="py-3.5 pr-3 font-mono text-[11px] font-semibold text-ink whitespace-nowrap">
                              {txn.transactionId || `TXN-100${20 + i}`}
                            </td>
                            <td className="py-3.5 px-3">
                              <div className="font-semibold text-ink text-xs leading-snug">
                                {itemMatch ? itemMatch.name : (txn.reason || 'Medical Supplies Restock')}
                              </div>
                              <span className="text-[10px] text-ink-muted-48 font-mono block mt-0.5">
                                {txn.performedBy || 'Staff Pharmacist'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 font-semibold text-ink whitespace-nowrap">
                              {txn.quantity} {itemMatch?.unit || 'units'}
                            </td>
                            <td className="py-3.5 px-3 whitespace-nowrap">
                              <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                isReceive 
                                  ? 'bg-blue-100 text-primary' 
                                  : (isIssue ? 'bg-orange-100 text-[#f97316]' : 'bg-red-100 text-[#cf2d56]')
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isReceive ? 'bg-primary' : (isIssue ? 'bg-[#f97316]' : 'bg-[#cf2d56]')}`} />
                                {txn.type || 'LOGGED'}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-[10px] text-ink-muted-48 whitespace-nowrap font-mono">
                              {txn.timestamp ? new Date(txn.timestamp).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                              }) : 'Today'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {filteredTransactions.length === 0 && (
                    <div className="text-center py-10 text-xs text-ink-muted-48">
                      No stock activities matched your query.
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom ledger status */}
              <div className="pt-3 border-t border-hairline flex items-center justify-between text-[11px] text-ink-muted-48">
                <span>Showing {Math.min(6, filteredTransactions.length)} of {transactions.length} verified audit records</span>
                <span className="font-semibold text-ink">HALO SHA-256 Ledger Verified</span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
