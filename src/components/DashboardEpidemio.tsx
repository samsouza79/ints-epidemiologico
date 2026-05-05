/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Legend
} from 'recharts';
import { Activity, Search, Filter, TrendingUp, Users, BarChart2, Bell, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { CidDoc } from '../types';
import { INSTITUTIONAL_GREEN } from '../constants';
import DateRangeFilter, { DateRange } from './DateRangeFilter';
import { processCID, getCIDChapter } from '../lib/excelProcessor';

import { FilterState } from './GlobalFilters';

interface DashboardEpidemioProps {
  filters: FilterState;
}

const DashboardEpidemio: React.FC<DashboardEpidemioProps> = ({ filters }) => {
  const [data, setData] = useState<CidDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [notificacaoFilter, setNotificacaoFilter] = useState<'all' | 'pendente' | 'notificado' | 'ignorado'>('all');

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
          console.log(`[DashboardEpidemio] Total em ${table}: ${totalToFetch}`);

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
              console.log(`[DashboardEpidemio] ${table}: carregados ${allRecords.length} de ${totalToFetch}...`);
              if (data.length < step || allRecords.length >= totalToFetch) {
                hasMore = false;
              } else {
                from += step;
              }
            } else {
              hasMore = false;
            }
            if (from > 200000) break;
          }
          return allRecords;
        };

        const records = await fetchAll('cids', filters);
        setData(records as CidDoc[] || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filters.ano, filters.unidade, filters.mes]);

  // If tipo is specified and it's not cids or all, we show no data for this specific CID dashboard
  const isDataTypeMatch = filters.tipo === 'all' || filters.tipo === 'cids';
  const filteredData = isDataTypeMatch ? data : [];

  // Notification Stats
  const notificaveis = filteredData.filter(d => d.is_notificavel);
  const pendentes = notificaveis.filter(d => d.notificacao_status === 'pendente');
  const notificados = notificaveis.filter(d => d.notificacao_status === 'notificado');

  const updateNotificacaoStatus = async (id: string, newStatus: 'notificado' | 'ignorado') => {
    try {
      const { error } = await supabase
        .from('cids')
        .update({ notificacao_status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      setData(prev => prev.map(item => item.id === id ? { ...item, notificacao_status: newStatus } : item));
    } catch (err) {
      console.error('Erro ao atualizar status da notificação:', err);
      alert('Erro ao atualizar o status.');
    }
  };

  const chapterCounts = filteredData.reduce((acc, curr) => {
    let code = (curr.codigo || 'N/I').trim().toUpperCase();
    const chapter = getCIDChapter(code);
    acc[chapter] = (acc[chapter] || 0) + (Number(curr.quantidade) || 1);
    return acc;
  }, {} as Record<string, number>);

  const sortedChapters = Object.entries(chapterCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => Number(b.count) - Number(a.count));

  const cidCounts = filteredData.reduce((acc, curr) => {
    let code = (curr.codigo || 'N/I').trim().toUpperCase();
    let desc = curr.descricao || '';
    
    // Inteligência adicional: tenta re-identificar se estiver como N/I
    if ((code === 'N/I' || code === 'N/A' || code === '') && desc) {
      const reParsed = processCID(desc);
      if (reParsed.code !== 'N/I') {
        code = reParsed.code;
        desc = reParsed.description || desc;
      }
    }

    const key = `${code}: ${desc}`;
    acc[key] = (acc[key] || 0) + (Number(curr.quantidade) || 1);
    return acc;
  }, {} as Record<string, number>);

  const topCids = Object.entries(cidCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 10);

  // Evolução Mensal por Capítulo (Top 3)
  const top3Chapters = sortedChapters.slice(0, 3).map(c => c.name);
  const evolutionData = [1,2,3,4,5,6,7,8,9,10,11,12].map(mes => {
    const mesData = filteredData.filter(d => d.mes === mes);
    const result: any = { mes: mes.toString().padStart(2, '0') };
    top3Chapters.forEach(cap => {
      result[cap] = mesData
        .filter(d => getCIDChapter(d.codigo) === cap)
        .reduce((sum, curr) => sum + (Number(curr.quantidade) || 1), 0);
    });
    return result;
  }).filter(m => Object.keys(m).length > 1 && Object.values(m).some(v => v !== '00' && v !== 0));

  const filteredList = Object.entries(cidCounts)
    .map(([name, count]) => ({ name, count, chapter: getCIDChapter(name.split(':')[0].trim()) }))
    .filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => Number(b.count) - Number(a.count));

  // Notification cases for the dedicated table
  const notificationTableData = notificaveis
    .filter(d => {
      if (notificacaoFilter === 'all') return true;
      return d.notificacao_status === notificacaoFilter;
    })
    .filter(d => {
      if (!searchTerm) return true;
      return (d.codigo + d.descricao + d.paciente).toLowerCase().includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Data for Unit Comparison
  const unitsForComparison = filters.unidade === 'all' 
    ? Array.from(new Set(filteredData.map(d => d.unidade)))
    : [filters.unidade];

  const top5CidCodes = topCids.slice(0, 5).map(c => c.name.split(':')[0].trim());
  
  const unitComparisonData = unitsForComparison.map(unit => {
    const unitRecords = filteredData.filter(d => d.unidade === unit);
    const result: any = { unit };
    
    let otherCount = 0;
    unitRecords.forEach(record => {
      if (top5CidCodes.includes(record.codigo)) {
        result[record.codigo] = (result[record.codigo] || 0) + (Number(record.quantidade) || 1);
      } else {
        otherCount += (Number(record.quantidade) || 1);
      }
    });
    
    result['Outros'] = otherCount;
    return result;
  });

  const COLORS = ['#2D8653', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#94A3B8', '#10B981', '#EC4899', '#6366F1'];

  if (loading) return <div className="p-12 text-center text-[#1A6B3A]">Carregando dados epidemiológicos...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Alerta de Notificações Pendentes */}
      {pendentes.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-full animate-pulse">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-800">⚠️ Casos com notificação obrigatória detectados</p>
              <p className="text-xs text-rose-600 font-medium">Existem {pendentes.length} notificações compulsórias pendentes de envio à vigilância epidemiológica.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              setNotificacaoFilter('pendente');
              const el = document.getElementById('notificacoes-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-4 py-2 bg-rose-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-rose-700 transition-all"
          >
            Ver Pendências
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card-minimal flex items-center gap-4">
          <div className="p-3 bg-green-50 rounded-2xl">
            <Activity className="w-6 h-6 text-ints-green" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Sincronizado</p>
            <h3 className="text-2xl font-black text-slate-700">{filteredData.length.toLocaleString()}</h3>
          </div>
        </div>
        <div className="card-minimal flex items-center gap-4 border-rose-100 bg-rose-50/10">
          <div className="p-3 bg-rose-50 rounded-2xl">
            <Bell className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notificáveis</p>
            <h3 className="text-2xl font-black text-rose-600">{notificaveis.length}</h3>
          </div>
        </div>
        <div className="card-minimal flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-2xl">
            <Clock className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes</p>
            <h3 className="text-2xl font-black text-amber-600">{pendentes.length}</h3>
          </div>
        </div>
        <div className="card-minimal flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-2xl">
            <CheckCircle className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notificados</p>
            <h3 className="text-2xl font-black text-blue-600">{notificados.length}</h3>
          </div>
        </div>
      </div>

      <div id="notificacoes-section" className="card-minimal overflow-hidden !p-0 border-rose-200 ring-1 ring-rose-50 shadow-lg shadow-rose-100/20">
        <div className="p-6 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rose-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500 rounded-xl">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Gestão de Notificações Compulsórias</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Detecção automática por CID-10</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {(['all', 'pendente', 'notificado', 'ignorado'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setNotificacaoFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                    notificacaoFilter === f ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {f === 'all' ? 'Tudo' : f}
                </button>
              ))}
            </div>
            
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Paciente ou CID..." 
                className="pl-9 pr-4 py-2 border border-rose-100 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/10 transition-all w-48 bg-rose-50/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">CID</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Paciente</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {notificationTableData.length > 0 ? notificationTableData.map((item, i) => (
                <tr key={i} className={`hover:bg-rose-50/20 transition-colors ${item.notificacao_status === 'pendente' ? 'bg-rose-50/5' : ''}`}>
                  <td className="px-6 py-4">
                    <span className={`badge-minimal text-[9px] font-black border-none px-2 py-1 ${
                      item.notificacao_status === 'notificado' ? 'bg-blue-100 text-blue-600' :
                      item.notificacao_status === 'pendente' ? 'bg-rose-100 text-rose-600 animate-pulse' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {item.notificacao_status?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-700">{item.codigo}</span>
                      <span className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">{item.descricao}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-600 uppercase">{item.paciente}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">
                      {item.unidade}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.notificacao_status === 'pendente' && (
                      <div className="flex justify-end gap-1.5">
                        <button 
                          onClick={() => updateNotificacaoStatus(item.id!, 'notificado')}
                          title="Marcar como Notificado"
                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => updateNotificacaoStatus(item.id!, 'ignorado')}
                          title="Ignorar Notificação"
                          className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-200 transition-all border border-slate-100"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">
                    Nenhuma notificação encontrada para os filtros aplicados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-minimal h-full">
          <div className="flex items-center gap-3 mb-8 p-2">
            <BarChart2 className="w-5 h-5 text-ints-green" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Distribuição por Capítulo CID-10</h3>
          </div>
          <div className="h-[350px] w-full">
            {sortedChapters.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedChapters} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45} 
                    textAnchor="end" 
                    interval={0}
                    height={80}
                    tick={{ fill: '#94A3B8', fontSize: 9, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                      padding: '12px'
                    }}
                    formatter={(value: number) => [value, 'Quantidade']}
                    labelStyle={{ fontWeight: 'bold', color: '#1E293B', marginBottom: '4px' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {sortedChapters.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-slate-300 text-xs uppercase font-bold">Sem dados</div>
            )}
          </div>
        </div>

        <div className="card-minimal h-full">
          <div className="flex items-center gap-3 mb-8 p-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Tendência Mensal (Top Capítulos)</h3>
          </div>
          <div className="h-[350px] w-full">
            {evolutionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  {top3Chapters.map((cap, index) => (
                    <Bar key={cap} dataKey={cap} fill={COLORS[index % COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-slate-300 text-xs uppercase font-bold">Dados insuficientes para tendência</div>
            )}
          </div>
        </div>
      </div>

      <div className="card-minimal">
        <div className="flex items-center justify-between mb-8 p-2">
          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Perfil por CID Individual (Top 10)</h3>
          </div>
        </div>
        
        <div className="h-[350px] min-h-[350px] w-full">
          {topCids.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={topCids} 
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F1F5F9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  width={150}
                  tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }}
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: '600' }}
                />
                <Bar dataKey="count" fill="#2D8653" radius={[0, 4, 4, 0]} barSize={20}>
                  {topCids.map((entry, index) => (
                    <Cell key={`cell-${index}`} fillOpacity={1 - (index * 0.08)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs font-medium uppercase tracking-widest">
              Sem dados para o período
            </div>
          )}
        </div>
      </div>

      <div className="card-minimal overflow-hidden !p-0">
        <div className="p-6 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Analítico Epidemiológico</h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar por CID ou Descrição..." 
              className="pl-9 pr-4 py-2 border border-ints-gray rounded-full text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-ints-green/10 transition-all w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Descrição</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Capítulo CID-10</th>
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Freq.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredList.map((item, i) => {
                const [code, ...desc] = item.name.split(':');
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-ints-green">{code}</td>
                    <td className="px-6 py-4 text-slate-500">{desc.join(':').trim()}</td>
                    <td className="px-6 py-4">
                      <span className="badge-minimal text-[10px] bg-slate-100 text-slate-500 border-none">
                        {item.chapter}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-slate-700">
                        {item.count}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardEpidemio;
