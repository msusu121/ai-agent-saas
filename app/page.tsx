'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BriefcaseBusiness,
  Building2,
  Camera,
  ChevronDown,
  CircleCheck,
  Globe2,
  Mail,
  MapPin,
  MessageCircleMore,
  LoaderCircle,
  Phone,
  Sparkles,
  Users,
} from 'lucide-react';
import { SectionShell } from '@/components/section-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api';
import { DiscoverySources, defaultSources } from '@/components/discovery-sources';

type Contact = {
  id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  isDecisionMaker: boolean;
};
type Lead = {
  id: string;
  name: string;
  status: string;
  score: number;
  location: string | null;
  industry: string | null;
  website: string | null;
  source: string | null;
  aiSummary: string | null;
  recommendedOffer: string | null;
  signals: Array<{ value: string }>;
  contacts: Contact[];
};
type Campaign = {
  id: string;
  name: string;
  status: string;
  failureReason: string | null;
  updatedAt: string;
  targetCount: number;
  _count: { leads: number };
};
type Outreach = {
  id: string;
  leadId: string;
  status: string;
  subject: string | null;
  body: string;
  recipient: string;
};

const stages = [
  'DISCOVERED',
  'QUALIFIED',
  'CONTACTED',
  'REPLIED',
  'MEETING',
  'PROPOSAL',
  'WON',
  'LOST',
];
const stageTone = [
  'text-blue-600 bg-blue-50',
  'text-violet-700 bg-violet-50',
  'text-emerald-700 bg-emerald-50',
  'text-fuchsia-700 bg-fuchsia-50',
  'text-amber-700 bg-amber-50',
  'text-indigo-700 bg-indigo-50',
  'text-emerald-700 bg-emerald-50',
  'text-rose-600 bg-rose-50',
];

const locations = ['Coast, Kenya', 'Mombasa, Kenya', 'Nairobi, Kenya', 'Kisumu, Kenya', 'Nakuru, Kenya', 'All Kenya'];
const industries = ['Private schools', 'Hospitality', 'Healthcare', 'Retail', 'Logistics', 'Real estate', 'Restaurants & catering', 'Professional services'];
const businessSizes = ['Any size', '1–10 employees', '11–50 employees', '51–200 employees', '201+ employees'];

