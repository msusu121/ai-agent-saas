'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronRight,
  Filter,
  LoaderCircle,
  MapPin,
  Pencil,
  Play,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { SectionShell } from '@/components/section-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';

type Lead = {
  id: string;
  name: string;
  industry: string | null;
  location: string | null;
  score: number;
  aiSummary: string | null;
  recommendedOffer: string | null;
  signals: Array<{ value: string }>;
};
type Campaign = {
  id: string;
  name: string;
  offer: string;
  locations: string[];
  industries: string[];
  businessSize: string | null;
  targetCount: number;
  status: string;
  failureReason: string | null;
  _count?: { leads: number };
};
type CampaignForm = {
  name: string;
  offer: string;
  locations: string;
  industries: string;
  businessSize: string;
  targetCount: string;
};
const emptyForm: CampaignForm = {
  name: '',
  offer: 'Introduce a tailored automation solution that reduces manual work.',
  locations: 'Mombasa',
  industries: 'Private School',
  businessSize: 'Any size',
  targetCount: '25',
};

export default function OpportunitiesPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [highFitOnly, setHighFitOnly] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [editor, setEditor] = useState<Campaign | 'new' | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        apiRequest<{ leads: Lead[] }>('/leads?limit=100'),
        apiRequest<{ campaigns: Campaign[] }>('/campaigns'),
      ]);
      setLeads(l.leads);
      setCampaigns(c.campaigns);
      setSelected((current) => current ?? l.leads[0] ?? null);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to load opportunities',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleLeads = useMemo(
    () => (highFitOnly ? leads.filter((l) => l.score >= 80) : leads),
    [highFitOnly, leads],
  );
  function openEditor(c?: Campaign) {
    setManagerOpen(true);
    setEditor(c ?? 'new');
    setForm(
      c
        ? {
            name: c.name,
            offer: c.offer,
            locations: c.locations.join(', '),
            industries: c.industries.join(', '),
            businessSize: c.businessSize ?? 'Any size',
            targetCount: String(c.targetCount),
          }
        : emptyForm,
    );
  }
  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        offer: form.offer,
        locations: form.locations
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        industries: form.industries
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        businessSize: form.businessSize,
        targetCount: Number(form.targetCount),
      };
      if (editor === 'new')
        await apiRequest('/campaigns', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      else if (editor)
        await apiRequest(`/campaigns/${editor.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      setNotice(
        editor === 'new' ? 'Search campaign created' : 'Campaign updated',
      );
      setEditor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save campaign',
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeCampaign(c: Campaign) {
    try {
      await apiRequest(`/campaigns/${c.id}`, { method: 'DELETE' });
      setNotice(`${c.name} deleted`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to delete campaign',
      );
    }
  }
  async function runCampaign(c: Campaign) {
    try {
      await apiRequest(`/campaigns/${c.id}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(`${c.name} queued for discovery`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to run campaign',
      );
    }
  }
  return (
    <SectionShell
      active="/opportunities"
      eyebrow="AI-ranked prospects"
      title="Top opportunities"
      description="Businesses ranked by observed need, fit, and the strength of public evidence."
      action={
        <Button onClick={() => openEditor()} className="h-10 rounded-xl">
          <Search className="size-4" />
          New search
        </Button>
      }
    >
      {notice ? (
        <div
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
        >
          {notice}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
        >
          {error}
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-[24px] border border-[#e9e7f0] bg-white shadow-[0_12px_35px_rgb(31_26_55/4%)]">
          <div className="flex items-center justify-between border-b border-[#efedf4] p-4 sm:px-6">
            <div className="flex items-center gap-2">
              <Badge className="bg-violet-50 text-violet-700">
                All {leads.length}
              </Badge>
              <Badge variant="ghost">
                High fit {leads.filter((l) => l.score >= 80).length}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setManagerOpen(true)}
                variant="ghost"
                size="sm"
                className="hidden text-violet-700 sm:flex"
              >
                Searches {campaigns.length}
              </Button>
              <Button
                onClick={() => setHighFitOnly((x) => !x)}
                variant={highFitOnly ? 'default' : 'outline'}
                size="sm"
              >
                <Filter className="size-3.5" />
                {highFitOnly ? 'All' : 'Filters'}
              </Button>
            </div>
          </div>
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2">
              <LoaderCircle className="size-5 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="divide-y divide-[#efedf4]">
              {visibleLeads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className={`grid w-full gap-3 p-4 text-left transition sm:grid-cols-[minmax(0,1fr)_minmax(190px,.7fr)_80px] sm:items-center sm:px-6 ${selected?.id === lead.id ? 'bg-[#fbfaff]' : 'hover:bg-[#fbfaff]'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-violet-50 text-sm font-extrabold text-violet-700">
                      {lead.name
                        .split(' ')
                        .map((x) => x[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[13px] font-bold">{lead.name}</h2>
                        <Badge
                          className={`h-[18px] px-1.5 text-[9px] ${lead.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}
                        >
                          {lead.score >= 80 ? 'High match' : 'Good match'}
                        </Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-[#7d788c]">
                        <MapPin className="size-3" />
                        {lead.location ?? 'No location'}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[#7d788c]">
                        <Building2 className="size-3" />
                        {lead.industry ?? 'Uncategorized'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-[#faf9fc] p-2.5">
                    <Sparkles className="size-4 text-violet-600" />
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#9893a3]">
                        Strongest signal
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[10px] font-medium">
                        {lead.signals[0]?.value ??
                          lead.aiSummary ??
                          'No signal yet'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end">
                    <div className="text-right">
                      <p className="text-[9px] text-[#8c8898]">Score</p>
                      <p className="text-xl font-extrabold text-emerald-600">
                        {lead.score}%
                      </p>
                    </div>
                    <ChevronRight className="ml-3 size-4 text-[#aaa6b5]" />
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && !visibleLeads.length ? (
            <div className="p-10 text-center text-sm text-[#817d90]">
              No opportunities match this filter.
            </div>
          ) : null}
        </section>
        <aside className="h-fit rounded-[24px] border border-[#e9e7f0] bg-white p-5 shadow-[0_12px_35px_rgb(31_26_55/4%)] xl:sticky xl:top-24">
          {selected ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid size-14 place-items-center rounded-2xl bg-indigo-100 text-lg font-extrabold text-indigo-700">
                  {selected.name
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold">{selected.name}</h2>
                    <Badge className="bg-emerald-50 text-emerald-700">
                      {selected.score}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-[#7d788c]">
                    {selected.location ?? 'No location'} ·{' '}
                    {selected.industry ?? 'Uncategorized'}
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-violet-50/70 p-4">
                <p className="flex items-center gap-2 text-xs font-bold text-violet-800">
                  <Sparkles className="size-4" />
                  AI insight
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#5f5a70]">
                  {selected.aiSummary ??
                    selected.signals[0]?.value ??
                    'AI analysis is pending for this opportunity.'}
                </p>
              </div>
              <div className="mt-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#918da1]">
                  Why this is a fit
                </p>
                <ul className="mt-3 space-y-2.5 text-[11px] text-[#5f5a70]">
                  {(selected.signals.length
                    ? selected.signals.map((s) => s.value)
                    : ['Qualified from observed public business evidence']
                  )
                    .slice(0, 4)
                    .map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-0.5 grid size-4 place-items-center rounded-full bg-emerald-50 text-[9px] text-emerald-700">
                          ✓
                        </span>
                        {item}
                      </li>
                    ))}
                </ul>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link
                  href={`/leads?search=${encodeURIComponent(selected.name)}`}
                  className="flex h-10 items-center justify-center rounded-xl border text-xs font-semibold"
                >
                  Full report
                </Link>
                <Link
                  href={`/messages?lead=${selected.id}`}
                  className="flex h-10 items-center justify-center rounded-xl bg-violet-600 text-xs font-semibold text-white"
                >
                  Generate message
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#817d90]">Select an opportunity.</p>
          )}
        </aside>
      </div>
      {managerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#17122b]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setManagerOpen(false);
              setEditor(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Search campaigns"
            className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold">Opportunity searches</h2>
                <p className="mt-1 text-xs text-[#817d90]">
                  Create, run, edit, or remove discovery campaigns.
                </p>
              </div>
              <button
                aria-label="Close searches"
                onClick={() => {
                  setManagerOpen(false);
                  setEditor(null);
                }}
                className="grid size-9 place-items-center rounded-xl hover:bg-violet-50"
              >
                <X className="size-5" />
              </button>
            </div>
            {editor ? (
              <form
                onSubmit={saveCampaign}
                className="mt-5 rounded-2xl bg-[#f8f7fc] p-4"
              >
                <h3 className="text-sm font-bold">
                  {editor === 'new' ? 'New search' : 'Edit search'}
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Campaign name"
                    required
                    placeholder="Campaign name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <Input
                    aria-label="Campaign offer"
                    required
                    minLength={20}
                    placeholder="What are you selling?"
                    value={form.offer}
                    onChange={(e) =>
                      setForm({ ...form, offer: e.target.value })
                    }
                  />
                  <Input
                    aria-label="Campaign locations"
                    required
                    placeholder="Locations"
                    value={form.locations}
                    onChange={(e) =>
                      setForm({ ...form, locations: e.target.value })
                    }
                  />
                  <Input
                    aria-label="Campaign industries"
                    required
                    placeholder="Industries"
                    value={form.industries}
                    onChange={(e) =>
                      setForm({ ...form, industries: e.target.value })
                    }
                  />
                  <Input
                    aria-label="Campaign target count"
                    type="number"
                    min="1"
                    max="500"
                    value={form.targetCount}
                    onChange={(e) =>
                      setForm({ ...form, targetCount: e.target.value })
                    }
                  />
                  <select
                    aria-label="Campaign business size"
                    value={form.businessSize}
                    onChange={(e) =>
                      setForm({ ...form, businessSize: e.target.value })
                    }
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  >
                    {['Any size', '1–10 employees', '11–50 employees', '51–200 employees', '201+ employees'].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditor(null)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={saving}>
                    {saving ? 'Saving…' : 'Save search'}
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={() => openEditor()} className="mt-5">
                <Search className="size-4" />
                Create new search
              </Button>
            )}
            <div className="mt-5 divide-y rounded-2xl border">
              {campaigns.map((c) => {
                const editable = [
                  'DRAFT',
                  'READY',
                  'PAUSED',
                  'FAILED',
                ].includes(c.status);
                const deletable = [
                  ...['DRAFT', 'READY', 'PAUSED', 'FAILED'],
                  'COMPLETED',
                ].includes(c.status);
                return (
                  <article key={c.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{c.name}</p>
                      <p className="mt-1 text-[10px] text-[#817d90]">
                        {c.status} · {c._count?.leads ?? 0}/{c.targetCount}{' '}
                        leads
                      </p>
                      {c.status === 'FAILED' && c.failureReason ? (
                        <p className="mt-1 text-[10px] font-semibold text-rose-600">
                          AI qualification failed.{' '}
                          <Link
                            href="/settings?tab=providers"
                            className="text-violet-700 underline underline-offset-2"
                          >
                            Change AI model
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    <Button
                      aria-label={`Run ${c.name}`}
                      disabled={!editable}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void runCampaign(c)}
                    >
                      <Play />
                    </Button>
                    <Button
                      aria-label={`Edit ${c.name}`}
                      disabled={!editable}
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => openEditor(c)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={`Delete ${c.name}`}
                      disabled={!deletable}
                      size="icon-sm"
                      variant="ghost"
                      className="text-rose-600"
                      onClick={() => void removeCampaign(c)}
                    >
                      <Trash2 />
                    </Button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </SectionShell>
  );
}
