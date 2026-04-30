/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  ComposedChart,
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart, 
  Pie,
  Label
} from 'recharts';
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  HelpCircle,
  ArrowUpRight,
  BarChart3
} from 'lucide-react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { AtendimentoDoc, ExameDoc, AtestadoDoc } from '../types';
import { FIXED_GOALS, INSTITUTIONAL_GREEN } from '../constants';
import DateRangeFilter, { DateRange } from './DateRangeFilter';

import { FilterState } from './GlobalFilters';

interface DashboardProducaoProps {
  filters: FilterState;
}

interface HistoricalMonth {
  mes: number;
  ano: number;
  value: number;
  meta: number;
  label: string;
}

const DashboardProducao: React.FC<DashboardProducaoProps> = ({ filters }) => {
  const [dataAtendimentos, setDataAtendimentos] = useState<AtendimentoDoc[]>([]);
  const [dataExames, setDataExames] = useState<ExameDoc[]>([]);
  const [dataAtestados, setDataAtestados] = useState<AtestadoDoc[]>([]);
  const [historicalStats, setHistoricalStats] = useState<HistoricalMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynamicGoals, setDynamicGoals] = useState<Record<string, number>>(FIXED_GOALS);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
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
          console.log(`[DashboardProducao] Total em ${table}: ${totalToFetch}`);

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
              console.log(`[DashboardProducao] ${table}: carregados ${allRecords.length} de ${totalToFetch}...`);
              if (data.length < step || allRecords.length >= totalToFetch) {
                hasMore = false;
              } else {
                from += step;
              }
            } else {
              hasMore = false;
            }
            if (from > 200000) break; // Limit safeguard
          }
          return allRecords;
        };

        const [atendRes, examesRes, atestadosRes, goalsRes] = await Promise.all([
          filters.tipo === 'all' || filters.tipo === 'cids' ? fetchAll('atendimentos', filters) : Promise.resolve([]),
          filters.tipo === 'all' || filters.tipo === 'exames' ? fetchAll('exames', filters) : Promise.resolve([]),
          filters.tipo === 'all' || filters.tipo === 'atestados' ? fetchAll('atestados', filters) : Promise.resolve([]),
          supabase.from('settings').select('*').eq('key', 'contractual_goals').single()
        ]);
          
        setDataAtendimentos(atendRes as AtendimentoDoc[]);
        setDataExames(examesRes as ExameDoc[]);
        setDataAtestados(atestadosRes as AtestadoDoc[]);

        const defaultGoals: Record<string, number> = { "CS24": 10289, "CSI": 2058, "UPA": 6174 };
        let goalsData = defaultGoals;
        if (goalsRes.data) {
          goalsData = { ...defaultGoals, ...goalsRes.data.value };
          setDynamicGoals(goalsData);
        } else {
          setDynamicGoals(defaultGoals);
        }

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
            const table = (filters.tipo === 'exames' || filters.tipo === 'atestados') ? filters.tipo : 'atendimentos';
            
            let total = 0;
            let hFrom = 0;
            let hHasMore = true;

            while (hHasMore) {
              const { data, error } = await supabase.from(table)
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
              meta: goalsData[filters.unidade] || 0,
              label: `${monthLabels[m-1]}/${y.toString().slice(-2)}`
            };
          });

          const historicalResults = await Promise.all(historicalPromises);
          setHistoricalStats(historicalResults.reverse());
        } else {
          setHistoricalStats([]);
        }

      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filters]);

  const unitsToCompare = filters.unidade !== 'all' 
    ? [filters.unidade] 
    : Array.from(new Set([
        ...Array.from(new Set(dataAtendimentos.map(d => d.unidade))),
        ...Array.from(new Set(dataExames.map(d => d.unidade))),
        ...Array.from(new Set(dataAtestados.map(d => d.unidade))),
        ...Object.keys(dynamicGoals)
      ])).sort();

  const aggregatedData = unitsToCompare.map(unit => {
    const unitAtendimentos = dataAtendimentos.filter(d => d.unidade.toUpperCase().includes(unit.toUpperCase()));
    const unitExames = dataExames.filter(d => d.unidade.toUpperCase().includes(unit.toUpperCase()));
    const unitAtestados = dataAtestados.filter(d => d.unidade.toUpperCase().includes(unit.toUpperCase()));
    
    const totalAtendimentos = unitAtendimentos.reduce((acc, curr) => acc + curr.quantidade, 0);
    const totalExames = unitExames.reduce((acc, curr) => acc + curr.quantidade, 0);
    const totalAtestados = unitAtestados.reduce((acc, curr) => acc + curr.quantidade, 0);
    
    const meta = dynamicGoals[unit] || 0;
    const percentage = meta > 0 ? (totalAtendimentos / meta) * 100 : 0;
    
    let statusColor = 'text-red-500';
    let badgeClass = 'badge-red';
    
    if (percentage > 120) {
      statusColor = 'text-ints-green';
      badgeClass = 'badge-green';
    } else if (percentage >= 100) {
      statusColor = 'text-yellow-600';
      badgeClass = 'badge-yellow';
    }

    return {
      name: unit,
      atendimentos: totalAtendimentos,
      exames: totalExames,
      atestados: totalAtestados,
      meta: meta,
      percentage: Math.round(percentage),
      statusColor,
      badgeClass
    };
  });

  const showMeta = filters.tipo === 'all' || filters.tipo === 'cids';

  const CustomMetaLine = (props: any) => {
    const { x, y, width, value } = props;
    if (!value) return null;
    return (
      <line 
        x1={x - 4} 
        y1={y} 
        x2={x + width + 4} 
        y2={y} 
        stroke="#CBD5E1" 
        strokeWidth={4} 
        strokeLinecap="round"
      />
    );
  };


  const getBarColor = (percentage: number) => {
    if (percentage >= 120) return '#2D8653';
    if (percentage >= 100) return '#fbbf24';
    return '#ef4444';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ints-green"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Historical Trend Section (Only when unit selected) */}
      {filters.unidade !== 'all' && historicalStats.length > 0 && (
        <div className="animate-in fade-in slide-in-from-left-4 duration-700">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-5 h-5 text-ints-green" />
            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Tendência Últimos 3 Meses • {filters.unidade}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {historicalStats.map((stat, idx) => {
              const showStatMeta = filters.tipo === 'all' || filters.tipo === 'cids';
              const perc = stat.meta > 0 ? Math.round((stat.value / stat.meta) * 100) : 0;
              const isLast = idx === historicalStats.length - 1;
              
              return (
                <div key={stat.label} className={`card-minimal flex flex-col justify-between ${isLast ? 'border-ints-green/30 ring-1 ring-ints-green/5 bg-green-50/20' : ''}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</span>
                    {showStatMeta && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${perc >= 100 ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                        {perc}%
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-xl font-black text-slate-700 leading-none mb-1">
                      {stat.value.toLocaleString()}
                    </p>
                    {showStatMeta ? (
                      <p className="text-[10px] font-bold text-slate-400 uppercase">da meta de {stat.meta.toLocaleString()}</p>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Total de {filters.tipo}</p>
                    )}
                  </div>
                  {showStatMeta && (
                    <div className="mt-4 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-ints-green transition-all duration-1000" 
                        style={{ width: `${Math.min(perc, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header Summary Cards */}
      {showMeta && filters.unidade === 'all' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {aggregatedData.filter(d => d.meta > 0).map(unitData => (
            <div key={unitData.name} className="card-minimal flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Meta {unitData.name}</span>
                <span className={`badge-minimal ${unitData.badgeClass}`}>
                  {unitData.percentage}%
                </span>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-slate-700">
                  {unitData.atendimentos.toLocaleString()} / {unitData.meta.toLocaleString()}
                </p>
                <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000" 
                    style={{ 
                      width: `${Math.min(unitData.percentage, 100)}%`,
                      backgroundColor: getBarColor(unitData.percentage)
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats when not showing meta or for specific types */}
      {!showMeta && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card-minimal flex flex-col justify-between border-l-4 border-l-ints-green">
            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Total {filters.tipo.toUpperCase()}</span>
            <h3 className="text-3xl font-black text-slate-700 mt-2">
              {filters.tipo === 'exames' ? dataExames.reduce((a,b) => a + b.quantidade, 0).toLocaleString() : dataAtestados.reduce((a,b) => a + b.quantidade, 0).toLocaleString()}
            </h3>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Comparison Chart */}
        <div className="card-minimal">
          <div className="flex items-center justify-between mb-8 p-2">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
              Produção vs Meta por Unidade
            </h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400">
                <div className="w-2.5 h-2.5 bg-slate-200 rounded-sm"></div> Meta
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400">
                <div className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></div> Atend.
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-sm"></div> Exames
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400">
                <div className="w-2.5 h-2.5 bg-orange-500 rounded-sm"></div> Atest.
              </div>
            </div>
          </div>
          <div className="h-[400px] min-h-[400px] w-full">
            {aggregatedData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={aggregatedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip 
                    cursor={{ fill: '#F8FAFC' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center gap-8">
                                <span className="text-xs font-bold text-slate-500">Atendimentos:</span>
                                <span className="text-xs font-black text-blue-600">{data.atendimentos.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center gap-8">
                                <span className="text-xs font-bold text-slate-500">Meta:</span>
                                <span className="text-xs font-black text-slate-400">{data.meta.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center gap-8 border-t border-slate-50 pt-1">
                                <span className="text-xs font-bold text-slate-500">% Atingido:</span>
                                <span className={`text-xs font-black ${data.statusColor}`}>{data.percentage}%</span>
                              </div>
                              <div className="flex justify-between items-center gap-8 border-t border-slate-50 mt-2 pt-2">
                                <span className="text-xs font-bold text-slate-500">Exames:</span>
                                <span className="text-xs font-black text-green-600">{data.exames.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center gap-8">
                                <span className="text-xs font-bold text-slate-500">Atestados:</span>
                                <span className="text-xs font-black text-orange-600">{data.atestados.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {showMeta && <Bar dataKey="meta" shape={<CustomMetaLine />} isAnimationActive={false} />}
                  {(filters.tipo === 'all' || filters.tipo === 'cids') && <Bar dataKey="atendimentos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />}
                  {(filters.tipo === 'all' || filters.tipo === 'exames') && <Bar dataKey="exames" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={24} />}
                  {(filters.tipo === 'all' || filters.tipo === 'atestados') && <Bar dataKey="atestados" fill="#f97316" radius={[4, 4, 0, 0]} barSize={24} />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs font-medium uppercase tracking-widest">
                Sem dados para o período
              </div>
            )}
          </div>
        </div>

        {/* Global Distribution */}
        <div className="card-minimal">
          <h3 className="text-sm font-bold text-slate-700 mb-8 p-2 uppercase tracking-wide">Participação Total</h3>
          <div className="h-[300px] min-h-[300px] w-full">
             {aggregatedData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={aggregatedData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey={filters.tipo === 'all' || filters.tipo === 'cids' ? "atendimentos" : filters.tipo}
                  >
                    {aggregatedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={[ '#2D8653', '#48BB78', '#68D391'][index % 3]} />
                    ))}
                    <Label 
                      value="Volume" 
                      position="center" 
                      fill="#94A3B8" 
                      style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }} 
                    />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
             ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs font-medium uppercase tracking-widest">
                Sem dados para o período
              </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardProducao;
