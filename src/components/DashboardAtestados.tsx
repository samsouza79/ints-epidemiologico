import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Building2,
  Filter,
  BarChart3,
  FileText,
  Activity
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AtestadoDoc } from '../types';
import { UNITS } from '../constants';
import DateRangeFilter, { DateRange } from './DateRangeFilter';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

import { FilterState } from './GlobalFilters';

interface HistoricalMonth {
  mes: number;
  ano: number;
  value: number;
  label: string;
}

const ATESTADO_COLOR = '#f97316'; // Orange-500

interface DashboardAtestadosProps {
  filters: FilterState;
}

const DashboardAtestados: React.FC<DashboardAtestadosProps> = ({ filters }) => {
  const [data, setData] = useState<AtestadoDoc[]>([]);
  const [historicalStats, setHistoricalStats] = useState<HistoricalMonth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from('atestados').select('*');
      
      if (filters.ano !== 'all') {
        query = query.eq('ano', Number(filters.ano));
      }

      if (filters.unidade !== 'all') {
        query = query.eq('unidade', filters.unidade);
      }

      if (filters.mes !== 'all') {
        query = query.eq('mes', Number(filters.mes));
      }

      const { data: records, error } = await query;
          
      if (error) throw error;
      setData(records as AtestadoDoc[] || []);

      // --- FETCH HISTORICAL DATA FOR SELECTED UNIT ---
      if (filters.unidade !== 'all') {
        const refMonth = filters.mes === 'all' ? new Date().getMonth() + 1 : Number(filters.mes);
        const refYear = filters.ano === 'all' ? new Date().getFullYear() : Number(filters.ano);
        
        const monthsToFetch = [];
        for (let i = 1; i <= 3; i++) {
          let m = refMonth - i;
          let y = refYear;
          while (m <= 0) {
            m += 12;
            y -= 1;
          }
          monthsToFetch.push({ m, y });
        }

        const historicalPromises = monthsToFetch.map(async ({ m, y }) => {
          const { data } = await supabase.from('atestados')
            .select('quantidade')
            .eq('unidade', filters.unidade)
            .eq('mes', m)
            .eq('ano', y);
          
          const total = (data || []).reduce((acc, curr) => acc + curr.quantidade, 0);
          const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          
          return {
            mes: m,
            ano: y,
            value: total,
            label: `${monthLabels[m-1]}/${y.toString().slice(-2)}`
          };
        });

        const historicalResults = await Promise.all(historicalPromises);
        setHistoricalStats(historicalResults.reverse());
      } else {
        setHistoricalStats([]);
      }
    } catch (err: any) {
      console.error("Erro ao buscar atestados:", err);
      if (err.code === 'PGRST204') {
        alert("Erro de esquema no Supabase: Certifique-se de executar o script em supabase_schema.sql para adicionar as novas colunas necessárias para o ranking.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isDataTypeMatch = filters.tipo === 'all' || filters.tipo === 'atestados';
  const filteredData = isDataTypeMatch ? data : [];

  const totalAtestados = filteredData.reduce((acc, curr) => acc + curr.quantidade, 0);

  const unitsToCompare = filters.unidade !== 'all' ? [filters.unidade] : Array.from(new Set(data.map(d => d.unidade))).sort();

  const aggregatedByUnit = unitsToCompare.map(unit => {
    const unitRecords = filteredData.filter(d => d.unidade.toUpperCase().includes(unit.toUpperCase()));
    const total = unitRecords.reduce((acc, curr) => acc + curr.quantidade, 0);
    return { name: unit, total };
  });

  // --- NEW: RANKING OF CIDS ---
  const cidRanking = React.useMemo(() => {
    const rankingMap: Record<string, { total: number; desc: string }> = {};
    filteredData.forEach(d => {
      const code = d.cid_codigo || 'N/I';
      const desc = d.cid_descricao || 'Não Identificado';
      if (!rankingMap[code]) {
        rankingMap[code] = { total: 0, desc };
      }
      rankingMap[code].total += d.quantidade;
    });

    return Object.entries(rankingMap)
      .map(([code, data]) => ({ code, total: data.total, desc: data.desc }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10
  }, [filteredData]);

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando Dashboard de Atestados...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Historical Trend Section (Only when unit selected) */}
      {filters.unidade !== 'all' && historicalStats.length > 0 && (
        <div className="animate-in fade-in slide-in-from-left-4 duration-700">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Tendência Últimos 3 Meses • {filters.unidade}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {historicalStats.map((stat, idx) => {
              const isLast = idx === historicalStats.length - 1;
              return (
                <div key={stat.label} className={`card-minimal flex flex-col justify-between ${isLast ? 'border-orange-500/30 ring-1 ring-orange-500/5 bg-orange-50/20' : ''}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
                  </div>
                  <div>
                    <p className="text-xl font-black text-slate-700 leading-none mb-1">
                      {stat.value.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total de Atestados</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 p-4 rounded-2xl border border-white backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-orange-500" />
            Dashboard de Atestados
          </h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Emissão de Documentos Médicos</p>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-minimal border-l-4 border-l-orange-500">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Geral</p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">{totalAtestados.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-orange-500" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight italic">Consolidado no período selecionado</span>
          </div>
        </div>

        {aggregatedByUnit.map((item) => (
          <div key={item.name} className="card-minimal">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.name}</p>
                <h3 className="text-xl font-black text-slate-800 mt-1">{item.total.toLocaleString()}</h3>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <Building2 className="w-4 h-4 text-slate-400" />
              </div>
            </div>
            <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
               <div 
                 className="bg-orange-500 h-full rounded-full" 
                 style={{ width: `${totalAtestados > 0 ? (item.total / totalAtestados) * 100 : 0}%` }}
               />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Chart */}
        <div className="card-minimal">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                Atestados por Unidade
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Volume total comparativo</p>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregatedByUnit} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                <Tooltip 
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Bar dataKey="total" name="Quantidade" fill={ATESTADO_COLOR} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CID Ranking */}
        <div className="card-minimal">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                Top 10 Causas (CID)
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ranking de diagnósticos em atestados</p>
            </div>
            <Activity className="w-5 h-5 text-orange-500 opacity-20" />
          </div>

          <div className="space-y-4">
            {cidRanking.length > 0 ? (
              cidRanking.map((item, idx) => (
                <div key={idx} className="group flex flex-col gap-1.5">
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col gap-0.5 overflow-hidden max-w-[80%]">
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-tighter">
                        {idx + 1}. {item.code}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 truncate uppercase tracking-tight">
                        {item.desc}
                      </span>
                    </div>
                    <span className="text-[11px] font-black text-slate-800">{item.total.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.total / cidRanking[0].total) * 100}%` }}
                      transition={{ duration: 1, delay: idx * 0.1 }}
                      className="bg-orange-500 h-full rounded-full"
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                <BarChart3 className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Sem dados de ranking</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardAtestados;
