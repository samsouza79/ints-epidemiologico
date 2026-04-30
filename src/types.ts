/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AtendimentoDoc {
  id?: string;
  unidade: string;
  mes: number;
  ano: number;
  quantidade: number;
  timestamp: string;
}

export interface CidDoc {
  id?: string;
  unidade: string;
  mes: number;
  ano: number;
  codigo: string;
  descricao: string;
  paciente?: string;
  quantidade?: number; // Usually 1 per record now
  timestamp: string;
}

export interface AtestadoDoc {
  id?: string;
  unidade: string;
  mes: number;
  ano: number;
  quantidade: number;
  cid_codigo?: string;
  cid_descricao?: string;
  timestamp: string;
}

export interface ExameDoc {
  id?: string;
  unidade: string;
  mes: number;
  ano: number;
  quantidade: number;
  nome?: string;
  codigo_exame?: string;
  descricao_exame?: string;
  timestamp: string;
}

export interface UploadDoc {
  id?: string;
  filename: string;
  unidade: string;
  tipo: string;
  registros: number;
  mes: number;
  ano: number;
  created_at?: string;
}

export type FileType = 'Atendimentos' | 'CIDs' | 'Atestados' | 'Exames' | 'Unknown';

export type UserRole = 'admin' | 'user';
export type ProfileStatus = 'approved' | 'pending' | 'blocked';

export interface Profile {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
  status: ProfileStatus;
  created_at: string;
}
