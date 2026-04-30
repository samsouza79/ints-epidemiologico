/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileUp, 
  Activity, 
  Stethoscope, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  Hospital,
  ChevronRight,
  ShieldCheck,
  ClipboardList,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { INSTITUTIONAL_GREEN } from '../constants';

import { Profile } from '../types';
import { supabase } from '../lib/supabase';

import { FilterState } from './GlobalFilters';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  profile: Profile | null;
  filters: FilterState;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, user, profile, filters }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const monthLabels = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const monthName = filters.mes !== 'all' ? monthLabels[Number(filters.mes) - 1] : '';
  const unitName = filters.unidade !== 'all' ? filters.unidade : '';
  
  const logout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const adminOnlyItems = ['upload', 'exames', 'atestados', 'admin'];

  const menuItems = [
    { id: 'producao', label: 'Produção / Metas', icon: BarChart3 },
    { id: 'exames', label: 'Exames', icon: Stethoscope },
    { id: 'atestados', label: 'Atestados', icon: FileText },
    { id: 'apoio', label: 'Apoio Assistencial', icon: Activity },
    { id: 'epidemio', label: 'Epidemiológico', icon: LayoutDashboard },
    { id: 'upload', label: 'Upload de Arquivos', icon: FileUp },
    { id: 'relatorios', label: 'Relatórios', icon: ClipboardList },
    { id: 'admin', label: 'Configurações Admin', icon: ShieldCheck },
  ].filter(item => {
    if (adminOnlyItems.includes(item.id)) {
      return profile?.role === 'admin';
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Mobile Overlay */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsSidebarOpen(true)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 240 : 80 }}
        className="bg-white border-r border-ints-gray z-50 flex flex-col"
      >
        <div className="flex flex-col py-8 px-6 items-center">
          {isSidebarOpen ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="flex flex-col items-center"
            >
              <span className="text-2xl font-black tracking-tighter text-ints-green">INTS</span>
              <div className="text-center mt-0.5">
                <span className="text-[10px] font-black text-ints-green border-t border-green-100 pt-1 px-4 uppercase tracking-[0.2em] inline-block">Epidemiológico</span>
              </div>
            </motion.div>
          ) : (
            <span className="text-xl font-black tracking-tighter text-ints-green">INTS</span>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-6 py-3 transition-all duration-200 border-l-4 ${
                  isActive 
                    ? 'bg-green-50 text-ints-green border-ints-green' 
                    : 'text-slate-500 border-transparent hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-ints-green' : ''}`} />
                {isSidebarOpen && (
                  <motion.span 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="font-medium text-sm whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-ints-gray">
          <div className={`flex items-center gap-3 ${isSidebarOpen ? 'px-2' : 'justify-center'}`}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-ints-green flex items-center justify-center text-white text-xs">
                {user?.displayName?.charAt(0) || 'U'}
              </div>
            )}
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{profile?.nome || user?.email?.split('@')[0]}</p>
                <div className="flex items-center gap-1">
                  <p className="text-[10px] text-slate-400 truncate uppercase tracking-widest">{user?.email}</p>
                  <span className={`text-[8px] font-black uppercase px-1 rounded ${profile?.role === 'admin' ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-slate-400'}`}>
                    {profile?.role === 'admin' ? 'Administrador' : 'Usuário'}
                  </span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => logout()}
            className={`w-full mt-4 flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 border-l-4 border-transparent transition-colors ${
              !isSidebarOpen && 'justify-center'
            }`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="font-medium text-sm">Sair</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-ints-bg">
        <header className="h-20 flex items-center justify-between px-8 bg-ints-bg">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {menuItems.find(m => m.id === activeTab)?.label || 'Dashboard'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {unitName && `Unidade: ${unitName}`} 
              {unitName && monthName && ' - '} 
              {monthName && `Período: ${monthName} ${filters.ano}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex gap-2">
                {unitName && (
                  <span className="bg-white border border-ints-gray px-3 py-1 rounded-full text-xs text-slate-500">Unidade: {unitName}</span>
                )}
                {monthName && (
                  <span className="bg-white border border-ints-gray px-3 py-1 rounded-full text-xs text-slate-500">Mês: {monthName}</span>
                )}
             </div>
             <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors border border-ints-gray bg-white hidden lg:block"
             >
              <Menu className="w-5 h-5 text-slate-600" />
             </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="max-w-7xl mx-auto min-h-full flex flex-col">
            <div className="flex-1">
              {children}
            </div>
            <footer className="mt-12 py-8 border-t border-ints-gray flex justify-center">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">
                Desenvolvido por Wellington Souza
              </p>
            </footer>
          </div>
        </section>
      </main>
    </div>
  </div>
  );
};

export default Layout;
