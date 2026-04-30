/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { MONTHS } from '../constants';

export interface DateRange {
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
}

interface Props {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

const DateRangeFilter: React.FC<Props> = ({ range, onChange }) => {
  const handleStartMonth = (m: number) => onChange({ ...range, startMonth: m });
  const handleStartYear = (y: number) => onChange({ ...range, startYear: y });
  const handleEndMonth = (m: number) => onChange({ ...range, endMonth: m });
  const handleEndYear = (y: number) => onChange({ ...range, endYear: y });

  return (
    <div className="flex flex-col md:flex-row items-center gap-4 py-4 px-6 bg-white border border-ints-gray rounded-3xl shadow-sm">
      <div className="flex items-center gap-3">
        <Calendar className="w-5 h-5 text-ints-green" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Filtrar Período</span>
      </div>
      
      <div className="flex flex-wrap items-center gap-2">
        {/* Start Date */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-full border border-ints-gray">
          <select 
            value={range.startMonth}
            onChange={(e) => handleStartMonth(Number(e.target.value))}
            className="bg-transparent text-[11px] font-bold text-slate-600 outline-none px-2 py-1 appearance-none cursor-pointer"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m.substring(0, 3)}</option>
            ))}
          </select>
          <select 
            value={range.startYear}
            onChange={(e) => handleStartYear(Number(e.target.value))}
            className="bg-transparent text-[11px] font-black text-ints-green outline-none px-2 py-1 appearance-none cursor-pointer"
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <ChevronRight className="w-4 h-4 text-slate-300" />

        {/* End Date */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-full border border-ints-gray">
          <select 
            value={range.endMonth}
            onChange={(e) => handleEndMonth(Number(e.target.value))}
            className="bg-transparent text-[11px] font-bold text-slate-600 outline-none px-2 py-1 appearance-none cursor-pointer"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m.substring(0, 3)}</option>
            ))}
          </select>
          <select 
            value={range.endYear}
            onChange={(e) => handleEndYear(Number(e.target.value))}
            className="bg-transparent text-[11px] font-black text-ints-green outline-none px-2 py-1 appearance-none cursor-pointer"
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default DateRangeFilter;
