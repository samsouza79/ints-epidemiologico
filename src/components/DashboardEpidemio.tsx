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
import { Activity, Search, Filter, TrendingUp, Users, BarChart2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-minimal flex items-center gap-6">
          <div className="p-4 bg-green-50 rounded-2xl">
            <Activity className="w-8 h-8 text-ints-green" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Total de Notificações</p>
            <h3 className="text-3xl font-black text-slate-700">{filteredData.reduce((a, b) => a + Number(b.quantidade), 0).toLocaleString()}</h3>
          </div>
        </div>
        <div className="card-minimal flex items-center gap-6">
          <div className="p-4 bg-blue-50 rounded-2xl">
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">CIDs Diferentes</p>
            <h3 className="text-3xl font-black text-slate-700">{Object.keys(cidCounts).length}</h3>
          </div>
        </div>
        <div className="card-minimal flex items-center gap-6">
          <div className="p-4 bg-amber-50 rounded-2xl">
            <Users className="w-8 h-8 text-amber-600" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Capítulos Atordados</p>
            <h3 className="text-3xl font-black text-slate-700">{Object.keys(chapterCounts).length}</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-minimal h-full">
          <div className="flex items-center gap-3 mb-8 p-2">
            <Filter className="w-5 h-5 text-ints-green" />
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Distribuição por Capítulo CID-10</h3>
          </div>
          <div className="h-[350px] w-full">
            {sortedChapters.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedChapters} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    width={180}
                    tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 600 }}
                  />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="count" fill="#2D8653" radius={[0, 4, 4, 0]}>
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
