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
        let query = supabase.from('cids').select('*');
        
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

  const cidCounts = filteredData.reduce((acc, curr) => {
    const key = `${curr.codigo}: ${curr.descricao}`;
    acc[key] = (acc[key] || 0) + (Number(curr.quantidade) || 1);
    return acc;
  }, {} as Record<string, number>);

  const topCids = Object.entries(cidCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 10);

  const filteredList = Object.entries(cidCounts)
    .map(([name, count]) => ({ name, count }))
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

  const COLORS = ['#2D8653', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#94A3B8'];

  if (loading) return <div className="p-12 text-center text-[#1A6B3A]">Carregando dados epidemiológicos...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
      </div>

      <div className="card-minimal">
        <div className="flex items-center justify-between mb-8 p-2">
          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Perfil Epidemiológico (Top CIDs)</h3>
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

      <div className="card-minimal">
        <div className="flex items-center gap-3 mb-8 p-2">
          <BarChart2 className="w-5 h-5 text-ints-green" />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Distribuição por Unidade</h3>
        </div>
        
        <div className="h-[400px] min-h-[400px] w-full">
          {unitComparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={unitComparisonData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="unit" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 700 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94A3B8', fontSize: 10 }}
                />
                <Tooltip 
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: '600' }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle"
                  wrapperStyle={{ fontSize: '10px', fontWeight: '700', paddingBottom: '20px' }}
                />
                {top5CidCodes.map((cid, index) => (
                  <Bar 
                    key={cid} 
                    dataKey={cid} 
                    stackId="a" 
                    fill={COLORS[index % COLORS.length]} 
                    barSize={40}
                    radius={index === 0 ? [0, 0, 0, 0] : [0, 0, 0, 0]} 
                  />
                ))}
                <Bar 
                  dataKey="Outros" 
                  stackId="a" 
                  fill="#CBD5E1" 
                  barSize={40} 
                  radius={[6, 6, 0, 0]} 
                />
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
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Analítico por Diagnóstico</h3>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtrar..." 
              className="pl-9 pr-4 py-2 border border-ints-gray rounded-full text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-ints-green/10 transition-all w-48"
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
                <th className="px-6 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Freq.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredList.map((item, i) => {
                const [code, ...desc] = item.name.split(':');
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-700">{code}</td>
                    <td className="px-6 py-4 text-slate-500">{desc.join(':').trim()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-ints-green">
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
