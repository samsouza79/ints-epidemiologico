/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area
} from 'recharts';
import { Stethoscope, FlaskConical, Percent, WalletCards, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AtestadoDoc, ExameDoc, AtendimentoDoc } from '../types';
import { MONTHS } from '../constants';
import DateRangeFilter, { DateRange } from './DateRangeFilter';

const DashboardApoio: React.FC = () => {
  const [atestados, setAtestados] = useState<AtestadoDoc[]>([]);
  const [exames, setExames] = useState<ExameDoc[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoDoc[]>([]);
  const [loading, setLoading] = useState(true);
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
        const [ateRes, exaRes, atendRes] = await Promise.all([
          supabase.from('atestados').select('*').gte('ano', dateRange.startYear).lte('ano', dateRange.endYear),
          supabase.from('exames').select('*').gte('ano', dateRange.startYear).lte('ano', dateRange.endYear),
          supabase.from('atendimentos').select('*').gte('ano', dateRange.startYear).lte('ano', dateRange.endYear)
        ]);

        if (ateRes.error) throw ateRes.error;
        if (exaRes.error) throw exaRes.error;
        if (atendRes.error) throw atendRes.error;

        setAtestados(ateRes.data as AtestadoDoc[] || []);
        setExames(exaRes.data as ExameDoc[] || []);
        setAtendimentos(atendRes.data as AtendimentoDoc[] || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange.startYear, dateRange.endYear]);

  const isWithinRange = (mes: number, ano: number) => {
    const recordVal = ano * 12 + (mes - 1);
    const startVal = dateRange.startYear * 12 + (dateRange.startMonth - 1);
    const endVal = dateRange.endYear * 12 + (dateRange.endMonth - 1);
    return recordVal >= startVal && recordVal <= endVal;
  };

  const filteredAtestados = atestados.filter(d => isWithinRange(d.mes, d.ano));
  const filteredExames = exames.filter(d => isWithinRange(d.mes, d.ano));
  const filteredAtendimentos = atendimentos.filter(d => isWithinRange(d.mes, d.ano));

  const totalAtestados = filteredAtestados.reduce((a, b) => a + b.quantidade, 0);
  const totalExames = filteredExames.reduce((a, b) => a + b.quantidade, 0);
  const totalAtend = filteredAtendimentos.reduce((a, b) => a + b.quantidade, 0);
  const taxaAtestados = totalAtend > 0 ? (totalAtestados / totalAtend) * 100 : 0;

  // Monthly trends - Adjusting to include years if range spans across years
  const trendData = [];
  let currentMonth = dateRange.startMonth;
  let currentYear = dateRange.startYear;

  while (currentYear * 12 + (currentMonth - 1) <= dateRange.endYear * 12 + (dateRange.endMonth - 1)) {
    const aCount = filteredAtestados.filter(d => d.mes === currentMonth && d.ano === currentYear).reduce((acc, curr) => acc + curr.quantidade, 0);
    const eCount = filteredExames.filter(d => d.mes === currentMonth && d.ano === currentYear).reduce((acc, curr) => acc + curr.quantidade, 0);
    
    trendData.push({ 
      name: `${MONTHS[currentMonth-1].substring(0, 3)}/${String(currentYear).substring(2)}`, 
      atestados: aCount, 
      exames: eCount 
    });

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
    // Safety break
    if (trendData.length > 24) break; 
  }

  if (loading) return <div className="p-12 text-center text-[#1A6B3A]">Carregando dados de apoio...</div>;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-500">
      <div className="flex justify-start">
        <DateRangeFilter range={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-minimal flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Atestados</p>
            <h3 className="text-3xl font-black text-slate-700 mt-1">{totalAtestados.toLocaleString()}</h3>
            <p className="text-[10px] text-ints-green font-bold uppercase mt-2 tracking-widest">
              {taxaAtestados.toFixed(1)}% do volume
            </p>
          </div>
          <div className="p-4 bg-orange-50 rounded-2xl">
            <Stethoscope className="w-8 h-8 text-orange-600" />
          </div>
        </div>

        <div className="card-minimal flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Exames</p>
            <h3 className="text-3xl font-black text-slate-700 mt-1">{totalExames.toLocaleString()}</h3>
            <p className="text-[10px] text-blue-600 font-bold uppercase mt-2 tracking-widest">
              Apoio Diagnóstico
            </p>
          </div>
          <div className="p-4 bg-blue-50 rounded-2xl">
            <FlaskConical className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="card-minimal flex items-center justify-between">
          <div>
            <p className="text-[12px] font-bold text-slate-400 uppercase tracking-widest">Total Geral</p>
            <h3 className="text-3xl font-black text-slate-700 mt-1">{totalAtend.toLocaleString()}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">
              Base Produtiva
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-2xl">
            <WalletCards className="w-8 h-8 text-slate-600" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-minimal">
          <h3 className="text-sm font-bold text-slate-700 mb-8 p-2 uppercase tracking-wide flex items-center gap-2">
            Tendência: Atestados
          </h3>
          <div className="h-[300px] min-h-[300px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorAte" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', fontSize: '11px' }}
                  />
                  <Area type="monotone" dataKey="atestados" stroke="#f97316" fillOpacity={1} fill="url(#colorAte)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs font-medium uppercase tracking-widest">
                Sem dados para o período
              </div>
            )}
          </div>
        </div>

        <div className="card-minimal">
          <h3 className="text-sm font-bold text-slate-700 mb-8 p-2 uppercase tracking-wide flex items-center gap-2">
            Tendência: Exames
          </h3>
          <div className="h-[300px] min-h-[300px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorExa" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 600 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', fontSize: '11px' }}
                  />
                  <Area type="monotone" dataKey="exames" stroke="#3b82f6" fillOpacity={1} fill="url(#colorExa)" strokeWidth={2} />
                </AreaChart>
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

export default DashboardApoio;
