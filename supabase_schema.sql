
-- Script para criar as tabelas necessárias no Supabase
-- Copie e cole este código no SQL Editor do seu projeto Supabase

-- Tabela de Atendimentos (Produção)
CREATE TABLE IF NOT EXISTS public.atendimentos (
  id BIGSERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  quantidade INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_atendimento_record UNIQUE (unidade, mes, ano)
);

-- Tabela de CIDs (Epidemiológico)
CREATE TABLE IF NOT EXISTS public.cids (
  id BIGSERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  paciente TEXT,
  data_atendimento TIMESTAMPTZ, -- Novo campo para cruzamento
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_cid_record UNIQUE (unidade, mes, ano, paciente, codigo)
);

-- Tabela de Atestados
CREATE TABLE IF NOT EXISTS public.atestados (
  id BIGSERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  paciente TEXT, -- Novo campo
  data_atestado TIMESTAMPTZ, -- Novo campo
  quantidade INTEGER DEFAULT 1,
  cid_codigo TEXT,
  cid_descricao TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_atestado_paciente_record UNIQUE (unidade, paciente, data_atestado, cid_codigo)
);

-- Tabela de Monitoramento de Atendimento
CREATE TABLE IF NOT EXISTS public.monitoramento (
  id BIGSERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  paciente TEXT,
  data_entrada TIMESTAMPTZ,
  data_alta TIMESTAMPTZ,
  protocolo_risco TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_monitoramento_record UNIQUE (unidade, paciente, data_entrada)
);

-- Tabela de Exames
CREATE TABLE IF NOT EXISTS public.exames (
  id BIGSERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  quantidade INTEGER DEFAULT 0,
  nome TEXT, -- Campo legado/resumo
  codigo_exame TEXT,
  descricao_exame TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_exame_record UNIQUE (unidade, mes, ano, descricao_exame)
);

-- Tabela de Histórico de Uploads
CREATE TABLE IF NOT EXISTS public.uploads (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  unidade TEXT,
  tipo TEXT,
  registros INTEGER,
  mes INTEGER,
  ano INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Configurações (Metas)
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Perfis de Usuário (Gestão de Acessos)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  role TEXT DEFAULT 'user', -- 'admin' ou 'user'
  status TEXT DEFAULT 'pending', -- 'approved', 'pending', 'blocked'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoramento ENABLE ROW LEVEL SECURITY;

-- Função auxiliar para verificar se o usuário está aprovado
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND (status = 'approved' OR role = 'admin')
  ) OR (auth.jwt() ->> 'email') IN ('samdefy.souza@gmail.com', 'wellington.souza@ints.org.br', 'ciro@ints.org.br', 'liana@ints.org.br');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função auxiliar para verificar se o usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Verificar o email diretamente via JWT (mais robusto e rápido)
  IF (auth.jwt() ->> 'email') IN ('samdefy.souza@gmail.com', 'wellington.souza@ints.org.br', 'ciro@ints.org.br', 'liana@ints.org.br') THEN
    RETURN TRUE;
  END IF;

  -- 2. Verificar na tabela de perfis
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garantir que os administradores fundadores tenham permissão total
UPDATE public.profiles 
SET role = 'admin', status = 'approved' 
WHERE email IN ('samdefy.souza@gmail.com', 'wellington.souza@ints.org.br', 'ciro@ints.org.br', 'liana@ints.org.br');

-- Políticas para PROFILES
DROP POLICY IF EXISTS "Usuários podem ver o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem ver o próprio perfil" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem criar o próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem criar o próprio perfil" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins podem gerenciar perfis" ON public.profiles;
CREATE POLICY "Admins podem gerenciar perfis" ON public.profiles FOR ALL USING (public.is_admin());

