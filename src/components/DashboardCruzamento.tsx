/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Dna, 
  Search, 
  FileSpreadsheet, 
  ChevronLeft, 
  ChevronRight,
  TrendingDown,
  TrendingUp,
  User,
  Calendar,
  Activity,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { FilterState } from './GlobalFilters';
import { MONTHS } from '../constants';
import * as XLSX from 'xlsx';

interface DashboardCruzamentoProps {
  filters: FilterState;
}

const DashboardCruzamento: React.FC<DashboardCruzamentoProps> = ({ filters }) => {
  const [atestados, setAtestados] = useState<any[]>([]);
  const [monitoramento, setMonitoramento] = useState<any[]>([]);
  const [cids, setCids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const queryAtestados = supabase.from('atestados').select('*');
        const queryMonitoramento = supabase.from('monitoramento').select('*');
        const queryCids = supabase.from('cids').select('*');

        if (filters.unidade !== 'all') {
          queryAtestados.eq('unidade', filters.unidade);
          queryMonitoramento.eq('unidade', filters.unidade);
          queryCids.eq('unidade', filters.unidade);
        }
        
        if (filters.ano !== 'all') {
          const ano = parseInt(filters.ano);
          queryAtestados.eq('ano', ano);
          queryMonitoramento.eq('ano', ano);
          queryCids.eq('ano', ano);
        }

        if (filters.mes !== 'all') {
          const mes = parseInt(filters.mes);
          queryAtestados.eq('mes', mes);
          queryMonitoramento.eq('mes', mes);
          queryCids.eq('mes', mes);
        }

        const [resAtestados, resMonitoramento, resCids] = await Promise.all([
          queryAtestados,
          queryMonitoramento,
          queryCids
        ]);

        setAtestados(resAtestados.data || []);
        setMonitoramento(resMonitoramento.data || []);
        setCids(resCids.data || []);
      } catch (err) {
        console.error("Erro ao cruzar dados:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  const crossReferencedData = useMemo(() => {
    // 1. Organize monitoramento and cids by patient for faster lookup
    const monitorByPatient: Record<string, any[]> = {};
    monitoramento.forEach(m => {
      if (!monitorByPatient[m.paciente]) monitorByPatient[m.paciente] = [];
      monitorByPatient[m.paciente].push(m);
    });

    const cidsByPatient: Record<string, any[]> = {};
    cids.forEach(c => {
      if (!cidsByPatient[c.paciente]) cidsByPatient[c.paciente] = [];
      cidsByPatient[c.paciente].push(c);
    });

    // 2. Perform Join
    return atestados.map(atestado => {
      const pacName = atestado.paciente;
      const atestadoDate = atestado.data_atestado ? new Date(atestado.data_atestado) : null;
      
      let associatedCID = atestado.cid_codigo || 'N/I';
      let foundViaJoin = false;
      let closestAttendance = null;

      if (pacName && atestadoDate) {
        const patientAttendances = monitorByPatient[pacName] || [];
        
        // Find best attendance
        let minDiff = Infinity;
        patientAttendances.forEach(att => {
          const attDate = new Date(att.data_entrada);
          const diff = Math.abs(atestadoDate.getTime() - attDate.getTime());
          const diffInDays = diff / (1000 * 60 * 60 * 24);
          
          if (diffInDays <= 1 && diff < minDiff) {
            minDiff = diff;
            closestAttendance = att;
          }
        });

        // If found attendance, look for CID
        if (closestAttendance) {
          const patientCIDs = cidsByPatient[pacName] || [];
          // Search for a CID in the same period or close to the attendance
          // For now, matching by patient name is the primary requirement
          const match = patientCIDs[0]; // Simplification: take the most recent CID for that patient
          if (match) {
            associatedCID = match.codigo;
            foundViaJoin = true;
          }
        }
      }

      return {
        ...atestado,
        cid_associado: associatedCID,
        encontrado_via_cruzamento: foundViaJoin,
        monitoramento_encontrado: !!closestAttendance
      };
    });
  }, [atestados, monitoramento, cids]);

  const cidRanking = useMemo(() => {
    const counts: Record<string, number> = {};
    crossReferencedData.forEach(row => {
      const code = row.cid_associado;
      counts[code] = (counts[code] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [crossReferencedData]);

  const filteredData = crossReferencedData.filter(item => 
    searchTerm === '' || 
    item.paciente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.cid_associado?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToExcel = () => {
    const excelData = filteredData.map(item => ({
      'Paciente': item.paciente,
      'Data Atestado': item.data_atestado ? new Date(item.data_atestado).toLocaleDateString() : '-',
      'CID Associado': item.cid_associado,
      'Unidade': item.unidade,
      'Status Cruzamento': item.encontrado_via_cruzamento ? 'Cruzado com Sucesso' : 'Dados Incompletos'
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Cruzado");
    XLSX.writeFile(wb, `INTS_Cruzamento_Epidemiologico_${new Date().getTime()}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 card-minimal">
        <Loader2 className="w-10 h-10 text-ints-green animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Cruzando bases de dados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Table Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card-minimal">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-ints-green/10 rounded-2xl">
                  <Dna className="w-6 h-6 text-ints-green" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Cruzamento Atestado → CID</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Associação baseada em atendimento (±24h)</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar paciente ou CID..." 
                    className="pl-9 pr-4 py-2.5 bg-slate-50 border border-ints-gray rounded-full text-xs text-slate-600 focus:outline-none w-[200px]"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button 
                  onClick={exportToExcel}
                  className="p-2.5 bg-white border border-ints-gray text-ints-green rounded-full hover:bg-green-50 transition-all shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-slate-50 border-b border-ints-gray">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paciente</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Atestado</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CID Associado</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-ints-gray flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
                            {item.paciente?.charAt(0) || '?'}
                          </div>
                          <span className="font-bold text-slate-700 truncate max-w-[150px]">{item.paciente}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono">
                        {item.data_atestado ? new Date(item.data_atestado).toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full font-bold text-[11px] ${
                          item.encontrado_via_cruzamento ? 'bg-ints-green/10 text-ints-green' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {item.cid_associado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.encontrado_via_cruzamento ? (
                          <div className="flex justify-center"><CheckCircle2 className="w-4 h-4 text-ints-green" /></div>
                        ) : (
                          <div className="flex justify-center"><AlertTriangle className="w-4 h-4 text-amber-400" /></div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">Nenhum dado encontrado para cruzamento.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Ranking Section */}
        <div className="space-y-6">
          <div className="card-minimal h-full">
            <div className="flex items-center gap-3 mb-8">
              <TrendingUp className="w-5 h-5 text-ints-green" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Ranking de CIDs Associados</h3>
            </div>
            
            <div className="space-y-4">
              {cidRanking.slice(0, 10).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-ints-gray hover:border-ints-green/20 transition-all group">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-black text-slate-300">#{idx + 1}</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-slate-700 group-hover:text-ints-green transition-colors">{item.code}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-black text-slate-800">{item.count}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Atestados</span>
                  </div>
                </div>
              ))}
              {cidRanking.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-xs italic">Aguardando dados...</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardCruzamento;
