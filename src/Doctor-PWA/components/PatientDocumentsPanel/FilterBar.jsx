import React from 'react';
import { Search, Filter, X, Calendar, RotateCcw } from 'lucide-react';
import { DEPARTMENTS, DOCUMENT_TYPES, TYPE_META } from '../../../services/objectStore/constants';

export default function FilterBar({
  filters,
  onFilterChange,
  onResetFilters,
  totalResults,
}) {
  const hasActiveFilters = Boolean(
    filters.search ||
    filters.type !== 'ALL' ||
    filters.department !== 'ALL' ||
    filters.dateFrom ||
    filters.dateTo
  );

  return (
    <div className="bg-canvas border border-hairline rounded-[18px] p-4 space-y-3 shadow-xs">
      {/* Search & Date Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
        {/* Search */}
        <div className="sm:col-span-5 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted-48" />
          <input
            type="text"
            placeholder="Search documents, tests, doctors..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full bg-canvas-parchment text-ink text-xs pl-8 pr-8 py-2 rounded-full border border-hairline focus:border-primary focus:outline-none transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ search: '' })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted-48 hover:text-ink cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Department Dropdown */}
        <div className="sm:col-span-3">
          <select
            value={filters.department}
            onChange={(e) => onFilterChange({ department: e.target.value })}
            className="w-full bg-canvas-parchment text-ink text-xs px-3 py-2 rounded-full border border-hairline focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        {/* Date From & To */}
        <div className="sm:col-span-4 flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onFilterChange({ dateFrom: e.target.value })}
              className="w-full bg-canvas-parchment text-ink text-[11px] px-2.5 py-1.5 rounded-full border border-hairline focus:outline-none"
              title="From examination date"
            />
          </div>
          <span className="text-[10px] text-ink-muted-48">to</span>
          <div className="relative flex-1">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onFilterChange({ dateTo: e.target.value })}
              className="w-full bg-canvas-parchment text-ink text-[11px] px-2.5 py-1.5 rounded-full border border-hairline focus:outline-none"
              title="To examination date"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="p-1.5 text-ink-muted-48 hover:text-ink hover:bg-canvas-parchment rounded-full cursor-pointer transition-colors"
              title="Reset all filters"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Scrollable Category Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
        <button
          type="button"
          onClick={() => onFilterChange({ type: 'ALL' })}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
            filters.type === 'ALL'
              ? 'bg-ink text-canvas shadow-xs'
              : 'bg-canvas-parchment text-ink hover:bg-canvas border border-hairline'
          }`}
        >
          All Types
        </button>

        {DOCUMENT_TYPES.map((type) => {
          const meta = TYPE_META[type] || TYPE_META.OTHER;
          const isSelected = filters.type === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onFilterChange({ type: isSelected ? 'ALL' : type })}
              className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-primary text-canvas shadow-xs'
                  : 'bg-canvas-parchment text-ink hover:bg-canvas border border-hairline'
              }`}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