-- Função para criar perfil automaticamente após o sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, role, status)
  VALUES (
    new.id, 
    new.email, 
    split_part(new.email, '@', 1),
    CASE 
      WHEN new.email IN ('samdefy.souza@gmail.com', 'wellington.souza@ints.org.br', 'ciro@ints.org.br', 'liana@ints.org.br') THEN 'admin'
      ELSE 'user'
    END,
    CASE 
      WHEN new.email IN ('samdefy.souza@gmail.com', 'wellington.souza@ints.org.br', 'ciro@ints.org.br', 'liana@ints.org.br') THEN 'approved'
      ELSE 'pending'
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para executar a função
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Políticas para as tabelas de dados (Administradores têm acesso total)
-- Atendimentos
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.atendimentos;
DROP POLICY IF EXISTS "Permitir leitura para aprovados atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Permitir inserção/edição para admins atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Leitura aprovados atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Gestão total admins atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Leitura atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Admin total atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Admin_Full_Atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "User_Read_Atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Policy_Admin_Atendimentos" ON public.atendimentos;
DROP POLICY IF EXISTS "Policy_User_Atendimentos" ON public.atendimentos;
CREATE POLICY "Policy_Admin_Atendimentos" ON public.atendimentos FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Policy_User_Atendimentos" ON public.atendimentos FOR SELECT TO authenticated USING (public.is_approved());

-- CIDs
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.cids;
DROP POLICY IF EXISTS "Permitir leitura para aprovados cids" ON public.cids;
DROP POLICY IF EXISTS "Permitir inserção/edição para admins cids" ON public.cids;
DROP POLICY IF EXISTS "Leitura aprovados cids" ON public.cids;
DROP POLICY IF EXISTS "Gestão total admins cids" ON public.cids;
DROP POLICY IF EXISTS "Leitura cids" ON public.cids;
DROP POLICY IF EXISTS "Admin total cids" ON public.cids;
DROP POLICY IF EXISTS "Admin_Full_CIDs" ON public.cids;
DROP POLICY IF EXISTS "User_Read_CIDs" ON public.cids;
DROP POLICY IF EXISTS "Policy_Admin_CIDs" ON public.cids;
DROP POLICY IF EXISTS "Policy_User_CIDs" ON public.cids;
CREATE POLICY "Policy_Admin_CIDs" ON public.cids FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Policy_User_CIDs" ON public.cids FOR SELECT TO authenticated USING (public.is_approved());

-- Atestados
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.atestados;
DROP POLICY IF EXISTS "Permitir leitura para aprovados atestados" ON public.atestados;
DROP POLICY IF EXISTS "Permitir inserção/edição para admins atestados" ON public.atestados;
DROP POLICY IF EXISTS "Leitura aprovados atestados" ON public.atestados;
DROP POLICY IF EXISTS "Gestão total admins atestados" ON public.atestados;
DROP POLICY IF EXISTS "Leitura atestados" ON public.atestados;
DROP POLICY IF EXISTS "Admin total atestados" ON public.atestados;
DROP POLICY IF EXISTS "Admin_Full_Atestados" ON public.atestados;
DROP POLICY IF EXISTS "User_Read_Atestados" ON public.atestados;
DROP POLICY IF EXISTS "Policy_Admin_Atestados" ON public.atestados;
DROP POLICY IF EXISTS "Policy_User_Atestados" ON public.atestados;
CREATE POLICY "Policy_Admin_Atestados" ON public.atestados FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Policy_User_Atestados" ON public.atestados FOR SELECT TO authenticated USING (public.is_approved());

-- Exames
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.exames;
DROP POLICY IF EXISTS "Permitir leitura para aprovados exames" ON public.exames;
DROP POLICY IF EXISTS "Permitir inserção/edição para admins exames" ON public.exames;
DROP POLICY IF EXISTS "Leitura aprovados exames" ON public.exames;
DROP POLICY IF EXISTS "Gestão total admins exames" ON public.exames;
DROP POLICY IF EXISTS "Leitura exames" ON public.exames;
DROP POLICY IF EXISTS "Admin total exames" ON public.exames;
DROP POLICY IF EXISTS "Admin_Full_Exames" ON public.exames;
DROP POLICY IF EXISTS "User_Read_Exames" ON public.exames;
DROP POLICY IF EXISTS "Policy_Admin_Exames" ON public.exames;
DROP POLICY IF EXISTS "Policy_User_Exames" ON public.exames;
CREATE POLICY "Policy_Admin_Exames" ON public.exames FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Policy_User_Exames" ON public.exames FOR SELECT TO authenticated USING (public.is_approved());

-- Monitoramento
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.monitoramento;
DROP POLICY IF EXISTS "Permitir leitura para aprovados monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Permitir inserção/edição para admins monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Leitura aprovados monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Gestão total admins monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Leitura monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Admin total monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Admin_Full_Monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "User_Read_Monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Policy_Admin_Monitoramento" ON public.monitoramento;
DROP POLICY IF EXISTS "Policy_User_Monitoramento" ON public.monitoramento;
CREATE POLICY "Policy_Admin_Monitoramento" ON public.monitoramento FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Policy_User_Monitoramento" ON public.monitoramento FOR SELECT TO authenticated USING (public.is_approved());


-- Uploads (Apenas Admins podem ver e fazer upload)
DROP POLICY IF EXISTS "Acesso apenas admins para uploads" ON public.uploads;
CREATE POLICY "Acesso apenas admins para uploads" ON public.uploads FOR ALL USING (public.is_admin());

-- Settings (Apenas Admins podem gerenciar)
DROP POLICY IF EXISTS "Acesso apenas admins para settings" ON public.settings;
CREATE POLICY "Acesso apenas admins para settings" ON public.settings FOR ALL USING (public.is_admin());

-- Tabela de Notificações Compulsórias (Referência)
CREATE TABLE IF NOT EXISTS public.notificacoes_cids (
  id BIGSERIAL PRIMARY KEY,
  cid TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  categoria TEXT DEFAULT 'Geral',
  obrigatorio BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de CIDs (Epidemiológico) - Adicionando campos de notificação
ALTER TABLE public.cids ADD COLUMN IF NOT EXISTS notificacao_status TEXT DEFAULT 'ignorado'; -- 'pendente', 'notificado', 'ignorado'
ALTER TABLE public.cids ADD COLUMN IF NOT EXISTS is_notificavel BOOLEAN DEFAULT FALSE;

-- Tabela de Atestados - Adicionando campos de notificação
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS notificacao_status TEXT DEFAULT 'ignorado';
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS is_notificavel BOOLEAN DEFAULT FALSE;

-- Habilitar RLS para a nova tabela
ALTER TABLE public.notificacoes_cids ENABLE ROW LEVEL SECURITY;

-- Políticas para Notificações CIDs
DROP POLICY IF EXISTS "Policy_Admin_Notificacoes" ON public.notificacoes_cids;
DROP POLICY IF EXISTS "Policy_User_Notificacoes" ON public.notificacoes_cids;
CREATE POLICY "Policy_Admin_Notificacoes" ON public.notificacoes_cids FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Policy_User_Notificacoes" ON public.notificacoes_cids FOR SELECT TO authenticated USING (public.is_approved());

-- Inserir alguns CIDs de exemplo
INSERT INTO public.notificacoes_cids (cid, descricao, categoria, obrigatorio) VALUES
('A90', 'Dengue', 'Arbovírus', true),
('A91', 'Dengue Hemorrágica', 'Arbovírus', true),
('B24', 'HIV', 'IST', true),
('A15', 'Tuberculose', 'Respiratória', true),
('U071', 'COVID-19', 'Respiratória', true),
('U07.1', 'COVID-19', 'Respiratória', true), -- Variantes de formatação
('B15', 'Hepatite A', 'Hepatites', true),
('A00', 'Cólera', 'Gastrointestinal', true)
ON CONFLICT (cid) DO NOTHING;

-- Configurações iniciais de metas
INSERT INTO public.settings (key, value)
VALUES ('contractual_goals', '{"CS24": 10289, "CSI": 2058, "UPA": 6174}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
