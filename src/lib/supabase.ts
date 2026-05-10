import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create Supabase client for client-side usage
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role for admin operations
export function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Type definitions for database entities
export interface DatabaseProject {
  id: string;
  name: string;
  province?: string;
  status: 'active' | 'completed' | 'suspended' | 'cancelled';
  progress: number;
  project_level?: 'S' | 'A' | 'B' | 'C';
  contract_amount?: number;
  collection_amount?: number;
  created_at: string;
  updated_at: string;
}

export interface DatabaseRisk {
  id: string;
  project_id: string;
  description: string;
  category?: '技术' | '人员' | '外部' | '管理' | '质量';
  probability: number;
  impact: number;
  pi_score: number;
  status: 'identified' | 'tracking' | 'resolved';
  response_strategy?: string;
  owner?: string;
  created_at: string;
}

export interface DatabaseContract {
  id: string;
  project_id: string;
  name: string;
  party_a?: string;
  party_b?: string;
  total_amount: number;
  signed_date?: string;
  created_at: string;
}

export interface DatabasePaymentMilestone {
  id: string;
  contract_id: string;
  name: string;
  amount: number;
  due_date: string;
  status: 'paid' | 'unpaid' | 'overdue' | 'pending';
  actual_paid_date?: string;
}

export interface DatabaseStakeholder {
  id: string;
  project_id: string;
  name: string;
  role?: string;
  organization?: string;
  power: number;
  interest: number;
  current_engagement?: string;
  desired_engagement?: string;
  communication_frequency?: string;
  communication_method?: string;
  management_strategy?: string;
}

export interface DatabaseOKR {
  id: string;
  project_id?: string;
  objective: string;
  status: 'on-track' | 'at-risk' | 'behind';
  owner?: string;
  created_at: string;
}

// API helper functions
export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as DatabaseProject[];
}

export async function fetchRisks(projectId?: string) {
  let query = supabase.from('risks').select('*');
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query.order('pi_score', { ascending: false });
  if (error) throw error;
  return data as DatabaseRisk[];
}

export async function fetchContracts(projectId?: string) {
  let query = supabase.from('contracts').select(`
    *,
    payment_milestones(*)
  `);
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as (DatabaseContract & { payment_milestones: DatabasePaymentMilestone[] })[];
}

export async function fetchStakeholders(projectId?: string) {
  let query = supabase.from('stakeholders').select('*');
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as DatabaseStakeholder[];
}

export async function fetchOKRs(projectId?: string) {
  let query = supabase.from('okrs').select(`
    *,
    okr_key_results(*)
  `);
  if (projectId) {
    query = query.eq('project_id', projectId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as DatabaseOKR[];
}

// Insert/Update helpers
export async function saveRisk(risk: Partial<DatabaseRisk>) {
  const { data, error } = await supabase
    .from('risks')
    .upsert(risk)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveContract(contract: Partial<DatabaseContract>) {
  const { data, error } = await supabase
    .from('contracts')
    .upsert(contract)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function savePaymentMilestone(milestone: Partial<DatabasePaymentMilestone>) {
  const { data, error } = await supabase
    .from('payment_milestones')
    .upsert(milestone)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveStakeholder(stakeholder: Partial<DatabaseStakeholder>) {
  const { data, error } = await supabase
    .from('stakeholders')
    .upsert(stakeholder)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}