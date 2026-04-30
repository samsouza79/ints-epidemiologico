/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jsytqithvfqrtdcjnjlc.supabase.co';
const supabaseKey = 'sb_publishable_3CfeuU4VT-7J2yGJcHOc4Q_TQht_usz';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Handle Supabase errors and notify quota status if relevant
 */
export const handleSupabaseError = (error: any, operation: string) => {
  console.error(`Supabase Error [${operation}]:`, error);
  // Re-using the quota notification logic if needed, 
  // though Supabase limits are usually different.
  throw error;
};
