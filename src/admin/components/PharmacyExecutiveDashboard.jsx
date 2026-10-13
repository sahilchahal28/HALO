import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Bell, HelpCircle, Sun, Moon, ArrowRight, ArrowUpRight, 
  ArrowLeftRight, Download, Plus, Check, ChevronDown, Filter, 
  MoreHorizontal, AlertTriangle, AlertCircle, Clock, Package, 
  Layers, Activity, CreditCard, Sparkles, X, CheckCircle2, 
  TrendingUp, TrendingDown, RefreshCw, BarChart2, Pill, 
  Stethoscope, Building2, ShieldAlert, ArrowDownLeft, FileText,
  Boxes, Calendar, Inbox, Users, Settings, LogOut, CheckSquare, Square
} from 'lucide-react';
import { api } from '../../utils/api';

export default function PharmacyExecutiveDashboard({
  onClose,
  inventory = [],
  setInventory,
  refreshData,
  addToast
}) {
  const [currency, setCurrency] = useState('INR'); // 'INR' | 'USD'
  const [activeNavTab, setActiveNavTab] = useState('Overview');
  const [shiftMode, setShiftMode] = useState('day'); // 'day' | 'night'
  const [searchQuery, setSearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState('ALL'); // 'ALL' | 'ISSUE' | 'RECEIVE' | 'LOW'
  const [selectedTxnIds, setSelectedTxnIds] = useState([]);
  
  // Modals inside dashboard
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);

  // Forms
  const [dispenseForm, setDispenseForm] = useState({ itemId: '', qty: 1, reason: '', department: 'ICU' });
  const [receiveForm, setReceiveForm] = useState({ itemId: '', qty: 50, supplier: '', notes: '' });
  const [newProductForm, setNewProductForm] = useState({
    name: '',
    category: 'MEDICINE',
    unit: 'tablets',
    quantity: 100,
    minimumStock: 20,
    location: 'PHARMACY',
    supplier: ''
  });
  const [submittingAction, setSubmittingAction] = useState(false);

  // Transactions state
  const [transactions, setTransactions] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);

  // Fetch real transactions from API
  const fetchTransactions = async () => {
    try {
      setLoadingTxns(true);
      const res = await api.get('/inventory/transactions');
      if (Array.isArray(res)) {
        setTransactions(res);
      }
    } catch (_) {
      // Fallback: graceful degradation
    } finally {
      setLoadingTxns(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Live Inventory Metrics
  const metrics = useMemo(() => {
    const totalUnits = inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const totalSkus = inventory.length;
    const lowStockItems = inventory.filter(item => item.quantity <= (item.minStockLevel || item.minimumStock || 10));
    
    // Calculated pharmaceutical valuation (Unit cost heuristic based on drug type)
    const totalValuationINR = inventory.reduce((sum, item) => {
      const unitMultiplier = item.category === 'SURGICAL' ? 320 : item.category === 'EMERGENCY' ? 840 : 145;
      return sum + (Number(item.quantity) || 0) * unitMultiplier;
    }, 0);

    const totalValuation = currency === 'USD' 
      ? Math.round(totalValuationINR / 83) 
      : totalValuationINR;

    // Location breakdown
    const locations = {
      PHARMACY: inventory.filter(i => (i.location || '').toUpperCase() === 'PHARMACY'),
      ICU: inventory.filter(i => (i.location || '').toUpperCase() === 'ICU'),
      OT: inventory.filter(i => (i.location || '').toUpperCase() === 'OT'),
      EMERGENCY: inventory.filter(i => (i.location || '').toUpperCase() === 'EMERGENCY'),
      GENERAL: inventory.filter(i => (i.location || '').toUpperCase() === 'GENERAL')
    };

    return {
      totalUnits,
      totalSkus,
      lowStockItems,
      totalValuation,
      locations
    };
  }, [inventory, currency]);

  // Handle Quick Dispense
  const handleQuickDispense = async (e) => {
    e.preventDefault();
    if (!dispenseForm.itemId) {
      addToast?.('Please select a product SKU', 'error');
      return;
    }
    const qty = Number(dispenseForm.qty) || 1;
    setSubmittingAction(true);
    try {
      // Optimistic update
      setInventory(prev => prev.map(item => {
        if (item.itemId === dispenseForm.itemId) {
          return { ...item, quantity: Math.max(0, item.quantity - qty) };
        }
        return item;
      }));

      await api.post('/inventory/movement', {
        itemId: dispenseForm.itemId,
        type: 'ISSUE',
        quantity: qty,
        notes: dispenseForm.reason || `Dispensed to ${dispenseForm.department}`
      });

      addToast?.(`Dispensed ${qty} units successfully`, 'success');
      setShowDispenseModal(false);
      setDispenseForm({ itemId: '', qty: 1, reason: '', department: 'ICU' });
      fetchTransactions();
      refreshData?.();
    } catch (err) {
      addToast?.(err.message || 'Dispensing failed', 'error');
      refreshData?.();
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Quick Receive / Restock
  const handleQuickReceive = async (e) => {
    e.preventDefault();
    if (!receiveForm.itemId) {
      addToast?.('Please select a product SKU', 'error');
      return;
    }
    const qty = Number(receiveForm.qty) || 1;
    setSubmittingAction(true);
    try {
      // Optimistic update
      setInventory(prev => prev.map(item => {
        if (item.itemId === receiveForm.itemId) {
          return { ...item, quantity: item.quantity + qty };
        }
        return item;
      }));

      await api.post('/inventory/movement', {
        itemId: receiveForm.itemId,
        type: 'RECEIVE',
        quantity: qty,
        notes: receiveForm.notes || `Restocked from ${receiveForm.supplier || 'Depot'}`
      });

      addToast?.(`Restocked ${qty} units successfully`, 'success');
      setShowReceiveModal(false);
      setReceiveForm({ itemId: '', qty: 50, supplier: '', notes: '' });
      fetchTransactions();
      refreshData?.();
    } catch (err) {
      addToast?.(err.message || 'Restock failed', 'error');
      refreshData?.();
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Add Product Entry
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProductForm.name.trim()) return;
    setSubmittingAction(true);
    try {
      await api.post('/inventory', {
        name: newProductForm.name,
        category: newProductForm.category,
        unit: newProductForm.unit,
        quantity: Number(newProductForm.quantity) || 0,
        minimumStock: Number(newProductForm.minimumStock) || 10,
        location: newProductForm.location,
        supplier: newProductForm.supplier
      });
      addToast?.(`Catalog Entry "${newProductForm.name}" created`, 'success');
      setShowAddProductModal(false);
      setNewProductForm({
        name: '',
        category: 'MEDICINE',
        unit: 'tablets',
        quantity: 100,
        minimumStock: 20,
        location: 'PHARMACY',
        supplier: ''
      });
      refreshData?.();
    } catch (err) {
      addToast?.(err.message || 'Failed to add product', 'error');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Filtered Activities / Transactions Table
  const filteredActivities = useMemo(() => {
    // Merge real transactions with inventory items if transactions list is light
    const list = transactions.length > 0 
      ? transactions.map(t => {
          const matchedItem = inventory.find(i => i.itemId === t.itemId);
          return {
            id: t.transactionId || `TXN-${t._id?.slice(-5) || '100'}`,
            name: matchedItem ? matchedItem.name : `Product ${t.itemId}`,
            sku: matchedItem?.sku || t.itemId,
            type: t.type,
            quantity: t.quantity,
            unit: matchedItem?.unit || 'units',
            date: t.timestamp ? new Date(t.timestamp) : new Date(),
            actor: t.performedBy || 'Pharmacist'
          };
        })
      : inventory.map((item, idx) => ({
          id: `INV-${String(idx + 1).padStart(6, '0')}`,
          name: item.name,
          sku: item.sku,
          type: item.quantity <= (item.minStockLevel || 10) ? 'LOW' : 'RECEIVE',
          quantity: item.quantity,
          unit: item.unit,
          date: item.updatedAt ? new Date(item.updatedAt) : new Date(),
          actor: item.supplier || 'HALO Depot'
        }));

    return list.filter(act => {
      const matchesSearch = 
        act.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        act.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        act.sku?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;
      if (activityFilter === 'ALL') return true;
      if (activityFilter === 'ISSUE') return act.type === 'ISSUE';
      if (activityFilter === 'RECEIVE') return act.type === 'RECEIVE';
      if (activityFilter === 'LOW') return act.type === 'LOW' || act.type === 'WASTE';
      return true;
    });
  }, [transactions, inventory, searchQuery, activityFilter]);

  // Toggle selection
  const toggleSelectTxn = (id) => {
    setSelectedTxnIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedTxnIds.length === filteredActivities.length) {
      setSelectedTxnIds([]);
    } else {
      setSelectedTxnIds(filteredActivities.map(a => a.id));
    }
  };

  // Mock bar chart data (Dispensed vs Procured across 8 months)
  const chartData = [
    { month: 'Jan', dispensed: 22, procured: 38 },
    { month: 'Feb', dispensed: 28, procured: 42 },
    { month: 'Mar', dispensed: 34, procured: 39 },
    { month: 'Apr', dispensed: 30, procured: 44 },
    { month: 'May', dispensed: 38, procured: 48 },
    { month: 'Jun', dispensed: 44, procured: 52 },
    { month: 'Jul', dispensed: 36, procured: 43 },
    { month: 'Aug', dispensed: 40, procured: 46 }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#f4f5f8] overflow-y-auto font-sans flex flex-col animate-in fade-in duration-200">
      
      {/* Top Floating Finexy Pill Navigation Bar */}
      <header className="px-6 py-4 flex items-center justify-between gap-4 max-w-[1540px] w-full mx-auto shrink-0">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#ff5c35] text-white flex items-center justify-center shadow-sm font-bold text-lg tracking-tight">
            <Pill size={20} strokeWidth={2.5} />
          </div>
          <div className="hidden sm:block">
            <span className="font-extrabold text-base text-[#11142d] tracking-tight block leading-none">Finexy</span>
            <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider block mt-1">Rx Operations</span>
          </div>
        </div>

        {/* Floating Top Pill Nav Menu */}
        <nav className="bg-white rounded-full px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-neutral-200/60 flex items-center gap-1">
          {['Overview', 'Stockpile', 'Dispensary', 'Movement', 'Reports'].map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveNavTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                activeNavTab === tab 
                  ? 'bg-[#11142d] text-white shadow-sm' 
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Top Right Quick Actions & Profile */}
        <div className="flex items-center gap-3">
          {/* Quick Search */}
          <div className="relative hidden md:block">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input 
              type="text"
              placeholder="Search formulation..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-white border border-neutral-200/70 rounded-full pl-9 pr-3.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 w-44 transition-all shadow-sm"
            />
          </div>

          {/* Notification Alert Bell */}
          <button 
            type="button"
            className="w-9 h-9 rounded-full bg-white border border-neutral-200/70 flex items-center justify-center text-neutral-600 hover:text-neutral-900 transition-colors shadow-sm relative cursor-pointer"
            title="Notifications"
          >
            <Bell size={15} />
            {metrics.lowStockItems.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ff5c35]"></span>
            )}
          </button>

          {/* User Profile Pill */}
          <div className="hidden lg:flex items-center gap-2.5 bg-white border border-neutral-200/70 rounded-full py-1 pl-1.5 pr-3.5 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-[#11142d] text-white flex items-center justify-center font-bold text-xs uppercase">
              CP
            </div>
            <div className="text-left leading-none">
              <span className="text-xs font-bold text-neutral-900 block">Chief Pharmacist</span>
              <span className="text-[9px] text-neutral-400 block mt-0.5">pharmacy.lead@halo.in</span>
            </div>
          </div>

          {/* Close Dashboard and return to ledger */}
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-neutral-900 text-white hover:bg-black flex items-center justify-center transition-all shadow-sm cursor-pointer ml-1"
            title="Close Dashboard & Return to Ledger"
          >
            <X size={16} />
          </button>
        </div>

      </header>

      {/* Main Canvas Area */}
      <div className="max-w-[1540px] w-full mx-auto px-6 pb-12 flex-grow flex gap-6">

        {/* Left Sidebar Rail */}
        <aside className="w-14 shrink-0 flex flex-col justify-between items-center py-2 hidden sm:flex">
          {/* Top Rail Icons */}
          <div className="flex flex-col items-center gap-4">
            
            {/* Shift Mode Switcher (Day/Night) */}
            <div className="bg-white rounded-full p-1 border border-neutral-200/70 flex flex-col gap-1 shadow-sm">
              <button 
                type="button"
                onClick={() => setShiftMode('day')}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${shiftMode === 'day' ? 'bg-[#ff5c35] text-white' : 'text-neutral-400 hover:text-neutral-700'}`}
                title="Day Shift Active"
              >
                <Sun size={14} />
              </button>
              <button 
                type="button"
                onClick={() => setShiftMode('night')}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${shiftMode === 'night' ? 'bg-[#11142d] text-white' : 'text-neutral-400 hover:text-neutral-700'}`}
                title="Night Shift Active"
              >
                <Moon size={14} />
              </button>
            </div>

            {/* Menu icon rail */}
            <div className="bg-white rounded-2xl p-1.5 border border-neutral-200/70 flex flex-col gap-2.5 shadow-sm mt-3">
              <button type="button" className="p-2 rounded-xl bg-[#11142d] text-white cursor-pointer shadow-sm" title="Command Center">
                <Boxes size={16} />
              </button>
              <button type="button" className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer" title="Batch Expiry Schedule">
                <Calendar size={16} />
              </button>
              <button type="button" className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer" title="Supplier Inflows">
                <Inbox size={16} />
              </button>
              <button type="button" className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer" title="Formulary Formulary">
                <FileText size={16} />
              </button>
              <button type="button" className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer" title="Clinical Staff Access">
                <Users size={16} />
              </button>
              <button type="button" className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer" title="Settings">
                <Settings size={16} />
              </button>
            </div>

          </div>

          {/* Bottom Rail Icons */}
          <div className="flex flex-col items-center gap-3">
            <button type="button" className="w-8 h-8 rounded-full bg-white border border-neutral-200/70 flex items-center justify-center text-neutral-400 hover:text-neutral-800 transition-colors shadow-sm cursor-pointer" title="Help Guide">
              <HelpCircle size={15} />
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-white border border-neutral-200/70 flex items-center justify-center text-neutral-400 hover:text-red-600 transition-colors shadow-sm cursor-pointer" 
              title="Exit Dashboard"
            >
              <LogOut size={15} />
            </button>
          </div>
        </aside>

        {/* Dashboard Grid Content */}
        <main className="flex-grow space-y-6">

          {/* Hero Greeting Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-[#11142d] tracking-tight">
                Good morning, Chief Pharmacist
              </h1>
              <p className="text-xs text-neutral-500 mt-1">
                Stay on top of pharmaceutical stockpiles, batch expiries, dispensing velocity, and replenishment.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddProductModal(true)}
                className="bg-white border border-neutral-200/80 hover:border-neutral-400 text-neutral-800 px-4 py-2 rounded-full text-xs font-semibold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={14} className="text-[#ff5c35]" />
                <span>New Catalog Item</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchTransactions();
                  refreshData?.();
                  addToast?.('Inventory state refreshed from cloud', 'success');
                }}
                className="w-8 h-8 rounded-full bg-white border border-neutral-200/80 text-neutral-600 hover:text-neutral-900 flex items-center justify-center transition-all shadow-sm cursor-pointer"
                title="Refresh Live Data"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* 3-Column Top Main Bento Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Column 1: Total Valuation, Action Pills & Storage Depots (lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Card 1: Balance / Valuation Card */}
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400 font-semibold">Total Stock Valuation</span>
                  <div className="flex items-center gap-1 bg-neutral-100 rounded-full px-2.5 py-1 text-[10px] font-bold text-neutral-700 cursor-pointer">
                    <span onClick={() => setCurrency(c => c === 'INR' ? 'USD' : 'INR')}>
                      {currency === 'INR' ? '₹ INR' : '$ USD'}
                    </span>
                    <ChevronDown size={11} />
                  </div>
                </div>

                <div>
                  <div className="text-3xl font-extrabold text-[#11142d] tracking-tight">
                    {currency === 'INR' ? '₹' : '$'}
                    {metrics.totalValuation.toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-bold mt-1.5">
                    <TrendingUp size={13} />
                    <span>↑ 8.4% vs last cycle</span>
                  </div>
                </div>

                {/* Two Large Action Pill Buttons */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDispenseModal(true)}
                    className="bg-[#11142d] hover:bg-black text-white py-3 px-4 rounded-full text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeftRight size={13} />
                    <span>Dispense</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReceiveModal(true)}
                    className="bg-neutral-100 hover:bg-neutral-200 text-neutral-800 py-3 px-4 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Receive</span>
                  </button>
                </div>

                {/* Location Wallets Carousel / Grid */}
                <div className="pt-2 border-t border-neutral-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Depots & Vaults</span>
                    <span className="text-[11px] text-neutral-500 font-semibold">{inventory.length} SKUs Total</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#f8f9fb] p-2.5 rounded-2xl border border-neutral-100">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase">Pharmacy</div>
                      <div className="text-xs font-extrabold text-neutral-900 mt-0.5">
                        {metrics.locations.PHARMACY.reduce((s, i) => s + i.quantity, 0)} <span className="text-[9px] font-normal text-neutral-400">units</span>
                      </div>
                      <span className="text-[8px] text-emerald-600 font-bold uppercase mt-1 block">Active</span>
                    </div>

                    <div className="bg-[#f8f9fb] p-2.5 rounded-2xl border border-neutral-100">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase">ICU Bay</div>
                      <div className="text-xs font-extrabold text-neutral-900 mt-0.5">
                        {metrics.locations.ICU.reduce((s, i) => s + i.quantity, 0)} <span className="text-[9px] font-normal text-neutral-400">units</span>
                      </div>
                      <span className="text-[8px] text-emerald-600 font-bold uppercase mt-1 block">Optimal</span>
                    </div>

                    <div className="bg-[#f8f9fb] p-2.5 rounded-2xl border border-neutral-100">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase">Emerg OT</div>
                      <div className="text-xs font-extrabold text-neutral-900 mt-0.5">
                        {metrics.locations.OT.reduce((s, i) => s + i.quantity, 0)} <span className="text-[9px] font-normal text-neutral-400">units</span>
                      </div>
                      <span className="text-[8px] text-amber-600 font-bold uppercase mt-1 block">Monitored</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Monthly Consumption Quota Bar */}
              <div className="bg-white rounded-[24px] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-neutral-900">Monthly Dispense Quota</span>
                  <span className="text-neutral-400 text-[11px]">82% utilized</span>
                </div>
                
                {/* Accent Progress Bar */}
                <div className="w-full bg-neutral-100 h-2.5 rounded-full overflow-hidden flex">
                  <div className="bg-[#ff5c35] h-full rounded-full transition-all" style={{ width: '68%' }}></div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                  <span>{metrics.totalUnits} units in stock</span>
                  <span>Cap: 5,000 units</span>
                </div>
              </div>

              {/* Fast-Access Smart Drug Vaults / Cards (Inspired by Card Mockup) */}
              <div className="bg-white rounded-[24px] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard size={15} className="text-neutral-400" />
                    <span className="text-xs font-bold text-neutral-900">Quick Access Vaults</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowAddProductModal(true)}
                    className="text-[11px] text-[#ff5c35] font-bold hover:underline cursor-pointer"
                  >
                    + Add Item
                  </button>
                </div>

                {/* Two Realistic Smart Vault Cards */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  
                  {/* Card 1: Black Card */}
                  <div className="bg-gradient-to-br from-[#1a1b26] to-[#0f1015] text-white p-3.5 rounded-[18px] relative overflow-hidden shadow-md flex flex-col justify-between h-28">
                    <div className="flex items-center justify-between">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                      <span className="text-[8px] uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded-full font-bold">Active</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-neutral-200 block truncate">Crash Cart Box #1</span>
                      <span className="text-[8px] text-neutral-400 font-mono block mt-0.5">VAULT-A-01 • 2-8°C</span>
                    </div>
                    <div className="flex items-center justify-between text-[8px] text-neutral-400 font-mono">
                      <span>EXP 09/28</span>
                      <span>CODE 6782</span>
                    </div>
                  </div>

                  {/* Card 2: Orange/Coral Card */}
                  <div className="bg-gradient-to-br from-[#ff5c35] to-[#f43f1a] text-white p-3.5 rounded-[18px] relative overflow-hidden shadow-md flex flex-col justify-between h-28">
                    <div className="flex items-center justify-between">
                      <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></div>
                      <span className="text-[8px] uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded-full font-bold">Safe Lock</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-white block truncate">Narcotic Vault #04</span>
                      <span className="text-[8px] text-white/80 font-mono block mt-0.5">ICU BAY 3 • Controlled</span>
                    </div>
                    <div className="flex items-center justify-between text-[8px] text-white/80 font-mono">
                      <span>EXP 11/27</span>
                      <span>CODE 4356</span>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Column 2: 2x2 KPI Grid & Analytics Chart (lg:col-span-8) */}
            <div className="lg:col-span-8 space-y-6">

              {/* 2x2 KPI Grid + Chart Row */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* 2x2 KPI Grid (md:col-span-7) */}
                <div className="md:col-span-7 grid grid-cols-2 gap-4">

                  {/* Tile 1: Critical Low Stock (Coral/Orange highlight card) */}
                  <div className="bg-[#ff5c35] text-white rounded-[24px] p-5 shadow-sm flex flex-col justify-between h-36">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white/90">Critical Low Stock</span>
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                        <AlertTriangle size={14} className="text-white" />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-black tracking-tight">
                        {metrics.lowStockItems.length}
                      </div>
                      <span className="text-[10px] font-semibold text-white/80 mt-1 block">
                        {metrics.lowStockItems.length > 0 ? 'Immediate reorder recommended' : 'All thresholds optimal'}
                      </span>
                    </div>
                  </div>

                  {/* Tile 2: Expiring Batches (White card) */}
                  <div className="bg-white rounded-[24px] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 flex flex-col justify-between h-36">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-700">Expiring Soon (30d)</span>
                      <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                        <Clock size={14} />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-extrabold text-[#11142d] tracking-tight">
                        2 Batches
                      </div>
                      <span className="text-[10px] font-semibold text-neutral-400 mt-1 block">
                        Verified cold-chain
                      </span>
                    </div>
                  </div>

                  {/* Tile 3: Total Catalog SKUs (White card) */}
                  <div className="bg-white rounded-[24px] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 flex flex-col justify-between h-36">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-700">Catalog SKUs</span>
                      <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                        <Layers size={14} />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-extrabold text-[#11142d] tracking-tight">
                        {metrics.totalSkus}
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 mt-1 block">
                        ↑ 100% active formularies
                      </span>
                    </div>
                  </div>

                  {/* Tile 4: Total Units in Stock (White card) */}
                  <div className="bg-white rounded-[24px] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 flex flex-col justify-between h-36">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-700">Total Units in Stock</span>
                      <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
                        <CheckCircle2 size={14} />
                      </div>
                    </div>
                    <div>
                      <div className="text-3xl font-extrabold text-[#11142d] tracking-tight">
                        {metrics.totalUnits.toLocaleString()}
                      </div>
                      <span className="text-[10px] font-semibold text-neutral-400 mt-1 block">
                        Across all hospital wards
                      </span>
                    </div>
                  </div>

                </div>

                {/* Analytics Chart (md:col-span-5) */}
                <div className="md:col-span-5 bg-white rounded-[24px] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 flex flex-col justify-between h-[304px]">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-neutral-900">Dispense & Inflow Velocity</h3>
                      <div className="flex items-center gap-2 text-[9px] font-bold">
                        <span className="flex items-center gap-1 text-[#11142d]">
                          <span className="w-2 h-2 rounded-full bg-[#11142d]"></span> Dispensed
                        </span>
                        <span className="flex items-center gap-1 text-[#ff5c35]">
                          <span className="w-2 h-2 rounded-full bg-[#ff5c35]"></span> Procured
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">8-Month hospital pharmacy throughput</p>
                  </div>

                  {/* Bar Chart Visualization */}
                  <div className="flex items-end justify-between gap-1.5 h-44 pt-4 px-1">
                    {chartData.map((d, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                        <div className="w-full flex flex-col items-center gap-0.5 justify-end h-full">
                          {/* Upper Bar (Procured / Coral) */}
                          <div 
                            className="w-full bg-[#ff5c35] rounded-t-md transition-all group-hover:opacity-90"
                            style={{ height: `${d.procured * 1.5}px` }}
                            title={`${d.month}: ${d.procured * 10} Units Procured`}
                          ></div>
                          {/* Lower Bar (Dispensed / Dark) */}
                          <div 
                            className="w-full bg-[#11142d] rounded-b-md transition-all group-hover:opacity-90"
                            style={{ height: `${d.dispensed * 1.5}px` }}
                            title={`${d.month}: ${d.dispensed * 10} Units Dispensed`}
                          ></div>
                        </div>
                        <span className="text-[9px] font-semibold text-neutral-400">{d.month}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[10px] text-neutral-400 font-semibold">
                    <span>Average Throughput</span>
                    <span className="text-[#11142d] font-bold">3,850 Units / Month</span>
                  </div>
                </div>

              </div>

              {/* Bottom Large Card: Recent Activities Table */}
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-neutral-200/60 space-y-4">
                
                {/* Header with Search and Filter */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Recent Inventory Movements</h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">Real-time dispensations, inbound wholesale deliveries & ledger logs</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Search inside table */}
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        placeholder="Search logs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="bg-[#f8f9fb] border border-neutral-200/60 rounded-full pl-8 pr-3 py-1.5 text-xs text-neutral-800 focus:outline-none w-36 transition-all"
                      />
                    </div>

                    {/* Filter Dropdown */}
                    <select
                      value={activityFilter}
                      onChange={e => setActivityFilter(e.target.value)}
                      className="bg-[#f8f9fb] border border-neutral-200/60 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-700 outline-none cursor-pointer"
                    >
                      <option value="ALL">Filter: All</option>
                      <option value="ISSUE">Dispensed</option>
                      <option value="RECEIVE">Received</option>
                      <option value="LOW">Low Stock / Waste</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-bold text-[9px] tracking-wider">
                        <th className="pb-3 pl-2 w-8">
                          <button type="button" onClick={toggleSelectAll} className="cursor-pointer text-neutral-400 hover:text-neutral-700">
                            {selectedTxnIds.length > 0 && selectedTxnIds.length === filteredActivities.length 
                              ? <CheckSquare size={13} className="text-[#ff5c35]" /> 
                              : <Square size={13} />}
                          </button>
                        </th>
                        <th className="pb-3 px-3">Order / SKU ID</th>
                        <th className="pb-3 px-3">Formulation & Activity</th>
                        <th className="pb-3 px-3">Units Qty</th>
                        <th className="pb-3 px-3">Status</th>
                        <th className="pb-3 px-3">Logged Date</th>
                        <th className="pb-3 pr-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filteredActivities.slice(0, 8).map(act => {
                        const isSelected = selectedTxnIds.includes(act.id);
                        return (
                          <tr key={act.id} className="hover:bg-[#fbfcfd] transition-colors">
                            <td className="py-3.5 pl-2">
                              <button type="button" onClick={() => toggleSelectTxn(act.id)} className="cursor-pointer text-neutral-400 hover:text-neutral-700">
                                {isSelected ? <CheckSquare size={13} className="text-[#ff5c35]" /> : <Square size={13} />}
                              </button>
                            </td>

                            <td className="py-3.5 px-3 font-mono text-[11px] font-bold text-neutral-800">
                              {act.id}
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center shrink-0">
                                  <Pill size={12} />
                                </div>
                                <div>
                                  <div className="font-semibold text-neutral-900 leading-tight">{act.name}</div>
                                  <span className="text-[10px] text-neutral-400 font-mono block">{act.sku}</span>
                                </div>
                              </div>
                            </td>

                            <td className="py-3.5 px-3 font-semibold text-neutral-900">
                              {act.quantity} <span className="text-[10px] text-neutral-400 font-normal">{act.unit}</span>
                            </td>

                            <td className="py-3.5 px-3">
                              {act.type === 'RECEIVE' ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  Restocked
                                </span>
                              ) : act.type === 'ISSUE' ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                  Dispensed
                                </span>
                              ) : act.type === 'LOW' ? (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#ff5c35] bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff5c35]"></span>
                                  Low Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                  Wasted
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 px-3 text-[11px] text-neutral-500 font-medium whitespace-nowrap">
                              {act.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} {act.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>

                            <td className="py-3.5 pr-2 text-right">
                              <button 
                                type="button"
                                onClick={() => {
                                  setDispenseForm(p => ({ ...p, itemId: act.sku || act.id }));
                                  setShowDispenseModal(true);
                                }}
                                className="text-[11px] font-bold text-[#ff5c35] hover:underline cursor-pointer"
                              >
                                Dispense
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>

          </div>

        </main>

      </div>

      {/* ==================== QUICK DISPENSE MODAL ==================== */}
      {showDispenseModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#11142d] text-white flex items-center justify-center">
                  <ArrowLeftRight size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Dispense Medication</h3>
                  <p className="text-[10px] text-neutral-400">Issue formulation to ward or patient prescription</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowDispenseModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleQuickDispense} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Select Formulation SKU</label>
                <select
                  required
                  value={dispenseForm.itemId}
                  onChange={e => setDispenseForm({ ...dispenseForm, itemId: e.target.value })}
                  className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none cursor-pointer"
                >
                  <option value="">-- Choose Medication SKU --</option>
                  {inventory.map(i => (
                    <option key={i.itemId} value={i.itemId}>
                      {i.name} ({i.sku}) • {i.quantity} in stock
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Units to Dispense</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={dispenseForm.qty}
                    onChange={e => setDispenseForm({ ...dispenseForm, qty: parseInt(e.target.value) || 1 })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Target Ward</label>
                  <select
                    value={dispenseForm.department}
                    onChange={e => setDispenseForm({ ...dispenseForm, department: e.target.value })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3 py-2.5 text-xs text-neutral-800 outline-none cursor-pointer"
                  >
                    <option value="ICU">ICU Ward</option>
                    <option value="OT">Operation Theater</option>
                    <option value="EMERGENCY">Emergency Room</option>
                    <option value="OPD">OPD Dispensary</option>
                    <option value="GENERAL">General Ward</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Clinical Note / Prescription ID</label>
                <input
                  type="text"
                  placeholder="e.g. Rx #9201 - Patient Ward 4A"
                  value={dispenseForm.reason}
                  onChange={e => setDispenseForm({ ...dispenseForm, reason: e.target.value })}
                  className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDispenseModal(false)}
                  className="w-1/2 py-2.5 border border-neutral-200 rounded-full font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="w-1/2 py-2.5 bg-[#11142d] hover:bg-black text-white rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? 'Dispensing...' : 'Confirm Dispense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== QUICK RECEIVE / RESTOCK MODAL ==================== */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[28px] max-w-md w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#ff5c35] text-white flex items-center justify-center">
                  <Download size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Receive Inbound Stock</h3>
                  <p className="text-[10px] text-neutral-400">Log wholesale shipment replenishment</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowReceiveModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleQuickReceive} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Select Product SKU</label>
                <select
                  required
                  value={receiveForm.itemId}
                  onChange={e => setReceiveForm({ ...receiveForm, itemId: e.target.value })}
                  className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none cursor-pointer"
                >
                  <option value="">-- Choose Medication SKU --</option>
                  {inventory.map(i => (
                    <option key={i.itemId} value={i.itemId}>
                      {i.name} ({i.sku}) • Current: {i.quantity}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Inbound Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={receiveForm.qty}
                    onChange={e => setReceiveForm({ ...receiveForm, qty: parseInt(e.target.value) || 1 })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Supplier / Depot</label>
                  <input
                    type="text"
                    placeholder="e.g. Cipla Laboratories"
                    value={receiveForm.supplier}
                    onChange={e => setReceiveForm({ ...receiveForm, supplier: e.target.value })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Batch Code & Expiry Note</label>
                <input
                  type="text"
                  placeholder="e.g. Batch #B-991 • EXP 10/28"
                  value={receiveForm.notes}
                  onChange={e => setReceiveForm({ ...receiveForm, notes: e.target.value })}
                  className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="w-1/2 py-2.5 border border-neutral-200 rounded-full font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="w-1/2 py-2.5 bg-[#ff5c35] hover:bg-[#e04a25] text-white rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? 'Restocking...' : 'Confirm Restock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== ADD NEW CATALOG PRODUCT MODAL ==================== */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-[28px] max-w-lg w-full p-6 shadow-2xl border border-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Add New Formulary Product</h3>
                  <p className="text-[10px] text-neutral-400">Register new drug catalog item into hospital pharmacy</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setShowAddProductModal(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Formulation Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ciprofloxacin 500mg tablets"
                  value={newProductForm.name}
                  onChange={e => setNewProductForm({ ...newProductForm, name: e.target.value })}
                  className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Category</label>
                  <select
                    value={newProductForm.category}
                    onChange={e => setNewProductForm({ ...newProductForm, category: e.target.value })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none cursor-pointer"
                  >
                    <option value="MEDICINE">Medicine</option>
                    <option value="CONSUMABLE">Consumable</option>
                    <option value="SURGICAL">Surgical</option>
                    <option value="LAB">Lab Supply</option>
                    <option value="EMERGENCY">Emergency Supply</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Stock Unit</label>
                  <input
                    type="text"
                    required
                    placeholder="tablets, vials, ampoules"
                    value={newProductForm.unit}
                    onChange={e => setNewProductForm({ ...newProductForm, unit: e.target.value })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Initial Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProductForm.quantity}
                    onChange={e => setNewProductForm({ ...newProductForm, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Min Threshold Alert</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newProductForm.minimumStock}
                    onChange={e => setNewProductForm({ ...newProductForm, minimumStock: parseInt(e.target.value) || 10 })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Storage Location</label>
                  <select
                    value={newProductForm.location}
                    onChange={e => setNewProductForm({ ...newProductForm, location: e.target.value })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none cursor-pointer"
                  >
                    <option value="PHARMACY">Pharmacy Central</option>
                    <option value="ICU">ICU Ward</option>
                    <option value="OT">Operating Theater</option>
                    <option value="EMERGENCY">Emergency Room</option>
                    <option value="GENERAL">General Ward</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-700 font-bold text-[10px] uppercase mb-1">Manufacturer / Supplier</label>
                  <input
                    type="text"
                    placeholder="e.g. Abbott Healthcare"
                    value={newProductForm.supplier}
                    onChange={e => setNewProductForm({ ...newProductForm, supplier: e.target.value })}
                    className="w-full bg-[#f8f9fb] border border-neutral-200 rounded-full px-3.5 py-2.5 text-xs text-neutral-800 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="w-1/2 py-2.5 border border-neutral-200 rounded-full font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="w-1/2 py-2.5 bg-[#11142d] hover:bg-black text-white rounded-full font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? 'Creating...' : 'Create Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
