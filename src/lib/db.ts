/**
 * Database Layer - Supabase with localStorage fallback
 */

import { isSupabaseConfigured } from './supabase';

const STORAGE_KEYS = {
  risks: 'ai_pm_risks',
  contracts: 'ai_pm_contracts',
  stakeholders: 'ai_pm_stakeholders',
  projects: 'ai_pm_projects',
  reports: 'ai_pm_reports',
  okrs: 'ai_pm_okrs',
} as const;

function getFromStorage<T>(key: string, defaultValue: T[]): T[] {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch { return defaultValue; }
}

function saveToStorage<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error(e); }
}

// =====================
// Risk Management
// =====================

export async function getRisks(projectId?: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    let query = supabase.from('risks').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return getFromStorage(STORAGE_KEYS.risks, []);
}

export async function saveRisk(risk: any) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('risks').upsert(risk).select().single();
    if (error) throw error;
    return data;
  }
  const risks = getFromStorage(STORAGE_KEYS.risks, []);
  const index = risks.findIndex((r: any) => r.id === risk.id);
  if (index >= 0) risks[index] = risk;
  else risks.push({ ...risk, createdAt: new Date().toISOString() });
  saveToStorage(STORAGE_KEYS.risks, risks);
  return risk;
}

export async function deleteRisk(id: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('risks').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const risks = getFromStorage(STORAGE_KEYS.risks, []);
  saveToStorage(STORAGE_KEYS.risks, risks.filter((r: any) => r.id !== id));
}

// =====================
// Contracts & Payments
// =====================

export async function getContracts(projectId?: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    let query = supabase.from('contracts').select('*, payment_milestones(*)').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return getFromStorage(STORAGE_KEYS.contracts, []);
}

export async function saveContract(contract: any) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data: contractData, error: contractError } = await supabase.from('contracts').upsert(contract).select().single();
    if (contractError) throw contractError;
    if (contract.milestones?.length) {
      const milestones = contract.milestones.map((m: any) => ({ ...m, contract_id: contractData.id }));
      await supabase.from('payment_milestones').upsert(milestones);
    }
    return contractData;
  }
  const contracts = getFromStorage(STORAGE_KEYS.contracts, []);
  const index = contracts.findIndex((c: any) => c.id === contract.id);
  if (index >= 0) contracts[index] = contract;
  else contracts.push({ ...contract, createdAt: new Date().toISOString() });
  saveToStorage(STORAGE_KEYS.contracts, contracts);
  return contract;
}

export async function deleteContract(id: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('contracts').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const contracts = getFromStorage(STORAGE_KEYS.contracts, []);
  saveToStorage(STORAGE_KEYS.contracts, contracts.filter((c: any) => c.id !== id));
}

// =====================
// Stakeholders
// =====================

export async function getStakeholders(projectId?: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    let query = supabase.from('stakeholders').select('*').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return getFromStorage(STORAGE_KEYS.stakeholders, []);
}

export async function saveStakeholder(stakeholder: any) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('stakeholders').upsert(stakeholder).select().single();
    if (error) throw error;
    return data;
  }
  const stakeholders = getFromStorage(STORAGE_KEYS.stakeholders, []);
  const index = stakeholders.findIndex((s: any) => s.id === stakeholder.id);
  if (index >= 0) stakeholders[index] = stakeholder;
  else stakeholders.push({ ...stakeholder, createdAt: new Date().toISOString() });
  saveToStorage(STORAGE_KEYS.stakeholders, stakeholders);
  return stakeholder;
}

export async function deleteStakeholder(id: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('stakeholders').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const stakeholders = getFromStorage(STORAGE_KEYS.stakeholders, []);
  saveToStorage(STORAGE_KEYS.stakeholders, stakeholders.filter((s: any) => s.id !== id));
}

// =====================
// OKRs
// =====================

export async function getOKRs(projectId?: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    let query = supabase.from('okrs').select('*, okr_key_results(*)').order('created_at', { ascending: false });
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return getFromStorage(STORAGE_KEYS.okrs, []);
}

export async function saveOKR(okr: any) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data: okrData, error: okrError } = await supabase.from('okrs').upsert(okr).select().single();
    if (okrError) throw okrError;
    if (okr.keyResults?.length) {
      const keyResults = okr.keyResults.map((kr: any) => ({ ...kr, okr_id: okrData.id }));
      await supabase.from('okr_key_results').upsert(keyResults);
    }
    return okrData;
  }
  const okrs = getFromStorage(STORAGE_KEYS.okrs, []);
  const index = okrs.findIndex((o: any) => o.id === okr.id);
  if (index >= 0) okrs[index] = okr;
  else okrs.push({ ...okr, createdAt: new Date().toISOString() });
  saveToStorage(STORAGE_KEYS.okrs, okrs);
  return okr;
}

// =====================
// Reports
// =====================

export async function getReports(projectId?: string) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    let query = supabase.from('reports').select('*').order('generated_at', { ascending: false }).limit(50);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  return getFromStorage(STORAGE_KEYS.reports, []);
}

export async function saveReport(report: any) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('reports').insert(report).select().single();
    if (error) throw error;
    return data;
  }
  const reports = getFromStorage(STORAGE_KEYS.reports, []);
  reports.unshift({ ...report, generatedAt: new Date().toISOString() });
  saveToStorage(STORAGE_KEYS.reports, reports.slice(0, 50));
  return report;
}

// =====================
// Projects
// =====================

export async function getProjects() {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
  return getFromStorage(STORAGE_KEYS.projects, []);
}

export async function saveProject(project: any) {
  if (isSupabaseConfigured()) {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.from('projects').upsert(project).select().single();
    if (error) throw error;
    return data;
  }
  const projects = getFromStorage(STORAGE_KEYS.projects, []);
  const index = projects.findIndex((p: any) => p.id === project.id);
  if (index >= 0) projects[index] = { ...project, updatedAt: new Date().toISOString() };
  else projects.push({ ...project, createdAt: new Date().toISOString() });
  saveToStorage(STORAGE_KEYS.projects, projects);
  return project;
}

// =====================
// Health Check
// =====================

export async function checkDatabaseHealth(): Promise<{ status: 'connected' | 'local'; message: string }> {
  if (isSupabaseConfigured()) {
    try {
      const { supabase } = await import('./supabase');
      const { error } = await supabase.from('projects').select('id').limit(1);
      if (error) throw error;
      return { status: 'connected', message: 'Connected to Supabase database' };
    } catch {
      return { status: 'local', message: 'Supabase configured but connection failed, using localStorage' };
    }
  }
  return { status: 'local', message: 'Using localStorage (configure Supabase for production)' };
}