function explainCampaignFailure(reason: string) {
  if (reason.includes('(402)'))
    return 'This AI model requires credits or is not available for the connected account. Choose another model in Settings or add provider credits, then retry.';
  if (reason.includes('(401)'))
    return 'The AI provider rejected this credential. Verify the provider and API key in Settings, then retry.';
  if (reason.includes('(404)'))
    return 'The configured AI model was not found. Enter a valid model ID in Settings, then retry.';
  if (reason.includes('(429)'))
    return 'The AI provider rate limit or usage limit was reached. Choose another model or retry after the provider limit resets.';
  return `Campaign failed: ${reason}`;
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [messages, setMessages] = useState<Outreach[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [offer, setOffer] = useState(
    'School attendance and parent notification software',
  );
  const [location, setLocation] = useState('Coast, Kenya');
  const [industry, setIndustry] = useState('Private schools');
  const [businessSize, setBusinessSize] = useState('Any size');
  const [target, setTarget] = useState(5);
  const [discoverySources, setDiscoverySources] = useState<string[]>(defaultSources);
  async function load() {
    try {
      const [l, c, m] = await Promise.all([
        apiRequest<{ leads: Lead[] }>('/leads?limit=100'),
        apiRequest<{ campaigns: Campaign[] }>('/campaigns'),
        apiRequest<{ messages: Outreach[] }>('/outreach?limit=200'),
      ]);
      setLeads(l.leads);
      setCampaigns(c.campaigns);
      setMessages(m.messages);
      setSelected((current) => current ?? l.leads[0] ?? null);
      const latestFailure = c.campaigns.find(
        (campaign) => campaign.status === 'FAILED' && campaign.failureReason,
      );
      const isRecentFailure =
        latestFailure &&
        Date.now() - new Date(latestFailure.updatedAt).getTime() < 10 * 60_000;
      setError(
        latestFailure?.failureReason && isRecentFailure
          ? explainCampaignFailure(latestFailure.failureReason)
          : '',
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load workspace',
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function startSearch(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = await apiRequest<{ campaign: { id: string } }>(
        '/campaigns',
        {
          method: 'POST',
          body: JSON.stringify({
            name: `${industry} in ${location}`,
            offer,
            locations: [location],
            industries: [industry],
            businessSize,
            targetCount: target,
            discoverySources,
          }),
        },
      );
      await apiRequest(`/campaigns/${body.campaign.id}/run`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(
        'Your scout agent is discovering and qualifying businesses now.',
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to start search',
      );
    } finally {
      setSaving(false);
    }
  }
  async function generateDraft() {
    if (!selected) return;
    const contact =
      selected.contacts.find((c) => c.email) || selected.contacts[0];
    const recipient = contact?.email ?? contact?.whatsapp ?? contact?.phone;
    if (!recipient) {
      setError('Add an email or WhatsApp contact before generating outreach.');
      return;
    }
    setDrafting(true);
    try {
      await apiRequest(`/outreach/leads/${selected.id}/draft`, {
        method: 'POST',
        body: JSON.stringify({
          channel: contact?.email ? 'EMAIL' : 'WHATSAPP',
          recipient,
        }),
      });
      setNotice('Personalized outreach drafted and placed in review.');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to generate outreach',
      );
    } finally {
      setDrafting(false);
    }
  }
  const selectedMessage = selected
    ? messages.find((m) => m.leadId === selected.id)
    : undefined;
  const activeCampaign = campaigns.find(
    (c) => ['QUEUED', 'DISCOVERING', 'QUALIFYING'].includes(c.status),
  );
  const searchInProgress = saving || Boolean(activeCampaign);
  useEffect(() => {
    if (!activeCampaign) return;
    const timer = window.setInterval(() => void load(), 2_500);
    return () => window.clearInterval(timer);
  }, [activeCampaign?.id, activeCampaign?.status]);
  const pipeline = useMemo(
    () =>
      stages.map((stage, index) => ({
        stage,
        count: leads.filter((l) => l.status === stage).length,
        tone: stageTone[index],
      })),
    [leads],
  );
  const contact =
    selected?.contacts.find((c) => c.isDecisionMaker) ?? selected?.contacts[0];
  return (
    <SectionShell
      active="/"
      eyebrow="AI business development agent"
      title="Good morning, Hasan 👋"
      description="Your AI agent finds businesses that need what you sell and helps you close more deals."
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
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
        >
          <span>{error}</span>
          {error.includes('Settings') || error.includes('AI provider') ? (
            <Link
              href="/settings?tab=providers"
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-violet-700 shadow-sm"
            >
              Change AI model
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <form
            onSubmit={startSearch}
            className="rounded-[24px] border border-[#e9e7f0] bg-white p-4 shadow-[0_12px_35px_rgb(31_26_55/4%)] sm:p-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold">
                  What do you want to sell today?
                </h2>
                <p className="mt-1 text-[11px] text-[#817d90]">
                  Describe your product or service and let AI find businesses
                  that need it.
                </p>
              </div>
              <Sparkles className="size-5 text-violet-600" />
            </div>
            <label className="mt-4 flex items-center gap-3 rounded-xl border border-violet-200 px-3 py-2.5 focus-within:ring-2 focus-within:ring-violet-100">
              <BriefcaseBusiness className="size-4 text-violet-600" />
              <input
                aria-label="Product or service"
                required
                maxLength={200}
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
              />
              <span className="text-[9px] text-[#aaa6b5]">
                {offer.length}/200
              </span>
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <SelectField
                icon={MapPin}
                label="Location"
                value={location}
                onChange={setLocation}
                options={locations}
              />
              <SelectField
                icon={Building2}
                label="Industry (Optional)"
                value={industry}
                onChange={setIndustry}
                options={industries}
              />
              <SelectField icon={Users} label="Business size (Optional)" value={businessSize} onChange={setBusinessSize} options={businessSizes} />
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold">
                  How many opportunities?
                </p>
                <div className="mt-2 flex gap-1">
                  {[5, 25, 50, 100, 250].map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setTarget(n)}
                      className={`h-8 min-w-12 rounded-lg border px-2 text-[10px] font-bold ${target === n ? 'border-violet-600 bg-violet-600 text-white' : 'bg-white hover:bg-violet-50'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <Button type="submit" disabled={searchInProgress} className="h-10 min-w-44 rounded-xl">
                {searchInProgress ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {saving ? 'Starting search…' : activeCampaign ? `${activeCampaign.status.toLowerCase().replace('_', ' ')}…` : 'Find Opportunities'}
              </Button>
            </div>
            <DiscoverySources value={discoverySources} onChange={setDiscoverySources} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[10px] text-[#817d90]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-violet-600" />
                AI searches Google, Instagram, Facebook, websites, directories
                and maps
              </span>
              <span>
                {activeCampaign
                  ? 'Search running now'
                  : 'Usually takes 2–5 minutes'}
              </span>
            </div>
          </form>
          <section className="rounded-[24px] border border-[#e9e7f0] bg-white shadow-[0_12px_35px_rgb(31_26_55/4%)]">
            <div className="flex items-center justify-between border-b px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold">Top Opportunities for You</h2>
                <Badge className="bg-violet-50 text-violet-700">
                  AI ranked
                </Badge>
              </div>
              <Link
                href="/opportunities"
                className="text-[10px] font-bold text-violet-700"
              >
                View all
              </Link>
            </div>
            <div className="divide-y">
              {leads.slice(0, 5).map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className={`grid w-full gap-3 p-4 text-left hover:bg-[#fbfaff] sm:grid-cols-[minmax(0,1fr)_minmax(180px,.8fr)_72px] sm:items-center sm:px-5 ${selected?.id === lead.id ? 'bg-violet-50/40' : ''}`}
                >
                  <div className="flex gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border bg-white text-xs font-extrabold text-violet-700">
                      {lead.name
                        .split(' ')
                        .map((x) => x[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-bold">
                          {lead.name}
                        </p>
                        <Badge
                          className={`h-[17px] px-1.5 text-[8px] ${lead.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}
                        >
                          {lead.score >= 80 ? 'High Match' : 'Good Match'}
                        </Badge>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[9px] text-[#817d90]">
                        <MapPin className="size-3" />
                        {lead.location ?? 'No location'}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[9px] text-[#817d90]">
                        <Building2 className="size-3" />
                        {lead.industry ?? 'Uncategorized'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold">
                      Why this is a great opportunity
                    </p>
                    <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-[#716c82]">
                      {lead.signals[0]?.value ??
                        lead.aiSummary ??
                        'Qualified from observed public signals.'}
                    </p>
                  </div>
                  <div className="text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-full border-[3px] border-violet-500 text-sm font-extrabold text-violet-700">
                      {lead.score}%
                    </span>
                    <p className="mt-1 text-[8px] text-[#817d90]">
                      Match Score
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {!leads.length ? (
              <div className="p-8 text-center text-sm text-[#817d90]">
                Run your first search to discover businesses.
              </div>
            ) : null}
          </section>
        </div>
        <aside className="h-fit space-y-4 xl:sticky xl:top-24">
          {selected ? (
            <>
              <section className="rounded-[24px] border border-[#e9e7f0] bg-white p-5 shadow-[0_12px_35px_rgb(31_26_55/4%)]">
                <div className="flex items-start gap-3">
                  <span className="grid size-14 place-items-center rounded-full bg-indigo-100 text-lg font-extrabold text-indigo-700">
                    {selected.name
                      .split(' ')
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-bold">
                        {selected.name}
                      </h2>
                      <Badge className="bg-emerald-50 text-emerald-700">
                        High Match
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-[#817d90]">
                      {selected.location ?? 'No location'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#817d90]">
                      {selected.industry ?? 'Uncategorized'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 border-b pb-4">
                  <Social icon={Globe2} />
                <Social icon={Camera} />
                  <Social icon={MessageCircleMore} />
                  <Social icon={Phone} />
                </div>
                <div className="mt-4">
                  <p className="flex items-center gap-2 text-xs font-bold">
                    <Sparkles className="size-4 text-violet-600" />
                    AI Insight
                  </p>
                  <p className="mt-2 text-[10px] leading-4 text-[#625d70]">
                    {selected.aiSummary ??
                      selected.signals[0]?.value ??
                      'AI research is gathering evidence for this business.'}
                  </p>
                </div>
                {selected.recommendedOffer ? (
                  <div className="mt-4 rounded-xl bg-violet-50 p-3">
                    <p className="text-[9px] text-violet-600">
                      Recommended solution
                    </p>
                    <p className="mt-1 text-xs font-bold">
                      {selected.recommendedOffer}
                    </p>
                  </div>
                ) : null}
                {contact ? (
                  <div className="mt-4 rounded-xl border p-3">
                    <p className="text-[9px] font-bold uppercase text-[#918da1]">
                      Best contact found
                    </p>
                    <p className="mt-2 text-xs font-bold">
                      {contact.name ?? 'Decision maker'}{' '}
                      {contact.isDecisionMaker ? (
                        <Badge className="ml-1 bg-violet-50 text-violet-700">
                          Primary
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[10px] text-[#817d90]">
                      {contact.title ?? 'Business contact'}
                    </p>
                    <p className="mt-1 text-[10px] text-violet-700">
                      {contact.email ?? contact.whatsapp ?? contact.phone}
                    </p>
                  </div>
                ) : null}
              </section>
              <section className="rounded-[24px] border border-[#e9e7f0] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold">AI Generated Message</h2>
                  <Link
                    href={`/messages?lead=${selected.id}`}
                    className="text-[9px] font-bold text-violet-700"
                  >
                    Open editor
                  </Link>
                </div>
                {selectedMessage ? (
                  <>
                    <p className="mt-3 text-[10px] font-bold">
                      {selectedMessage.subject ?? 'Personalized outreach'}
                    </p>
                    <p className="mt-2 line-clamp-6 whitespace-pre-line text-[10px] leading-4 text-[#625d70]">
                      {selectedMessage.body}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-[10px] leading-4 text-[#817d90]">
                    Generate a grounded message from this lead’s real evidence
                    and best contact.
                  </p>
                )}
                <Button
                  onClick={() => void generateDraft()}
                  disabled={drafting || !contact}
                  className="mt-4 w-full"
                >
                  <Mail className="size-4" />
                  {drafting
                    ? 'Drafting…'
                    : selectedMessage
                      ? 'Generate another'
                      : 'Generate message'}
                </Button>
              </section>
            </>
          ) : (
            <section className="rounded-[24px] border bg-white p-8 text-center text-sm text-[#817d90]">
              Select an opportunity to inspect it.
            </section>
          )}
        </aside>
      </div>
      <section className="mt-5 rounded-[22px] border border-[#e9e7f0] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold">Your Pipeline Overview</h2>
          <Link
            href="/pipeline"
            className="text-[10px] font-bold text-violet-700"
          >
            View pipeline →
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {pipeline.map(({ stage, count, tone }) => (
            <Link
              href="/pipeline"
              key={stage}
              className={`rounded-xl p-3 ${tone}`}
            >
              <p className="text-[9px] capitalize">{stage.toLowerCase()}</p>
              <p className="mt-1 text-lg font-extrabold">{count}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border bg-white px-4 py-3 text-[10px]">
        <strong>Data Sources</strong>
        {[
          'Instagram',
          'Facebook / Meta',
          'Google Search',
          'Google Maps',
          'Public Web Crawler',
        ].map((source) => (
          <span
            key={source}
            className="flex items-center gap-1.5 text-[#6f6a7e]"
          >
            <CircleCheck className="size-3.5 text-violet-600" />
            {source}
          </span>
        ))}
      </section>
    </SectionShell>
  );
}

function SelectField({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="relative flex items-center gap-2 rounded-xl border px-3 py-2 focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
      <Icon className="size-4 shrink-0 text-[#716c82]" />
      <span className="pointer-events-none absolute left-9 top-1.5 text-[9px] text-[#8b8798]">{label}</span>
      <select aria-label={label} required value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 appearance-none bg-transparent pb-0.5 pt-3 text-xs font-semibold outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <ChevronDown className="pointer-events-none size-3.5 shrink-0 text-[#8b8798]" />
    </label>
  );
}
function Social({ icon: Icon }: { icon: typeof Globe2 }) {
  return (
    <span className="grid size-8 place-items-center rounded-full border text-violet-600">
      <Icon className="size-4" />
    </span>
  );
}
