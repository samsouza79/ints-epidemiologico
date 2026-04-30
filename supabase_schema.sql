
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
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_cid_record UNIQUE (unidade, mes, ano, paciente, codigo)
);

-- Tabela de Atestados
CREATE TABLE IF NOT EXISTS public.atestados (
  id BIGSERIAL PRIMARY KEY,
  unidade TEXT NOT NULL,
  mes INTEGER NOT NULL,
  ano INTEGER NOT NULL,
  quantidade INTEGER DEFAULT 0,
  cid_codigo TEXT,
  cid_descricao TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_atestado_record UNIQUE (unidade, mes, ano, cid_codigo)
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

-- Função auxiliar para verificar se o usuário está aprovado
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND status = 'approved'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função auxiliar para verificar se o usuário é admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Políticas para as tabelas de dados (Acesso apenas para usuários aprovados)
-- Atendimentos
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.atendimentos;
CREATE POLICY "Acesso apenas usuários aprovados" ON public.atendimentos FOR ALL USING (public.is_approved());

-- CIDs
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.cids;
CREATE POLICY "Acesso apenas usuários aprovados" ON public.cids FOR ALL USING (public.is_approved());

-- Atestados
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.atestados;
CREATE POLICY "Acesso apenas usuários aprovados" ON public.atestados FOR ALL USING (public.is_approved());

-- Exames
DROP POLICY IF EXISTS "Acesso apenas usuários aprovados" ON public.exames;
CREATE POLICY "Acesso apenas usuários aprovados" ON public.exames FOR ALL USING (public.is_approved());

-- Uploads (Apenas Admins podem ver e fazer upload)
DROP POLICY IF EXISTS "Acesso apenas admins para uploads" ON public.uploads;
CREATE POLICY "Acesso apenas admins para uploads" ON public.uploads FOR ALL USING (public.is_admin());

-- Settings (Apenas Admins podem gerenciar)
DROP POLICY IF EXISTS "Acesso apenas admins para settings" ON public.settings;
CREATE POLICY "Acesso apenas admins para settings" ON public.settings FOR ALL USING (public.is_admin());

-- Configurações iniciais de metas
INSERT INTO public.settings (key, value)
VALUES ('contractual_goals', '{"CS24": 10289, "CSI": 2058, "UPA": 6174}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
