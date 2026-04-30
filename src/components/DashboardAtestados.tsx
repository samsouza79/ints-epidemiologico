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
import { processCID } from '../lib/excelProcessor';
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
      // Recursive fetch for atestados
      const fetchAll = async (table: string, filters: FilterState) => {
        let allRecords: any[] = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        // Get total count first
        let queryCount = supabase.from(table).select('*', { count: 'exact', head: true });
        if (filters.ano !== 'all') queryCount = queryCount.eq('ano', Number(filters.ano));
        if (filters.unidade !== 'all') queryCount = queryCount.eq('unidade', filters.unidade);
        if (filters.mes !== 'all') queryCount = queryCount.eq('mes', Number(filters.mes));
        
        const { count } = await queryCount;
        const totalToFetch = count || 0;
        console.log(`[DashboardAtestados] Total no banco: ${totalToFetch}`);

        while (hasMore) {
          let query = supabase.from(table)
            .select('*')
            .range(from, from + step - 1)
            .order('id', { ascending: true });
          
          if (filters.ano !== 'all') query = query.eq('ano', Number(filters.ano));
          if (filters.unidade !== 'all') query = query.eq('unidade', filters.unidade);
          if (filters.mes !== 'all') query = query.eq('mes', Number(filters.mes));

          const { data, error } = await query;
          if (error) throw error;
          
          if (data && data.length > 0) {
            allRecords = [...allRecords, ...data];
            console.log(`[DashboardAtestados] Carregados ${allRecords.length} de ${totalToFetch}...`);
            if (data.length < step || allRecords.length >= totalToFetch) {
              hasMore = false;
            } else {
              from += step;
            }
          } else {
            hasMore = false;
          }
          if (from > 150000) break;
        }
        return allRecords;
      };

      const records = await fetchAll('atestados', filters);
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
          let total = 0;
          let hFrom = 0;
          let hHasMore = true;

          while (hHasMore) {
            const { data, error } = await supabase.from('atestados')
              .select('quantidade')
              .range(hFrom, hFrom + 999)
              .order('id', { ascending: true }) // Added order
              .eq('unidade', filters.unidade)
              .eq('mes', m)
              .eq('ano', y);
            
            if (error) throw error;
            if (data && data.length > 0) {
              total += data.reduce((acc, curr) => acc + curr.quantidade, 0);
              hHasMore = data.length === 1000;
              hFrom += 1000;
            } else {
              hHasMore = false;
            }
            if (hFrom > 100000) break;
          }

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
      let code = (d.cid_codigo || 'N/I').trim().toUpperCase();
      let desc = d.cid_descricao || 'Não Identificado';

      // Inteligência adicional: Se o código for N/I mas a descrição tiver um CID, tenta extrair
      if (code === 'N/I' && desc !== 'Não Identificado') {
        const reParsed = processCID(desc);
        if (reParsed.code !== 'N/I') {
          code = reParsed.code;
          desc = reParsed.description || desc;
        }
      }
      
      if (code === '' || code === 'NI' || code === 'N/A' || code.includes('NÃO IDENTIFICADO')) {
        code = 'N/I';
      }
      
      if (!rankingMap[code]) {
        rankingMap[code] = { total: 0, desc };
      }
      rankingMap[code].total += d.quantidade;
    });

    console.log('CIDs processados no Dashboard:', rankingMap);

    const sortedAll = Object.entries(rankingMap)
      .map(([code, data]) => ({ code, total: data.total, desc: data.desc }))
      .sort((a, b) => b.total - a.total);

    const validos = sortedAll.filter(item => item.code !== 'N/I');
    const ni = sortedAll.find(item => item.code === 'N/I');

    // Pegar o top 10, mas se tiver N/I, ele deve ser incluído no final se estiver entre os maiores
    // ou simplesmente adicionado se houver espaço. 
    // A regra solicitada é: separar válidos, pegar top, adicionar NI no fim do resultado exibido.
    
    let result = validos.slice(0, 10);
    
    // Se o NI for relevante (estiver no top 10 original), vamos incluí-lo
    const isNIInTop10 = sortedAll.slice(0, 10).some(item => item.code === 'N/I');
    
    if (isNIInTop10 && ni) {
      // Se NI estava no top 10, garantimos que ele apareça, mesmo que desloque o 10º
      if (result.length >= 10) {
        result[9] = ni;
      } else {
        result.push(ni);
      }
    }

    return result;
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
