'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Clock3,
  Mail,
  MessageCircleMore,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SectionShell } from '@/components/section-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';

type Step = {
  id?: string;
  position: number;
  delayHours: number;
  channel: 'EMAIL' | 'WHATSAPP';
  subject: string | null;
  prompt: string;
};
type Sequence = {
  id: string;
  name: string;
  isActive: boolean;
  steps: Step[];
  _count: { outreach: number };
};
const starter = (): Step => ({
  position: 1,
  delayHours: 0,
  channel: 'EMAIL',
  subject: 'A quick introduction',
  prompt:
    'Write a concise, evidence-based introduction and include a respectful opt-out.',
});

export default function TemplatesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [editing, setEditing] = useState<Sequence | 'new' | null>(null);
  const [name, setName] = useState('Qualified lead outreach');
  const [active, setActive] = useState(true);
  const [steps, setSteps] = useState<Step[]>([starter()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const body = await apiRequest<{ sequences: Sequence[] }>('/sequences');
      setSequences(body.sequences);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load templates',
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function open(sequence?: Sequence) {
    setEditing(sequence ?? 'new');
    setName(sequence?.name ?? 'Qualified lead outreach');
    setActive(sequence?.isActive ?? true);
    setSteps(sequence?.steps.map((step) => ({ ...step })) ?? [starter()]);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        isActive: active,
        steps: steps.map((step, index) => ({
          position: index + 1,
          delayHours: Number(step.delayHours),
          channel: step.channel,
          subject: step.channel === 'EMAIL' ? step.subject : null,
          prompt: step.prompt,
        })),
      };
      if (editing === 'new')
        await apiRequest('/sequences', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      else if (editing)
        await apiRequest(`/sequences/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      setEditing(null);
      setNotice('Outreach template saved');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save template',
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(sequence: Sequence) {
    try {
      await apiRequest(`/sequences/${sequence.id}`, { method: 'DELETE' });
      setNotice(`${sequence.name} deleted`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to delete template',
      );
    }
  }
  return (
    <SectionShell
      active="/templates"
      eyebrow="Outreach playbooks"
      title="Templates"
      description="Reusable, tenant-scoped email and WhatsApp sequences for consistent follow-up."
      action={
        <Button onClick={() => open()}>
          <Plus className="size-4" />
          New template
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sequences.map((sequence) => (
          <article
            key={sequence.id}
            className="rounded-[22px] border border-[#e9e7f0] bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <Sparkles className="size-5" />
              </span>
              <Badge
                className={
                  sequence.isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }
              >
                {sequence.isActive ? 'Active' : 'Paused'}
              </Badge>
            </div>
            <h2 className="mt-4 text-sm font-bold">{sequence.name}</h2>
            <p className="mt-1 text-[10px] text-[#817d90]">
              {sequence.steps.length} steps · used by {sequence._count.outreach}{' '}
              messages
            </p>
            <div className="mt-4 space-y-2">
              {sequence.steps.slice(0, 3).map((step) => (
                <div
                  key={step.id ?? step.position}
                  className="flex items-center gap-2 rounded-xl bg-[#faf9fc] p-2.5 text-[10px]"
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-white text-violet-600">
                    {step.channel === 'EMAIL' ? (
                      <Mail className="size-3.5" />
                    ) : (
                      <MessageCircleMore className="size-3.5" />
                    )}
                  </span>
                  <span className="flex-1">Step {step.position}</span>
                  <span className="flex items-center gap-1 text-[#817d90]">
                    <Clock3 className="size-3" />
                    {step.delayHours}h
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => open(sequence)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                className="text-rose-600"
                onClick={() => void remove(sequence)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!sequences.length ? (
        <div className="rounded-[24px] border border-dashed bg-white p-10 text-center text-sm text-[#817d90]">
          Create a sequence for first outreach and reliable follow-ups.
        </div>
      ) : null}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17122b]/45 backdrop-blur-sm sm:items-center sm:p-6">
          <form
            onSubmit={save}
            className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold">
                  {editing === 'new'
                    ? 'New outreach template'
                    : 'Edit outreach template'}
                </h2>
                <p className="mt-1 text-xs text-[#817d90]">
                  Each step is generated from real lead evidence before review
                  or delivery.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close template editor"
                onClick={() => setEditing(null)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                aria-label="Template name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active
              </label>
            </div>
            <div className="mt-5 space-y-3">
              {steps.map((step, index) => (
                <section
                  key={index}
                  className="rounded-2xl border bg-[#faf9fc] p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold">Step {index + 1}</h3>
                    {steps.length > 1 ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-rose-600"
                        onClick={() =>
                          setSteps((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <select
                      aria-label={`Step ${index + 1} channel`}
                      className="h-10 rounded-xl border bg-white px-3 text-sm"
                      value={step.channel}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  channel: e.target.value as Step['channel'],
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="EMAIL">Email</option>
                      <option value="WHATSAPP">WhatsApp</option>
                    </select>
                    <Input
                      aria-label={`Step ${index + 1} delay hours`}
                      type="number"
                      min="0"
                      max="8760"
                      value={step.delayHours}
                      onChange={(e) =>
                        setSteps((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, delayHours: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                    {step.channel === 'EMAIL' ? (
                      <Input
                        aria-label={`Step ${index + 1} subject`}
                        placeholder="Subject"
                        value={step.subject ?? ''}
                        onChange={(e) =>
                          setSteps((current) =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, subject: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    ) : null}
                  </div>
                  <textarea
                    aria-label={`Step ${index + 1} prompt`}
                    required
                    minLength={10}
                    value={step.prompt}
                    onChange={(e) =>
                      setSteps((current) =>
                        current.map((item, i) =>
                          i === index
                            ? { ...item, prompt: e.target.value }
                            : item,
                        ),
                      )
                    }
                    className="mt-3 min-h-24 w-full rounded-xl border bg-white p-3 text-xs outline-none focus:ring-2 focus:ring-violet-100"
                  />
                </section>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() =>
                setSteps((current) => [
                  ...current,
                  {
                    ...starter(),
                    position: current.length + 1,
                    delayHours: 72,
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Add follow-up step
            </Button>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button disabled={saving}>
                {saving ? 'Saving…' : 'Save template'}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </SectionShell>
  );
}
