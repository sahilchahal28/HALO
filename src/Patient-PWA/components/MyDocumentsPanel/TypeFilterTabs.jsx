import React from 'react';
import { DOCUMENT_TYPES, TYPE_META } from '../../../services/objectStore/constants';

export default function TypeFilterTabs({ activeType, onSelectType }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
      <button
        type="button"
        onClick={() => onSelectType('ALL')}
        className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer flex-shrink-0 ${
          activeType === 'ALL'
            ? 'bg-ink text-canvas shadow-xs font-semibold'
            : 'bg-canvas-parchment text-ink hover:bg-canvas border border-hairline'
        }`}
      >
        All Records
      </button>

      {DOCUMENT_TYPES.map((type) => {
        const meta = TYPE_META[type] || TYPE_META.OTHER;
        const isSelected = activeType === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelectType(isSelected ? 'ALL' : type)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer flex-shrink-0 ${
              isSelected
                ? 'bg-primary text-canvas shadow-xs font-semibold'
                : 'bg-canvas-parchment text-ink hover:bg-canvas border border-hairline'
            }`}
          >
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
