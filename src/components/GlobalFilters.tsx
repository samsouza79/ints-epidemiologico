import React from 'react';
import { Filter, Calendar, LayoutGrid, Activity } from 'lucide-react';

export type DataType = 'all' | 'cids' | 'exames' | 'atestados';

export interface FilterState {
  unidade: string;
  ano: string;
  mes: string;
  tipo: DataType;
}

interface GlobalFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableUnits: string[];
  availableYears: string[];
}

export default function GlobalFilters({ filters, onChange, availableUnits, availableYears }: GlobalFiltersProps) {
  const meses = [
    { value: 'all', label: 'Todos os Meses' },
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ];

  const handleUpdate = (key: keyof FilterState, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-4 animate-in fade-in slide-in-from-top-1 duration-500">
      {/* Unidade */}
      <div className="flex items-center gap-3 py-2 px-4 bg-white border border-ints-gray rounded-2xl shadow-sm hover:border-ints-green/30 transition-all group">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-ints-green group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Unidade</span>
        </div>
        <select 
          value={filters.unidade}
          onChange={(e) => handleUpdate('unidade', e.target.value)}
          className="bg-transparent text-[11px] font-black text-slate-700 outline-none px-1 py-1 appearance-none cursor-pointer min-w-[120px]"
        >
          <option value="all">Todas as Unidades</option>
          {availableUnits.map(unit => (
            <option key={unit} value={unit}>{unit.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* Ano */}
      <div className="flex items-center gap-3 py-2 px-4 bg-white border border-ints-gray rounded-2xl shadow-sm hover:border-ints-green/30 transition-all group">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-ints-green group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Ano</span>
        </div>
        <select 
          value={filters.ano}
          onChange={(e) => handleUpdate('ano', e.target.value)}
          className="bg-transparent text-[11px] font-black text-slate-700 outline-none px-1 py-1 appearance-none cursor-pointer"
        >
          <option value="all">Todos</option>
          {availableYears.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      {/* Mês */}
      <div className="flex items-center gap-3 py-2 px-4 bg-white border border-ints-gray rounded-2xl shadow-sm hover:border-ints-green/30 transition-all group">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-ints-green group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Mês</span>
        </div>
        <select 
          value={filters.mes}
          onChange={(e) => handleUpdate('mes', e.target.value)}
          className="bg-transparent text-[11px] font-black text-slate-700 outline-none px-1 py-1 appearance-none cursor-pointer"
        >
          {meses.map(m => (
            <option key={m.value} value={m.value}>{m.label.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* Tipo */}
      <div className="flex items-center gap-3 py-2 px-4 bg-white border border-ints-gray rounded-2xl shadow-sm hover:border-ints-green/30 transition-all group">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-ints-green group-hover:scale-110 transition-transform" />
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Tipo de Dado</span>
        </div>
        <select 
          value={filters.tipo}
          onChange={(e) => handleUpdate('tipo', e.target.value as DataType)}
          className="bg-transparent text-[11px] font-black text-slate-700 outline-none px-1 py-1 appearance-none cursor-pointer min-w-[140px]"
        >
          <option value="all">TODOS OS DADOS</option>
          <option value="cids">CIDs (ATENDIMENTOS)</option>
          <option value="exames">EXAMES</option>
          <option value="atestados">ATESTADOS</option>
        </select>
      </div>

      {/* Clear Filters Indicator */}
      {(filters.unidade !== 'all' || filters.ano !== 'all' || filters.mes !== 'all' || filters.tipo !== 'all') && (
        <button 
          onClick={() => onChange({ unidade: 'all', ano: 'all', mes: 'all', tipo: 'all' })}
          className="text-[9px] font-bold text-rose-400 uppercase tracking-widest hover:text-rose-600 transition-colors px-2 underline underline-offset-4"
        >
          Limpar Filtros
        </button>
      )}
    </div>
  );
}
