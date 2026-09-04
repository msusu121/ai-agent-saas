'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, LoaderCircle, Pencil, Search, Trash2, UserRoundPlus, X } from 'lucide-react';

import { SectionShell } from '@/components/section-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest, organizationName } from '@/lib/api';

type Lead = { id: string; name: string; website: string | null; industry: string | null; location: string | null; score: number; status: string; estimatedValue: string | null; currency: string; aiSummary: string | null; signals: Array<{ id: string; value: string }>; contacts: Array<{ id: string; name: string | null; title: string | null }> };
type LeadForm = { name: string; website: string; industry: string; location: string; score: string; status: string; estimatedValue: string; aiSummary: string };
const statuses = ['DISCOVERED', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'MEETING', 'PROPOSAL', 'WON', 'LOST', 'SUPPRESSED'];
const emptyForm: LeadForm = { name: '', website: '', industry: '', location: '', score: '50', status: 'DISCOVERED', estimatedValue: '', aiSummary: '' };
const statusTone: Record<string, string> = { QUALIFIED: 'bg-emerald-50 text-emerald-700', CONTACTED: 'bg-violet-50 text-violet-700', REPLIED: 'bg-blue-50 text-blue-700', MEETING: 'bg-amber-50 text-amber-700', WON: 'bg-emerald-100 text-emerald-800', LOST: 'bg-rose-50 text-rose-700', SUPPRESSED: 'bg-slate-100 text-slate-600' };
const formatStatus = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replaceAll('_', ' ');
const formatValue = (value: string | null, currency: string) => value ? `${currency} ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))}` : '—';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [editor, setEditor] = useState<Lead | 'new' | null>(null);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [orgName, setOrgName] = useState('your organization');

  const loadLeads = useCallback(async () => {
    try { const body = await apiRequest<{ leads: Lead[] }>('/leads?limit=100'); setLeads(body.leads); setError(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load leads'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setOrgName(organizationName()); setSearch(new URLSearchParams(window.location.search).get('search') ?? ''); void loadLeads(); }, [loadLeads]);

  const visibleLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => (statusFilter === 'ALL' || lead.status === statusFilter) && (!query || [lead.name, lead.industry, lead.location].some((value) => value?.toLowerCase().includes(query))));
  }, [leads, search, statusFilter]);

  function openEditor(lead?: Lead) {
    setEditor(lead ?? 'new');
    setForm(lead ? { name: lead.name, website: lead.website ?? '', industry: lead.industry ?? '', location: lead.location ?? '', score: String(lead.score), status: lead.status, estimatedValue: lead.estimatedValue ?? '', aiSummary: lead.aiSummary ?? '' } : emptyForm);
    setError('');
  }

  async function saveLead(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { name: form.name, website: form.website || null, industry: form.industry || null, location: form.location || null, score: Number(form.score), status: form.status, estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null, currency: 'KES', aiSummary: form.aiSummary || null };
    try {
      if (editor === 'new') await apiRequest('/leads', { method: 'POST', body: JSON.stringify(payload) });
      else if (editor) await apiRequest(`/leads/${editor.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setNotice(editor === 'new' ? 'Lead created' : 'Lead updated'); setEditor(null); await loadLeads();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save lead'); }
    finally { setSaving(false); }
  }

  async function deleteLead(lead: Lead) {
    setError('');
    try { await apiRequest(`/leads/${lead.id}`, { method: 'DELETE' }); setNotice(`${lead.name} deleted`); await loadLeads(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to delete lead'); }
  }

  return (
    <SectionShell active="/leads" eyebrow="Organization CRM" title="Leads" description={`Live tenant-scoped opportunities for ${orgName}. Every row comes from PostgreSQL through Express.`} action={<Button onClick={() => openEditor()} className="h-10 rounded-xl"><UserRoundPlus className="size-4" /> Add lead</Button>}>
      {notice ? <div role="status" className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice('')}><X className="size-4" /></button></div> : null}
      {editor ? <form onSubmit={saveLead} className="mb-5 rounded-[24px] border border-violet-200 bg-white p-5 shadow-lg"><div className="flex items-center justify-between"><h2 className="text-base font-bold">{editor === 'new' ? 'Create lead' : `Edit ${editor.name}`}</h2><button type="button" aria-label="Close lead editor" onClick={() => setEditor(null)}><X className="size-5" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input aria-label="Lead name" required placeholder="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><Input aria-label="Lead website" type="url" placeholder="https://example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /><Input aria-label="Lead industry" placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /><Input aria-label="Lead location" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /><Input aria-label="Lead score" type="number" min="0" max="100" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /><select aria-label="Lead status" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select><Input aria-label="Estimated value" type="number" min="0" placeholder="Estimated value (KES)" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} /><Input aria-label="Lead summary" placeholder="Opportunity summary" value={form.aiSummary} onChange={(e) => setForm({ ...form, aiSummary: e.target.value })} /></div><div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editor === 'new' ? 'Create lead' : 'Save changes'}</Button></div></form> : null}
      <section className="rounded-[24px] border border-[#e9e7f0] bg-white shadow-[0_12px_35px_rgb(31_26_55/4%)]">
        <div className="flex flex-col gap-3 border-b border-[#efedf4] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9692a2]" /><Input aria-label="Search leads" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search businesses, industries or locations..." className="h-10 rounded-xl pl-9" /></div><div className="flex items-center gap-2"><Badge className="bg-emerald-50 text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" /> Live API · {leads.length} leads</Badge><Button onClick={() => setShowFilters((value) => !value)} variant="outline" className="h-10 rounded-xl"><Filter className="size-4" /> Filters</Button></div></div>
        {showFilters ? <div className="flex items-center gap-3 border-b border-[#efedf4] bg-[#faf9fc] p-4 sm:px-6"><label className="text-xs font-bold" htmlFor="status-filter">Status</label><select id="status-filter" className="h-9 rounded-md border border-input bg-white px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></div> : null}
        {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm font-semibold text-violet-700"><LoaderCircle className="size-5 animate-spin" /> Loading organization leads…</div> : null}
        {error ? <div role="alert" className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}
        {!loading && !error ? <div className="divide-y divide-[#efedf4]">{visibleLeads.map((lead) => <article key={lead.id} className="grid gap-3 p-4 transition hover:bg-[#fbfaff] md:grid-cols-[1.25fr_.65fr_.75fr_60px_.6fr_.55fr_76px] md:items-center md:gap-3 md:px-6"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-xs font-bold text-violet-700">{lead.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div className="min-w-0"><p className="truncate text-[12px] font-bold">{lead.name}</p><p className="mt-1 truncate text-[9px] text-[#8a8697]">{lead.aiSummary ?? lead.signals[0]?.value ?? 'Qualified business signal'}</p></div></div><p className="text-[11px] text-[#625e70]">{lead.industry ?? '—'}</p><p className="text-[11px] text-[#625e70]">{lead.location ?? '—'}</p><p className="text-[15px] font-extrabold text-emerald-600">{lead.score}%</p><Badge className={statusTone[lead.status] ?? 'bg-violet-50 text-violet-700'}>{formatStatus(lead.status)}</Badge><p className="text-[11px] font-bold">{formatValue(lead.estimatedValue, lead.currency)}</p><div className="flex gap-1"><Button aria-label={`Edit ${lead.name}`} onClick={() => openEditor(lead)} size="icon-sm" variant="ghost"><Pencil /></Button><Button aria-label={`Delete ${lead.name}`} onClick={() => void deleteLead(lead)} size="icon-sm" variant="ghost" className="text-rose-600"><Trash2 /></Button></div></article>)}</div> : null}
        {!loading && !error && !visibleLeads.length ? <div className="p-10 text-center text-sm text-[#777386]">No leads match these filters.</div> : null}
      </section>
    </SectionShell>
  );
}
