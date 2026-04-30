import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FIXED_GOALS, UNITS } from '../constants';
import { 
  Save, 
  ShieldCheck, 
  AlertTriangle, 
  Settings2, 
  Trash2, 
  History, 
  Database,
  Search,
  RefreshCw,
  Clock,
  X,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Mail,
  User
} from 'lucide-react';
import { UserRole, Profile, ProfileStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface UploadHistory {
  id: string;
  filename: string;
  unidade: string;
  tipo: string;
  registros: number;
  mes: number;
  ano: number;
  created_at: string;
}

interface AdminSettingsProps {
  user?: any;
  profile: Profile | null;
}

const AdminSettings: React.FC<AdminSettingsProps> = ({ user, profile }) => {
  const [goals, setGoals] = useState<Record<string, number>>(FIXED_GOALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<UploadHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingUnit, setDeletingUnit] = useState<string | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'goals' | 'users' | 'history' | 'danger'>('goals');

  const isAdmin = profile?.role === 'admin';
  
  // Controlled Delete State
  const [controlDelete, setControlDelete] = useState({
    type: '',
    unit: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  const [isDeletingControlled, setIsDeletingControlled] = useState(false);

  // User Management State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Record<string, UserRole>>({});

  useEffect(() => {
    fetchSettings();
    fetchHistory();
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setLoadingProfiles(true);
    try {
      console.log("Buscando perfis na tabela 'profiles'...");
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true })
        .order('nome', { ascending: true });

      if (error) {
        console.error("Erro Supabase:", error);
        throw error;
      }
      
      console.log("Perfis encontrados:", data?.length, data);
      setProfiles(data || []);
      
      // Initialize selected roles for the UI selects
      const roles: Record<string, UserRole> = {};
      (data || []).forEach(p => roles[p.id] = p.role);
      setSelectedRole(roles);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const updateUserStatus = async (userId: string, newStatus: ProfileStatus, forcedRole?: UserRole) => {
    const roleForUser = forcedRole || selectedRole[userId] || 'user';
    const action = newStatus === 'approved' ? 'APROVAR' : 'BLOQUEAR';
    
    // Safety check: Don't allow blocking the last admin
    if (newStatus !== 'approved') {
      const p = profiles.find(x => x.id === userId);
      if (p?.role === 'admin') {
        const activeAdmins = profiles.filter(x => x.role === 'admin' && x.status === 'approved');
        if (activeAdmins.length <= 1) {
          alert("Não é possível bloquear ou remover o último Administrador ativo do sistema.");
          return;
        }
      }
    }

    if (newStatus === 'approved') {
      if (!window.confirm(`Deseja APROVAR este usuário como ${roleForUser === 'admin' ? 'ADMINISTRADOR' : 'USUÁRIO COMUM'}?`)) return;
    } else {
      if (!window.confirm(`Deseja BLOQUEAR o acesso deste usuário?`)) return;
    }

    setUpdatingUser(userId);
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'approved') {
        updateData.role = roleForUser;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;
      
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, ...updateData } : p));
      if (newStatus === 'approved') {
        setSelectedRole(prev => ({ ...prev, [userId]: roleForUser }));
      }
      setMessage({ type: 'success', text: `Status do usuário atualizado com sucesso.` });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao atualizar status.' });
    } finally {
      setUpdatingUser(null);
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    // Basic protection: check if we are removing the last admin
    if (newRole === 'user') {
      const admins = profiles.filter(p => p.role === 'admin');
      if (admins.length <= 1 && admins[0].id === userId) {
        alert("Não é possível remover o último Administrador do sistema.");
        return;
      }
    }

    if (!window.confirm(`Deseja alterar o perfil deste usuário para ${newRole.toUpperCase()}?`)) return;

    setUpdatingUser(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
      setSelectedRole(prev => ({ ...prev, [userId]: newRole }));
      setMessage({ type: 'success', text: 'Perfil de usuário atualizado.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao atualizar perfil.' });
    } finally {
      setUpdatingUser(null);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'contractual_goals')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setGoals(data.value as Record<string, number>);
      }
    } catch (error) {
      console.error("Error fetching goals:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('uploads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'contractual_goals', value: goals }, { onConflict: 'key' });

      if (error) throw error;
      setMessage({ type: 'success', text: 'Metas contratuais atualizadas com sucesso!' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao salvar: permissão negada ou falha técnica.' });
    } finally {
      setSaving(false);
    }
  };

  const deleteUnitData = async (unit: string) => {
    if (!window.confirm(`ATENÇÃO: Deseja realmente deletar TODOS os dados da unidade ${unit}? Esta ação é irreversível.`)) return;
    
    setDeletingUnit(unit);
    try {
      const tables = ['atendimentos', 'cids', 'atestados', 'exames', 'uploads'];
      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('unidade', unit);
        if (error) throw error;
      }
      setMessage({ type: 'success', text: `Dados da unidade ${unit} removidos com sucesso.` });
      fetchHistory();
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Erro ao deletar dados da unidade ${unit}.` });
    } finally {
      setDeletingUnit(null);
    }
  };

  const wipeAllData = async () => {
    if (!window.confirm('PERIGO: Você está prestes a apagar TODO o banco de dados. Deseja continuar?')) return;
    if (!window.confirm('CONFIRME NOVAMENTE: Esta ação apagará todos os atendimentos, CIDs, exames e histórico.')) return;
    
    setIsWiping(true);
    try {
      const tables = ['atendimentos', 'cids', 'atestados', 'exames', 'uploads'];
      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .gte('created_at', '1970-01-01T00:00:00Z');
        if (error) {
          console.error(`Error wiping table ${table}:`, error);
          throw error;
        }
      }
      setMessage({ type: 'success', text: 'Banco de dados apagado com sucesso.' });
      fetchHistory();
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao apagar banco de dados.' });
    } finally {
      setIsWiping(false);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    if (!window.confirm('Deseja remover este registro do histórico? (Isso não apaga os dados processados, apenas o registro de que o arquivo foi enviado)')) return;
    
    try {
      const { error } = await supabase.from('uploads').delete().eq('id', id);
      if (error) throw error;
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  const clearHistoryLog = async () => {
    if (!window.confirm('Deseja limpar todo o histórico de uploads?')) return;
    
    try {
      const { error } = await supabase.from('uploads').delete().neq('id', -1);
      if (error) throw error;
      setHistory([]);
    } catch (error) {
      console.error(error);
    }
  };

  const handleControlledDelete = async () => {
    const { type, unit, month, year } = controlDelete;
    
    if (!type || !unit) {
      setMessage({ type: 'error', text: 'Por favor, selecione o tipo e a unidade.' });
      return;
    }

    try {
      setIsDeletingControlled(true);
      setMessage(null);

      // 1. Get count first
      const { count, error: countErr } = await supabase
        .from(type)
        .select('*', { count: 'exact', head: true })
        .eq('unidade', unit)
        .eq('mes', month)
        .eq('ano', year);

      if (countErr) throw countErr;

      const total = count || 0;
      if (total === 0) {
        setMessage({ type: 'error', text: 'Nenhum registro encontrado para estes filtros.' });
        return;
      }

      if (!window.confirm(`Você está prestes a excluir ${total.toLocaleString()} registros (${type}) da unidade ${unit} referente a ${month}/${year}. Deseja continuar?`)) {
        return;
      }

      // 2. Perform deletion
      const { error: deleteErr } = await supabase
        .from(type)
        .delete()
        .eq('unidade', unit)
        .eq('mes', month)
        .eq('ano', year);

      if (deleteErr) throw deleteErr;

      // 3. Log the action (Audit)
      try {
        await supabase.from('logs').insert({
          action: 'exclusao_controlada',
          details: `Removidos ${total} registros de ${type} (${unit}, ${month}/${year})`,
          tipo_dado: type,
          unidade: unit,
          mes: month,
          ano: year,
          usuario: user?.email || 'Administrador'
        });
      } catch (logErr) {
        console.warn("Audit log failed (table might not exist):", logErr);
      }

      // 4. Special rule: if CIDs were deleted, recalculate atendimentos
      if (type === 'cids') {
        const { count: cidCount, error: cidErr } = await supabase
          .from('cids')
          .select('*', { count: 'exact', head: true })
          .eq('unidade', unit)
          .eq('mes', month)
          .eq('ano', year);

        const newCount = cidErr ? 0 : (cidCount || 0);

        await supabase
          .from('atendimentos')
          .upsert({
            unidade: unit,
            mes: month,
            ano: year,
            quantidade: newCount,
            timestamp: new Date().toISOString()
          }, { onConflict: 'unidade,mes,ano' });
      }

      setMessage({ type: 'success', text: `Exclusão realizada com sucesso! ${total} registros removidos.` });
      fetchHistory();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: `Erro na exclusão: ${err.message || 'Falha ao processar a requisição.'}` });
    } finally {
      setIsDeletingControlled(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">Carregando Configurações...</div>;

  const renderSubContent = () => {
    switch (activeSubTab) {
      case 'goals':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {UNITS.map(unit => (
                <div key={unit} className="card-minimal space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-400">
                      <ShieldCheck className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Unidade {unit}</span>
                    </div>
                    <button 
                      onClick={() => deleteUnitData(unit)}
                      disabled={!!deletingUnit}
                      className="text-red-400 hover:text-red-600 transition-colors tooltip flex items-center gap-1"
                      title="Deletar dados desta unidade"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[9px] font-bold uppercase">Deletar</span>
                    </button>
                  </div>
                  <div>
                    <label className="block text-2xl font-black text-slate-800 mb-2">Meta Mensal</label>
                    <input 
                      type="number" 
                      value={goals[unit] || ''}
                      onChange={(e) => setGoals(prev => ({ ...prev, [unit]: Number(e.target.value) }))}
                      className="w-full text-3xl font-black text-ints-green bg-slate-50 border-2 border-transparent focus:border-ints-green/20 rounded-2xl p-4 outline-none transition-all"
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="card-minimal !bg-amber-50 border-amber-100 flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-amber-800 uppercase tracking-widest">Aviso de Segurança</h4>
                <p className="text-xs text-amber-600 font-medium">As metas contratuais definem o cálculo de performance do INTS Epidemiológico. Alterações nestas métricas impactam imediatamente todos os Dashboards de Produção.</p>
              </div>
            </div>
          </div>
        );
      case 'users':
        return (
          <div className="card-minimal space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Gestão de Usuários</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Aprovação e Controle de Acesso</p>
                </div>
              </div>
              <button 
                onClick={fetchProfiles}
                disabled={loadingProfiles}
                className="p-2 text-slate-400 hover:text-ints-green transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loadingProfiles ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Usuário</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Perfil</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingProfiles ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-300 animate-pulse text-xs italic">Buscando usuários...</td>
                    </tr>
                  ) : profiles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-300">
                          <Users className="w-8 h-8 opacity-20" />
                          <p className="text-xs font-bold uppercase tracking-widest">Nenhum usuário encontrado</p>
                        </div>
                      </td>
                    </tr>
                  ) : profiles.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">{p.nome}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                          p.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 
                          p.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-rose-50 text-rose-500'
                        }`}>
                          {p.status === 'approved' ? 'Aprovado' : p.status === 'pending' ? 'Pendente' : 'Bloqueado'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                          p.role === 'admin' ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {p.role === 'admin' ? 'Admin' : 'User'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2 text-[10px] font-black uppercase tracking-wider">
                          {p.status === 'pending' && (
                            <>
                              <button 
                                onClick={() => updateUserStatus(p.id, 'approved', 'admin')}
                                disabled={updatingUser === p.id}
                                className="px-3 py-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-all disabled:opacity-50"
                              >
                                Aprovar ADMIN
                              </button>
                              <button 
                                onClick={() => updateUserStatus(p.id, 'approved', 'user')}
                                disabled={updatingUser === p.id}
                                className="px-3 py-1.5 bg-ints-green text-white rounded-lg hover:bg-ints-green-dark transition-all disabled:opacity-50"
                              >
                                Aprovar USER
                              </button>
                              <button 
                                onClick={() => updateUserStatus(p.id, 'blocked')}
                                disabled={updatingUser === p.id}
                                className="px-3 py-1.5 border border-slate-200 text-slate-400 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
                              >
                                Rejeitar
                              </button>
                            </>
                          )}
                          {p.status === 'approved' && p.email !== user?.email && (
                            <button 
                              onClick={() => updateUserStatus(p.id, 'blocked')}
                              disabled={updatingUser === p.id}
                              className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-rose-100"
                            >
                              Bloquear
                            </button>
                          )}
                          {p.status === 'blocked' && (
                            <button 
                              onClick={() => updateUserStatus(p.id, 'approved')}
                              disabled={updatingUser === p.id}
                              className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-all border border-slate-100"
                            >
                              Reativar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'history':
        return (
          <div className="space-y-6">
            <div className="card-minimal space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <History className="w-5 h-5 text-slate-500" />
                  </div>
                  <h3 className="text-lg font-black text-slate-800">Histórico de Uploads</h3>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={fetchHistory}
                    className="p-2 text-slate-400 hover:text-ints-green transition-colors"
                    title="Atualizar"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                  </button>
                  <button 
                    onClick={clearHistoryLog}
                    className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Limpar Log
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data / Hora</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Arquivo</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unidade</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Registros</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loadingHistory ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-300 animate-pulse text-xs italic">Carregando histórico...</td>
                      </tr>
                    ) : history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-300 text-xs italic">Nenhum upload registrado.</td>
                      </tr>
                    ) : (
                      history.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-slate-300" />
                              {new Date(item.created_at).toLocaleString('pt-BR')}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs font-bold text-slate-700 truncate max-w-[200px]" title={item.filename}>
                            {item.filename}
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase">
                              {item.unidade}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                              item.tipo === 'CIDs' ? 'bg-green-50 text-ints-green' : 
                              item.tipo === 'Atendimentos' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {item.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center font-bold text-slate-600 text-xs">
                            {item.registros.toLocaleString()}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button 
                              onClick={() => deleteHistoryItem(item.id)}
                              className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-minimal space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Exclusão Controlada</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Remover dados específicos por unidade e período</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Tipo</label>
                  <select 
                    value={controlDelete.type}
                    onChange={(e) => setControlDelete(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full p-2.5 bg-white border border-ints-gray rounded-xl text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="">Tipo...</option>
                    <option value="atendimentos">Atendimentos</option>
                    <option value="cids">CIDs</option>
                    <option value="atestados">Atestados</option>
                    <option value="exames">Exames</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Unidade</label>
                  <select 
                    value={controlDelete.unit}
                    onChange={(e) => setControlDelete(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full p-2.5 bg-white border border-ints-gray rounded-xl text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="">Unidade...</option>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Mês</label>
                  <select 
                    value={controlDelete.month}
                    onChange={(e) => setControlDelete(prev => ({ ...prev, month: Number(e.target.value) }))}
                    className="w-full p-2.5 bg-white border border-ints-gray rounded-xl text-xs font-bold text-slate-700 outline-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {new Date(2000, i).toLocaleString('pt-BR', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Ano</label>
                  <input 
                    type="number"
                    value={controlDelete.year}
                    onChange={(e) => setControlDelete(prev => ({ ...prev, year: Number(e.target.value) }))}
                    className="w-full p-2.5 bg-white border border-ints-gray rounded-xl text-xs font-bold text-slate-700 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  onClick={handleControlledDelete}
                  disabled={isDeletingControlled}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-500 text-white rounded-full hover:bg-rose-600 transition-all text-[10px] font-bold uppercase tracking-widest shadow-md disabled:opacity-50"
                >
                  {isDeletingControlled ? 'Excluindo...' : 'Executar Exclusão'}
                </button>
              </div>
            </div>
          </div>
        );
      case 'danger':
        return (
          <div className="card-minimal !bg-rose-50 border-rose-100 space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-white rounded-2xl shadow-sm">
                <Database className="w-6 h-6 text-rose-500 shrink-0" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black text-rose-800 uppercase tracking-widest">Zona de Perigo Extremo</h4>
                <p className="text-xs text-rose-600 font-medium">Esta ação é irreversível e apagará TODOS os dados assistenciais do sistema.</p>
              </div>
            </div>
            
            <div className="flex justify-center p-8 bg-white/50 rounded-3xl border border-rose-100">
               <button 
                onClick={wipeAllData}
                disabled={isWiping}
                className="px-12 py-6 bg-rose-500 text-white rounded-3xl text-sm font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-xl hover:shadow-rose-500/20 active:scale-95 disabled:opacity-50"
              >
                {isWiping ? 'Apagando tudo...' : 'LIMPAR BANCO DE DADOS COMPLETO'}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {message && (
        <div className={`p-4 rounded-2xl border ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'} text-xs font-bold uppercase tracking-widest flex items-center justify-between`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white border border-ints-gray rounded-2xl shadow-sm">
            <Settings2 className="w-6 h-6 text-ints-green" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">Gerenciamento do Sistema</h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Configurações Gerais e Controle de Acesso</p>
          </div>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-ints-gray overflow-hidden">
          <button 
            onClick={() => setActiveSubTab('goals')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'goals' ? 'bg-ints-green text-white shadow-sm' : 'text-slate-400 hover:text-ints-green'}`}
          >
            Metas
          </button>
          <button 
            onClick={() => setActiveSubTab('users')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'users' ? 'bg-ints-green text-white shadow-sm' : 'text-slate-400 hover:text-ints-green'}`}
          >
            Usuários
          </button>
          <button 
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'history' ? 'bg-ints-green text-white shadow-sm' : 'text-slate-400 hover:text-ints-green'}`}
          >
            Histórico
          </button>
          <button 
            onClick={() => setActiveSubTab('danger')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'danger' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-rose-500'}`}
          >
            Perigo
          </button>
        </div>
      </div>

      {activeSubTab === 'goals' && (
        <div className="flex justify-end">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-ints-green text-white rounded-full hover:bg-ints-green-dark transition-all text-xs font-bold uppercase tracking-widest shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {saving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar Metas</>}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {renderSubContent()}
        </motion.div>
      </AnimatePresence>

      <div className="card-minimal !bg-amber-50 border-amber-100 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-amber-800 uppercase tracking-widest">Aviso de Segurança</h4>
          <p className="text-xs text-amber-600 font-medium">As metas contratuais definem o cálculo de performance do INTS Epidemiológico. Alterações nestas métricas impactam imediatamente todos os Dashboards de Produção.</p>
        </div>
      </div>

      {message && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`p-4 rounded-2xl border text-center font-bold text-sm ${
            message.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
          }`}
        >
          {message.text}
        </motion.div>
      )}
    </motion.div>
  );
};

export default AdminSettings;
