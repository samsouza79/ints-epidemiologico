/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Search, 
  FileSpreadsheet, 
  FileText, 
  Calendar, 
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { UNITS, MONTHS } from '../constants';
import DateRangeFilter, { DateRange } from './DateRangeFilter';

const DashboardRelatorios: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'atendimentos' | 'cids' | 'atestados' | 'exames'>('atendimentos');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnidade, setFilterUnidade] = useState('Todas');
  const [dateRange, setDateRange] = useState<DateRange>({
    startMonth: 1,
    startYear: new Date().getFullYear(),
    endMonth: 12,
    endYear: new Date().getFullYear(),
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: records, error } = await supabase
          .from(activeTab)
          .select('*')
          .gte('ano', dateRange.startYear)
          .lte('ano', dateRange.endYear)
          .order('timestamp', { ascending: false });
          
        if (error) throw error;
        setData(records || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeTab, dateRange.startYear, dateRange.endYear]);

  const isWithinRange = (mes: number, ano: number) => {
    const recordVal = ano * 12 + (mes - 1);
    const startVal = dateRange.startYear * 12 + (dateRange.startMonth - 1);
    const endVal = dateRange.endYear * 12 + (dateRange.endMonth - 1);
    return recordVal >= startVal && recordVal <= endVal;
  };

  const filteredData = data.filter(item => {
    const matchesSearch = searchTerm === '' || JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesUnidade = filterUnidade === 'Todas' || item.unidade === filterUnidade;
    const matchesDate = isWithinRange(item.mes, item.ano);
    return matchesSearch && matchesUnidade && matchesDate;
  });

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    XLSX.writeFile(wb, `INTS_Epidemiologico_${activeTab}_${new Date().toLocaleDateString()}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.setTextColor(45, 134, 83); // INTS Green
    doc.text('INTS Epidemiológico', 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate 400
    doc.text(`Relatório de ${activeTab.toUpperCase()}`, 14, 22);
    doc.text(`Unidade: ${filterUnidade} | Período: ${MONTHS[dateRange.startMonth-1]}/${dateRange.startYear} - ${MONTHS[dateRange.endMonth-1]}/${dateRange.endYear}`, 14, 28);
    
    const headers = Object.keys(filteredData[0] || {}).filter(k => k !== 'id' && k !== 'timestamp');
    const body = filteredData.map(item => headers.map(h => item[h]));

    doc.autoTable({
      head: [headers.map(h => h.charAt(0).toUpperCase() + h.slice(1))],
      body: body,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [45, 134, 83] },
      didDrawPage: (data: any) => {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Desenvolvido por INTS', data.settings.margin.left, pageHeight - 10);
      }
    });
    
    doc.save(`INTS_Relatorio_${activeTab}_${new Date().toLocaleDateString()}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 card-minimal">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-full shrink-0">
          {(['atendimentos', 'atestados', 'exames', 'cids'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all ${
                activeTab === tab ? 'bg-white text-ints-green shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'cids' ? 'CIDs' : tab}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={exportToExcel} className="px-5 py-2 bg-white border border-ints-gray text-ints-green rounded-full hover:bg-green-50 transition-all text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            <FileSpreadsheet className="w-3.5 h-3.5" /> XLS
          </button>
          <button onClick={exportToPDF} className="px-5 py-2 bg-white border border-ints-gray text-red-500 rounded-full hover:bg-red-50 transition-all text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      <div className="card-minimal space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <DateRangeFilter range={dateRange} onChange={setDateRange} />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-ints-gray rounded-full text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-ints-green/10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select 
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-ints-gray rounded-full text-xs text-slate-600 focus:outline-none appearance-none"
                value={filterUnidade}
                onChange={(e) => setFilterUnidade(e.target.value)}
              >
                <option value="Todas">Unidades</option>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-ints-green/5 text-ints-green rounded-full border border-ints-green/10 text-[10px] font-bold uppercase tracking-widest">
              <Filter className="w-3 h-3" />
              {filteredData.length} registros
            </div>
          </div>
        </div>

        <div className="overflow-x-auto pt-4 border-t border-ints-gray">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 border-b border-ints-gray sticky top-0">
              <tr>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Unidade</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mês/Ano</th>
                {activeTab === 'cids' && <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Diagnóstico</th>}
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Processando base...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Vazio.</td>
                </tr>
              ) : filteredData.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-700">{item.unidade}</td>
                  <td className="px-6 py-4 text-slate-500">{MONTHS[item.mes - 1]} / {item.ano}</td>
                  {activeTab === 'cids' && (
                    <td className="px-6 py-4 text-slate-500">
                      <span className="font-bold text-ints-green">{item.codigo}</span>{' '}
                      <span className="text-slate-400 ml-1">{item.descricao}</span>
                    </td>
                  )}
                  <td className="px-6 py-4 text-right">
                    <span className="font-bold text-slate-700">
                      {(item.quantidade || 1).toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardRelatorios;
