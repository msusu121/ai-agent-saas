'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  KeyRound,
  LockKeyhole,
  Plug,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SectionShell } from '@/components/section-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';

type Credential = {
  id: string;
  provider: string;
  label: string;
  lastFour: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  configuration: Record<string, unknown> | null;
};
type CurrentOrganization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  memberships: Array<{
    role: string;
    user: { id: string; name: string; email: string; isActive: boolean };
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    resourceType: string;
    createdAt: string;
    user: { name: string; email: string } | null;
  }>;
};
const aiProviders = ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'GROQ', 'OPENROUTER'];
const configurableModelProviders = ['OPENAI', 'OPENROUTER'];
const sourceProviders = [
  'GOOGLE_PLACES',
  'GOOGLE_CUSTOM_SEARCH',
  'SERPER',
  'BRAVE_SEARCH',
  'APOLLO',
  'HUNTER',
  'CLEARBIT',
  'META',
];
const channelProviders = ['WHATSAPP', 'RESEND', 'SENDGRID'];
const settingsNav: Array<{ icon: LucideIcon; label: string; id: string }> = [
  { icon: Bot, label: 'AI providers', id: 'providers' },
  { icon: Plug, label: 'Data sources', id: 'sources' },
  { icon: KeyRound, label: 'Email & channels', id: 'channels' },
  { icon: Users, label: 'Team members', id: 'team' },
  { icon: ShieldCheck, label: 'Security & audit', id: 'security' },
];
const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function SettingsPage() {
  const [active, setActive] = useState('providers');
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [organization, setOrganization] = useState<CurrentOrganization | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState('OPENAI');
  const [label, setLabel] = useState('Production key');
  const [secret, setSecret] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('Sales Agent');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [graphApiVersion, setGraphApiVersion] = useState('v21.0');
  const [searchEngineId, setSearchEngineId] = useState('');
  const [model, setModel] = useState('');
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({});
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [credentialBody, organizationBody] = await Promise.all([
        apiRequest<{ credentials: Credential[] }>('/credentials'),
        apiRequest<{ organization: CurrentOrganization }>(
          '/organizations/current',
        ),
      ]);
      setCredentials(credentialBody.credentials);
      setModelDrafts(
        Object.fromEntries(
          credentialBody.credentials.map((item) => [
            item.id,
            typeof item.configuration?.model === 'string'
              ? item.configuration.model
              : '',
          ]),
        ),
      );
      setOrganization(organizationBody.organization);
      setError('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load settings',
      );
    }
  }, []);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && settingsNav.some((item) => item.id === requested))
      setActive(requested);
    void load();
  }, [load]);

  async function createCredential(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const configuration = ['RESEND', 'SENDGRID'].includes(provider)
        ? { fromEmail, fromName }
        : provider === 'WHATSAPP'
          ? { phoneNumberId, businessAccountId, apiVersion: graphApiVersion }
          : provider === 'GOOGLE_CUSTOM_SEARCH'
            ? { searchEngineId }
            : configurableModelProviders.includes(provider)
              ? { model: model.trim() }
              : undefined;
      await apiRequest('/credentials', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          label,
          secret,
          ...(configuration ? { configuration } : {}),
        }),
      });
      setSecret('');
      setModel('');
      setShowForm(false);
      setNotice('Credential encrypted and saved');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save credential',
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveCredentialModel(item: Credential) {
    const nextModel = modelDrafts[item.id]?.trim();
    if (!nextModel) {
      setError('Enter the exact provider model ID before saving.');
      return;
    }
    setSavingModelId(item.id);
    setError('');
    try {
      await apiRequest(`/credentials/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          configuration: { ...(item.configuration ?? {}), model: nextModel },
        }),
      });
      setNotice(`${humanize(item.provider)} model saved as ${nextModel}`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to save AI model',
      );
    } finally {
      setSavingModelId(null);
    }
  }
  async function toggleCredential(item: Credential) {
    try {
      await apiRequest(`/credentials/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      setNotice(`${item.label} ${item.isActive ? 'disabled' : 'enabled'}`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update credential',
      );
    }
  }
  async function deleteCredential(item: Credential) {
    try {
      await apiRequest(`/credentials/${item.id}`, { method: 'DELETE' });
      setNotice(`${item.label} deleted`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to delete credential',
      );
    }
  }

  const visibleCredentials = useMemo(
    () =>
      active === 'sources'
        ? credentials.filter((item) => sourceProviders.includes(item.provider))
        : active === 'channels'
          ? credentials.filter((item) =>
              channelProviders.includes(item.provider),
            )
          : credentials.filter((item) => aiProviders.includes(item.provider)),
    [active, credentials],
  );
  const availableProviders =
    active === 'sources'
      ? sourceProviders
      : active === 'channels'
        ? channelProviders
        : aiProviders;
  const connectionTitle =
    active === 'sources'
      ? 'Connected data sources'
      : active === 'channels'
        ? 'Connected delivery channels'
        : 'AI & provider connections';

  return (
    <SectionShell
      active="/settings"
      eyebrow="Organization controls"
      title="Settings & integrations"
      description="Manage real tenant members, encrypted credentials, channels, and audit activity."
    >
      {notice ? (
        <div
          role="status"
          className="mb-4 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
        >
          {notice}
          <button
            aria-label="Dismiss settings notice"
            onClick={() => setNotice('')}
          >
            <X className="size-4" />
          </button>
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
      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[22px] border border-[#e9e7f0] bg-white p-2">
          {settingsNav.map(({ icon: Icon, label: navLabel, id }) => (
            <button
              key={id}
              onClick={() => {
                setActive(id);
                setShowForm(false);
              }}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[12px] font-semibold ${active === id ? 'bg-violet-50 text-violet-700' : 'text-[#666276] hover:bg-[#faf9fc]'}`}
            >
              <Icon className="size-4" />
              {navLabel}
            </button>
          ))}
        </aside>
        <div className="space-y-5">
          {['providers', 'sources', 'channels'].includes(active) ? (
            <section className="rounded-[24px] border border-[#e9e7f0] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-bold">{connectionTitle}</h2>
                  <p className="mt-1 text-[11px] text-[#817d90]">
                    Encrypted per organization. Keys are decrypted only inside
                    the backend worker that uses them.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setShowForm((value) => !value);
                    if (!showForm) setProvider(availableProviders[0]);
                  }}
                  className="h-10 rounded-xl"
                >
                  <KeyRound className="size-4" />{' '}
                  {showForm ? 'Close form' : 'Add credential'}
                </Button>
              </div>
              {showForm ? (
                <form
                  onSubmit={createCredential}
                  className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      aria-label="Credential provider"
                      className="h-10 rounded-xl border border-input bg-white px-3 text-sm"
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value);
                        setModel('');
                      }}
                    >
                      {availableProviders.map((item) => (
                        <option key={item} value={item}>
                          {humanize(item)}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="Credential label"
                      required
                      minLength={2}
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                    <Input
                      aria-label="Secret API key"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      type="password"
                      placeholder="Secret API key"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                    {configurableModelProviders.includes(provider) ? (
                      <Input
                        aria-label={`${humanize(provider)} model ID`}
                        required
                        placeholder={
                          provider === 'OPENROUTER'
                            ? 'Provider/model ID from OpenRouter'
                            : 'OpenAI model ID'
                        }
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                      />
                    ) : null}
                    {['RESEND', 'SENDGRID'].includes(provider) ? (
                      <>
                        <Input
                          aria-label="Sender email"
                          required
                          type="email"
                          placeholder="sales@example.com"
                          value={fromEmail}
                          onChange={(e) => setFromEmail(e.target.value)}
                        />
                        <Input
                          aria-label="Sender name"
                          required
                          placeholder="Sales Agent"
                          value={fromName}
                          onChange={(e) => setFromName(e.target.value)}
                        />
                      </>
                    ) : null}
                    {provider === 'WHATSAPP' ? (
                      <>
                        <Input
                          aria-label="WhatsApp Business Account ID"
                          autoComplete="off"
                          required
                          placeholder="WhatsApp Business Account (WABA) ID"
                          value={businessAccountId}
                          onChange={(e) => setBusinessAccountId(e.target.value)}
                        />
                        <Input
                          aria-label="WhatsApp phone number ID"
                          autoComplete="off"
                          required
                          placeholder="Meta Phone Number ID"
                          value={phoneNumberId}
                          onChange={(e) => setPhoneNumberId(e.target.value)}
                        />
                        <Input
                          aria-label="Meta Graph API version"
                          autoComplete="off"
                          required
                          pattern="v[0-9]+\\.[0-9]+"
                          placeholder="v21.0"
                          value={graphApiVersion}
                          onChange={(e) => setGraphApiVersion(e.target.value)}
                        />
                        <p className="sm:col-span-3 rounded-xl border border-violet-100 bg-white px-3 py-2 text-[10px] leading-5 text-[#666276]">
                          Use a permanent Meta system-user access token as the secret. The WABA ID manages and submits message templates; the Phone Number ID sends messages. Cold or out-of-window outreach must use a Meta-approved template—not a free-form sequence prompt.
                        </p>
                      </>
                    ) : null}
                    {provider === 'GOOGLE_CUSTOM_SEARCH' ? (
                      <Input
                        aria-label="Google Search Engine ID"
                        required
                        placeholder="Programmable Search Engine ID (cx)"
                        value={searchEngineId}
                        onChange={(e) => setSearchEngineId(e.target.value)}
                      />
                    ) : null}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving}>
                      <LockKeyhole className="size-4" />
                      {saving ? 'Encrypting…' : 'Encrypt & save'}
                    </Button>
                  </div>
                </form>
              ) : null}
              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {visibleCredentials.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-[#ebe9f0] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5f3fb] text-xs font-extrabold text-violet-700">
                        {item.provider.slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[12px] font-bold">
                            {item.label}
                          </h3>
                          <Badge
                            className={
                              item.isActive
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }
                          >
                            {item.isActive ? (
                              <Check className="size-3" />
                            ) : null}
                            {item.isActive ? 'Connected' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[10px] text-[#817d90]">
                          {humanize(item.provider)} · key ending {item.lastFour}
                        </p>
                        <p className="mt-2 text-[9px] text-[#9994a4]">
                          Updated{' '}
                          {new Date(item.updatedAt).toLocaleDateString()}
                        </p>
                        {configurableModelProviders.includes(item.provider) ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <Input
                              aria-label={`${humanize(item.provider)} model for ${item.label}`}
                              placeholder={
                                item.provider === 'OPENROUTER'
                                  ? 'Provider/model ID from OpenRouter'
                                  : 'OpenAI model ID'
                              }
                              value={modelDrafts[item.id] ?? ''}
                              onChange={(event) =>
                                setModelDrafts((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              className="h-9 flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              disabled={savingModelId === item.id}
                              onClick={() => void saveCredentialModel(item)}
                              className="h-9"
                            >
                              {savingModelId === item.id
                                ? 'Saving…'
                                : 'Save model'}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          aria-label={`${item.isActive ? 'Disable' : 'Enable'} ${item.label}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => void toggleCredential(item)}
                        >
                          {item.isActive ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          aria-label={`Delete ${item.label}`}
                          size="icon-sm"
                          variant="ghost"
                          className="text-rose-600"
                          onClick={() => void deleteCredential(item)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
                {!visibleCredentials.length ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-[#817d90]">
                    No credentials in this category yet.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
          {active === 'team' ? (
            <section className="rounded-[24px] border border-[#e9e7f0] bg-white p-5 sm:p-6">
              <h2 className="text-[16px] font-bold">
                {organization?.name ?? 'Organization'} team
              </h2>
              <p className="mt-1 text-[11px] text-[#817d90]">
                Live memberships for this tenant.
              </p>
              <div className="mt-5 divide-y">
                {organization?.memberships.map((membership) => (
                  <article
                    key={membership.user.id}
                    className="flex items-center gap-3 py-4"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-violet-50 text-xs font-bold text-violet-700">
                      {membership.user.name
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold">
                        {membership.user.name}
                      </p>
                      <p className="text-xs text-[#817d90]">
                        {membership.user.email}
                      </p>
                    </div>
                    <Badge>{humanize(membership.role)}</Badge>
                    <Badge
                      className={
                        membership.user.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100'
                      }
                    >
                      {membership.user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {active === 'security' ? (
            <section className="rounded-[24px] border border-[#e9e7f0] bg-white p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h2 className="text-[16px] font-bold">Security & audit</h2>
                  <p className="text-[11px] text-[#817d90]">
                    AES-256-GCM credentials and live audit records.
                  </p>
                </div>
              </div>
              <div className="mt-5 divide-y">
                {organization?.auditLogs.map((log) => (
                  <article
                    key={log.id}
                    className="flex flex-wrap items-center gap-3 py-3 text-xs"
                  >
                    <Badge variant="outline">{humanize(log.action)}</Badge>
                    <strong>{log.resourceType}</strong>
                    <span className="text-[#817d90]">
                      {log.user?.name ?? 'System'}
                    </span>
                    <time className="ml-auto text-[#817d90]">
                      {new Date(log.createdAt).toLocaleString()}
                    </time>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </SectionShell>
  );
}
