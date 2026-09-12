'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Mail, MessageCircle, Pencil, Search, Send, Sparkles, Trash2 } from 'lucide-react';

import { SectionShell } from '@/components/section-shell';
import { DeliveryHistory } from '@/components/delivery-history';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';
import { deliveryTargets, submitDeliveries, type DeliveryAttempt } from '@/lib/message-delivery';

type Contact = { email: string | null; whatsapp: string | null };
type Lead = { id: string; name: string; industry: string | null; location: string | null; score: number; estimatedValue: string | null; currency: string; contacts: Contact[] };
type Message = { id: string; leadId: string; channel: 'EMAIL' | 'WHATSAPP'; status: string; recipient: string; subject: string | null; body: string; createdAt: string; sentAt: string | null; lead: Lead };

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]); const [leads, setLeads] = useState<Lead[]>([]); const [selectedLeadId, setSelectedLeadId] = useState(''); const [search, setSearch] = useState(''); const [text, setText] = useState(''); const [editing, setEditing] = useState<Message | null>(null); const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [generating, setGenerating] = useState(false);
  const load = useCallback(async () => { try { const [messageBody, leadBody] = await Promise.all([apiRequest<{ messages: Message[] }>('/outreach?limit=200'), apiRequest<{ leads: Lead[] }>('/leads?limit=100')]); setMessages(messageBody.messages); setLeads(leadBody.leads); setSelectedLeadId((current) => current || leadBody.leads[0]?.id || ''); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load messages'); } }, []);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const requestedLead = params.get('lead'); if (requestedLead) setSelectedLeadId(requestedLead); void load(); }, [load]);
  const followup = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('filter') === 'followup';
  const scopedMessages = followup ? messages.filter((message) => ['NEEDS_REVIEW', 'SCHEDULED', 'SENDING', 'FAILED'].includes(message.status)) : messages;
  const scopedLeadIds = new Set(scopedMessages.map((message) => message.leadId));
  const filteredLeads = leads.filter((lead) => (!followup || scopedLeadIds.has(lead.id)) && lead.name.toLowerCase().includes(search.toLowerCase())); const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null; const thread = scopedMessages.filter((message) => message.leadId === selectedLeadId).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  const suggestion = [...thread].reverse().find(message => ['DRAFT', 'NEEDS_REVIEW'].includes(message.status))?.body ?? '';
  const pendingDelivery = useRef<{ leadId: string; body: string; attempts: DeliveryAttempt[] } | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (!messages.some(message => ['SCHEDULED', 'SENDING'].includes(message.status))) return;
    const timer = window.setInterval(() => { if (!sending.current) void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [messages, load]);
  async function sendDraft(event: FormEvent) {
    event.preventDefault();
    if (!selectedLead || !text.trim() || sending.current) return;
    const targets = deliveryTargets(selectedLead.contacts);
    if (!targets.length) { setError('This lead has no email or WhatsApp destination'); return; }
    if (pendingDelivery.current && (pendingDelivery.current.leadId !== selectedLead.id || pendingDelivery.current.body !== text)) {
      setError('Retry the unchanged message for the original lead first to finish its pending channels.'); return;
    }
    sending.current = true;
    setError('');
    setNotice('Submitting message for delivery…');
    try {
      if (!pendingDelivery.current) {
        if (editing) {
          await apiRequest(`/outreach/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ body: text }) });
          const target = targets.find(target => target.channel === editing.channel && target.recipient === editing.recipient);
          if (target) target.id = editing.id;
        }
        pendingDelivery.current = { leadId: selectedLead.id, body: text, attempts: targets };
      }
      const attempts = pendingDelivery.current.attempts;
      const failures = await submitDeliveries(attempts, async target => {
        const created = await apiRequest<{ message: Message }>('/outreach', { method: 'POST', body: JSON.stringify({ leadId: selectedLead.id, channel: target.channel, recipient: target.recipient, subject: editing?.subject ?? `A quick introduction for ${selectedLead.name}`, body: text }) });
        return created.message.id;
      }, id => apiRequest(`/outreach/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }));
      await load();
      if (failures.length) {
        setNotice(`Queued: ${attempts.filter(attempt => attempt.queued).map(attempt => attempt.channel).join(', ') || 'none'}. Retry to finish the remaining channel.`);
        setError(failures.join(' ')); return;
      }
      pendingDelivery.current = null;
      setText(''); setEditing(null);
      await load();
      setNotice(`Queued for ${attempts.map(attempt => attempt.channel).join(' and ')}. SENT means the provider accepted it.`);
    } catch (caught) { setNotice(''); setError(caught instanceof Error ? caught.message : 'Unable to submit message for delivery'); }
    finally { sending.current = false; }
  }
  async function generateDraft() { if (!selectedLead) return; const email = selectedLead.contacts.find(contact => contact.email?.trim())?.email; const whatsapp = selectedLead.contacts.find(contact => contact.whatsapp?.trim())?.whatsapp; const recipient = email ?? whatsapp; if (!recipient) { setError('No verified email or WhatsApp contact is available for this lead yet'); return; } setGenerating(true); setError(''); try { await apiRequest(`/outreach/leads/${selectedLead.id}/draft`, { method: 'POST', body: JSON.stringify({ channel: email ? 'EMAIL' : 'WHATSAPP', recipient }) }); setNotice(`AI draft generated for ${selectedLead.name} — review required`); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to generate AI draft'); } finally { setGenerating(false); } }
  async function removeMessage(message: Message) { try { await apiRequest(`/outreach/${message.id}`, { method: 'DELETE' }); setNotice('Draft deleted'); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to delete draft'); } }
  async function bookMeeting() { if (!selectedLead) return; try { await apiRequest(`/leads/${selectedLead.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'MEETING' }) }); setNotice(`Meeting stage set for ${selectedLead.name}`); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update lead'); } }
  return <SectionShell active="/messages" eyebrow="Unified conversations" title="Messages" description="Live tenant drafts and outreach history with editable, auditable message CRUD.">
    <DeliveryHistory messages={messages} refresh={() => void load()} />
    {notice ? <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}{error ? <div role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div> : null}
    <div className="grid min-h-[680px] overflow-hidden rounded-[24px] border border-[#e9e7f0] bg-white lg:grid-cols-[300px_minmax(0,1fr)_330px]"><aside className="border-b lg:border-b-0 lg:border-r"><div className="border-b p-4"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9692a2]" /><Input aria-label="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" className="pl-9" /></div></div><div className="divide-y">{filteredLeads.map((lead) => { const last = messages.find((message) => message.leadId === lead.id); return <button key={lead.id} onClick={() => setSelectedLeadId(lead.id)} className={`flex w-full gap-3 p-4 text-left ${lead.id === selectedLeadId ? 'bg-violet-50/70' : 'hover:bg-[#faf9fc]'}`}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-xs font-bold text-violet-700 shadow-sm">{lead.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><span className="min-w-0 flex-1"><strong className="block truncate text-[12px]">{lead.name}</strong><span className="mt-1 block truncate text-[10px] text-[#777386]">{last?.body ?? 'No messages'}</span></span></button>; })}</div></aside>
      <section className="flex min-h-[560px] flex-col border-b lg:border-b-0 lg:border-r">{selectedLead ? <><div className="flex items-center justify-between border-b p-4"><div><p className="text-[12px] font-bold">{selectedLead.name}</p><p className="text-[9px] text-emerald-600">{thread.length} tenant messages</p></div><Badge className="bg-emerald-50 text-emerald-700">{selectedLead.score}% match</Badge></div><div className="flex-1 space-y-3 overflow-y-auto bg-[#fbfafc] p-4 sm:p-6">{thread.map((message) => <article key={message.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 p-4 text-white"><div className="mb-2 flex items-center justify-between gap-3"><Badge className="bg-white/15 text-white">{message.status.replaceAll('_',' ')}</Badge>{['DRAFT','NEEDS_REVIEW'].includes(message.status) ? <div className="flex"><button aria-label={`Edit message ${message.id}`} onClick={() => { setEditing(message); setText(message.body); }} className="p-1"><Pencil className="size-3" /></button><button aria-label={`Delete message ${message.id}`} onClick={() => void removeMessage(message)} className="p-1"><Trash2 className="size-3" /></button></div> : null}</div><p className="text-[11px] leading-5">{message.body}</p><p className="mt-2 text-right text-[8px] text-violet-200">{new Date(message.createdAt).toLocaleString()}</p></article>)}<div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4"><p className="flex items-center gap-2 text-[10px] font-bold text-violet-800"><Sparkles className="size-4" /> Context suggestion</p><p className="mt-2 text-[11px] leading-5 text-[#5f5a70]">{suggestion || 'Generate an evidence-based draft for this lead, then review it below.'}</p><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void generateDraft()} disabled={generating} size="sm">{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{generating ? 'Generating…' : 'Generate with AI'}</Button><Button onClick={() => setText(suggestion)} disabled={!suggestion} size="sm" variant="outline">Use suggestion</Button></div></div></div><form onSubmit={sendDraft} className="border-t p-3"><div className="flex items-center gap-2 rounded-2xl border bg-white p-2"><Input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder={editing ? 'Edit and send message…' : 'Write a message to send…'} className="border-0 shadow-none" /><Button aria-label='Send message' title='Send to available email and WhatsApp contacts' size="icon" type="submit"><Send className="size-4" /></Button></div></form></> : <div className="grid flex-1 place-items-center text-sm text-[#817d90]">No conversation selected.</div>}</section>
      <aside className="p-5">{selectedLead ? <><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-indigo-100 text-sm font-bold text-indigo-700">{selectedLead.name.split(' ').map((part) => part[0]).slice(0,2).join('')}</span><div><h2 className="text-sm font-bold">{selectedLead.name}</h2><p className="mt-1 text-[10px] text-[#817d90]">{selectedLead.industry} · {selectedLead.location}</p></div></div><div className="mt-5 rounded-2xl bg-[#f7f6fb] p-4"><p className="text-[10px] font-bold uppercase text-[#8f8b9b]">Opportunity value</p><p className="mt-2 text-xl font-extrabold">{selectedLead.currency} {selectedLead.estimatedValue ? Number(selectedLead.estimatedValue).toLocaleString() : '—'}</p></div><div className="mt-5 space-y-3 text-[11px]"><p className="flex items-center gap-2"><Mail className="size-4 text-violet-600" />{selectedLead.contacts.find(contact => contact.email?.trim())?.email ?? 'No email'}</p><p className="flex items-center gap-2"><MessageCircle className="size-4 text-emerald-600" />{selectedLead.contacts.find(contact => contact.whatsapp?.trim())?.whatsapp ?? 'No WhatsApp'}</p></div><Button onClick={() => void bookMeeting()} className="mt-6 h-10 w-full rounded-xl">Book meeting</Button></> : null}</aside></div>
  </SectionShell>;
}
