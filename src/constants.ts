/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const INSTITUTIONAL_GREEN = '#2D8653'; // Estilo INTS atualizado
export const INSTITUTIONAL_GREEN_LIGHT = '#F0FDF4';
export const INSTITUTIONAL_GREEN_DARK = '#1E5C38';

export const UNITS = ['CSI', 'CS24', 'UPA'];

export interface MetaContratual {
  unidade: string;
  meta: number;
}

export const FIXED_GOALS: Record<string, number> = {
  'CSI': 2058,
  'CS24': 10289,
  'UPA': 6174
};

export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const ADMIN_EMAILS = [
  'samdefy.souza@gmail.com',
  'wellington.souza@ints.org.br',
  'ciro@ints.org.br',
  'liana@ints.org.br'
];
