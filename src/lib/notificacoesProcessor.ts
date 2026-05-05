/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabase';
import { NotificacaoCid } from '../types';

let compulsoryCidCache: Set<string> | null = null;
let compulsoryCidDetails: Map<string, NotificacaoCid> | null = null;

/**
 * Normalizes a CID code for comparison.
 * Removes dots, spaces and converts to uppercase.
 */
export const normalizeCidForComparison = (cid: string | null | undefined): string => {
  if (!cid) return '';
  return cid.trim().toUpperCase().replace(/[\.\s]/g, '');
};

/**
 * Fetches the list of compulsory notification CIDs from Supabase.
 * Uses a simple cache to avoid repeated requests during a batch process.
 */
export const getCompulsoryCids = async (forceRefresh = false): Promise<{ codes: Set<string>, details: Map<string, NotificacaoCid> }> => {
  if (!forceRefresh && compulsoryCidCache && compulsoryCidDetails) {
    return { codes: compulsoryCidCache, details: compulsoryCidDetails };
  }

  try {
    const { data, error } = await supabase
      .from('notificacoes_cids')
      .select('*');

    if (error) throw error;

    const codes = new Set<string>();
    const details = new Map<string, NotificacaoCid>();

    (data || []).forEach((item: NotificacaoCid) => {
      const normalized = normalizeCidForComparison(item.cid);
      codes.add(normalized);
      details.set(normalized, item);
    });

    compulsoryCidCache = codes;
    compulsoryCidDetails = details;

    return { codes, details };
  } catch (err) {
    console.error('Erro ao buscar CIDs compulsórios:', err);
    return { codes: new Set(), details: new Map() };
  }
};

/**
 * Checks if a CID is subject to compulsory notification.
 */
export const isCompulsoryNotification = async (cid: string | null | undefined): Promise<boolean> => {
  if (!cid) return false;
  const normalized = normalizeCidForComparison(cid);
  const { codes } = await getCompulsoryCids();
  
  const isMatch = codes.has(normalized);
  
  // Log detection as requested in business rules
  if (isMatch) {
    console.log(`CID detectado: ${cid}`);
    console.log(`É notificável: true`);
  }

  return isMatch;
};

/**
 * Gets details for a compulsory CID if it exists.
 */
export const getNotificacaoDetails = async (cid: string | null | undefined): Promise<NotificacaoCid | null> => {
  if (!cid) return null;
  const normalized = normalizeCidForComparison(cid);
  const { details } = await getCompulsoryCids();
  return details.get(normalized) || null;
};
