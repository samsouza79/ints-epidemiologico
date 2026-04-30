/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import UploadSection from './components/UploadSection';
import DashboardProducao from './components/DashboardProducao';
import DashboardExames from './components/DashboardExames';
import DashboardAtestados from './components/DashboardAtestados';
import DashboardApoio from './components/DashboardApoio';
import DashboardEpidemio from './components/DashboardEpidemio';
import DashboardRelatorios from './components/DashboardRelatorios';
import AdminSettings from './components/AdminSettings';
import GlobalFilters, { FilterState } from './components/GlobalFilters';
import { Hospital, LogIn, ShieldAlert, Loader2, Mail, LayoutDashboard, BarChart3, Stethoscope, FileText, FileUp, ClipboardList, ShieldCheck } from 'lucide-react';
import { INSTITUTIONAL_GREEN, ADMIN_EMAILS } from './constants';
import { supabase } from './lib/supabase';
import { Profile } from './types';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('producao');

  const [globalFilters, setGlobalFilters] = useState<FilterState>({
    unidade: 'all',
    ano: new Date().getFullYear().toString(),
    mes: 'all',
    tipo: 'all'
  });

  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const fetchFilterOptions = async () => {
    try {
      // Get unique units from cids, exames, and atestados
      const tables = ['cids', 'exames', 'atestados'];
      const unitPromises = tables.map(t => supabase.from(t).select('unidade'));
      const unitResults = await Promise.all(unitPromises);
      
      const allUnits = unitResults.flatMap(r => r.data || []).map(i => i.unidade);
      setAvailableUnits(Array.from(new Set(allUnits)).filter(Boolean).sort());

      // Get unique years
      const yearPromises = tables.map(t => supabase.from(t).select('ano'));
      const yearResults = await Promise.all(yearPromises);
      const allYears = yearResults.flatMap(r => r.data || []).map(i => i.ano.toString());
      setAvailableYears(Array.from(new Set(allYears)).filter(Boolean).sort());
    } catch (err) {
      console.error("Error fetching filter options:", err);
    }
  };

  const [eventType, setEventType] = useState<string | null>(null);

  useEffect(() => {
    fetchFilterOptions();
    // 1. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth event:", event, session?.user?.email);
      setSession(session);
      setEventType(event);
      if (session) {
        await fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // 2. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id, session.user.email);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, email?: string) => {
    const isAdmin = ADMIN_EMAILS.includes(email?.toLowerCase() || '');
    
    try {
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Fallback for admin users if database fails or profile missing
        if (isAdmin) {
          setProfile({
            id: userId,
            email: email || '',
            nome: email?.split('@')[0] || 'Administrador',
            role: 'admin',
            status: 'approved'
          });
          return;
        }
        
        if (error.code === 'PGRST116') {
          // Create profile if missing
          const newProfile = {
            id: userId,
            email: email || '',
            nome: email?.split('@')[0] || 'Usuário',
            role: isAdmin ? 'admin' : 'user',
            status: isAdmin ? 'approved' : 'pending'
          };

          const { data: created, error: createError } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();

          if (!createError) setProfile(created);
        }
      } else if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      // Absolute fallback
      if (isAdmin) {
        setProfile({
          id: userId,
          email: email || '',
          nome: email?.split('@')[0] || 'Administrador',
          role: 'admin',
          status: 'approved'
        });
      }
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    const normalizedEmail = email.trim().toLowerCase();
    setSigningIn(true);
    setAuthError(null);

    try {
      if (isSignup) {
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }
        
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: password,
          options: {
            data: {
              full_name: normalizedEmail.split('@')[0],
            }
          }
        });

        if (error) throw error;
        
        if (data.user) {
          // Criar perfil pendente imediatamente para o administrador poder aprovar
          const isAdmin = ADMIN_EMAILS.includes(normalizedEmail);
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            email: normalizedEmail,
            nome: normalizedEmail.split('@')[0],
            role: isAdmin ? 'admin' : 'user',
            status: isAdmin ? 'approved' : 'pending'
          });

          if (profileError) {
            console.warn("Aviso: Perfil não pôde ser pré-criado, mas o usuário foi registrado no Auth:", profileError);
          }

          setSignupSuccess(true);
          setIsSignup(false);
          setPassword('');
          setConfirmPassword('');
        }
        return;
      }

      // MASTER BYPASS: Especial para o dono do aplicativo não ficar bloqueado
      if (normalizedEmail === 'samdefy.souza@gmail.com' && password === 'Mec@090779') {
        console.log("Master Access Granted");
        setProfile({
          id: 'master-admin',
          email: normalizedEmail,
          nome: 'Administrador Mestre',
          role: 'admin',
          status: 'approved'
        });
        setSession({ user: { id: 'master-admin', email: normalizedEmail } } as any);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password
      });
      
      if (error) {
        if (error.message === "Invalid login credentials") {
           throw new Error("E-mail ou senha incorretos.");
        }
        throw error;
      }
      
      if (data.user) {
        await fetchProfile(data.user.id, data.user.email);
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      setAuthError(error.message || "Erro na autenticação.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const renderContent = () => {
    // Shared props for all dashboards
    const dashboardProps = { filters: globalFilters };

    switch (activeTab) {
      case 'upload': return profile?.role === 'admin' ? <UploadSection profile={profile} /> : null;
      case 'producao': return <DashboardProducao {...dashboardProps} />;
      case 'exames': return profile?.role === 'admin' ? <DashboardExames {...dashboardProps} /> : null;
      case 'atestados': return profile?.role === 'admin' ? <DashboardAtestados {...dashboardProps} /> : null;
      case 'apoio': return <DashboardApoio />;
      case 'epidemio': return <DashboardEpidemio {...dashboardProps} />;
      case 'relatorios': return <DashboardRelatorios />;
      case 'admin': return profile?.role === 'admin' ? <AdminSettings user={session?.user} profile={profile} /> : null;
      default: return <DashboardProducao {...dashboardProps} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center mb-8 animate-pulse text-center">
          <span className="text-6xl font-black tracking-tighter text-ints-green">INTS</span>
          <span className="text-xs font-black text-ints-green opacity-70 uppercase tracking-[0.4em] mt-1">Epidemiológico</span>
        </div>
        <Loader2 className="w-8 h-8 text-ints-green animate-spin" />
      </div>
    );
  }

  if (session && profile?.status !== 'approved' && profile?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-ints-bg flex flex-col items-center justify-center p-4 text-center">
        <div className="card-minimal max-w-sm w-full p-8 space-y-6">
          <div className="flex flex-col items-center">
            <span className="text-4xl font-black tracking-tighter text-rose-500">ACESSO</span>
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em] mt-1">Bloqueado</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-800">Aguardando Aprovação</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              Sua conta precisa ser autorizada por um administrador.
            </p>
          </div>
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-3 bg-slate-800 text-white p-4 rounded-xl hover:bg-slate-900 transition-all shadow-md"
          >
            <LogIn className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-widest">Sair</span>
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-ints-bg flex flex-col items-center justify-center p-4 text-center">
        <div className="card-minimal max-w-sm w-full p-8 space-y-6">
          <div className="flex flex-col items-center">
            <span className="text-4xl font-black tracking-tighter text-ints-green">INTS</span>
            <span className="text-[10px] font-black text-ints-green opacity-70 uppercase tracking-[0.4em] mt-1">Epidemiológico</span>
          </div>
          
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-800">{isSignup ? 'Criar Conta' : 'Login'}</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-relaxed">
              {isSignup ? 'Solicite acesso ao sistema' : 'Gestão de Dados Assistenciais'}
            </p>
          </div>

          {signupSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col items-center gap-2">
              <Mail className="w-6 h-6 text-emerald-500 animate-bounce" />
              <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                Verifique seu e-mail para confirmar o cadastro!
              </p>
              <button onClick={() => setSignupSuccess(false)} className="text-[9px] font-black text-emerald-600 underline">Fechar</button>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="text-left space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">E-mail Profissional</label>
                <input 
                  type="email"
                  placeholder="seu@ints.org.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 bg-white border border-ints-gray rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-ints-green/30 transition-all font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Senha</label>
                </div>
                <input 
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 bg-white border border-ints-gray rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-ints-green/30 transition-all font-mono"
                  required
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
              </div>

              {isSignup && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Confirmar Senha</label>
                  <input 
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-3 bg-white border border-ints-gray rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-ints-green/30 transition-all font-mono"
                    required
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>

            {authError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-[10px] font-bold text-rose-500 uppercase tracking-tight">
                {authError}
              </div>
            )}

            <button 
              type="submit"
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 bg-ints-green text-white p-4 rounded-xl hover:bg-ints-green/90 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
            >
              {signingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              <span className="text-sm font-bold uppercase tracking-widest">
                {isSignup ? 'Solicitar Cadastro' : 'Entrar no Sistema'}
              </span>
            </button>

            <div className="pt-2">
              <button 
                type="button"
                onClick={() => {
                  setIsSignup(!isSignup);
                  setAuthError(null);
                }}
                className="text-[10px] font-bold text-ints-green/70 uppercase tracking-widest hover:text-ints-green transition-colors"
              >
                {isSignup ? 'Já possuo uma conta? Login' : 'Não tem conta? Criar conta'}
              </button>
            </div>
          </form>

          <p className="text-[10px] text-slate-400 font-medium leading-tight">
            {isSignup ? "Cadastro sujeito a aprovação manual pelo administrador da unidade." : "Acesso restrito a profissionais autorizados do INTS."}
          </p>

          <div className="pt-4 border-t border-slate-50">
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">© {new Date().getFullYear()} INTS Tecnologia</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={session.user} profile={profile} filters={globalFilters}>
      <GlobalFilters 
        filters={globalFilters} 
        onChange={setGlobalFilters} 
        availableUnits={availableUnits} 
        availableYears={availableYears} 
      />
      {renderContent()}
    </Layout>
  );
}
