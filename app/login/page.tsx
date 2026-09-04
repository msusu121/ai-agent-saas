'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, Bot, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUrl } from '@/lib/api';

type LoginResponse = { accessToken: string; user: { id: string; email: string; name: string } };
type OrganizationsResponse = { organizations: Array<{ id: string; name: string; slug: string; role: string }> };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('hasan@akilimatic.demo');
  const [password, setPassword] = useState('DemoPass!2026');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loginResponse = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const loginBody = (await loginResponse.json()) as LoginResponse | { message?: string };
      if (!loginResponse.ok || !('accessToken' in loginBody)) {
        throw new Error('message' in loginBody && loginBody.message ? loginBody.message : 'Unable to sign in');
      }
      const organizationsResponse = await fetch(apiUrl('/organizations'), {
        credentials: 'include',
        headers: { authorization: `Bearer ${loginBody.accessToken}` },
      });
      const organizationsBody = (await organizationsResponse.json()) as OrganizationsResponse;
      if (!organizationsResponse.ok || !organizationsBody.organizations.length) {
        throw new Error('No organization workspace is available for this account');
      }
      const organization = organizationsBody.organizations.find((item) => item.slug === 'akilimatic-demo') ?? organizationsBody.organizations[0];
      sessionStorage.setItem('salesAgentAccessToken', loginBody.accessToken);
      sessionStorage.setItem('salesAgentOrganizationId', organization.id);
      sessionStorage.setItem('salesAgentOrganizationName', organization.name);
      sessionStorage.setItem('salesAgentUserName', loginBody.user.name);
      router.push('/leads');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-[#f8f8fc] text-[#17162b] lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#211457_0%,#3a1f91_52%,#6d35ec_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 top-20 size-96 rounded-full bg-fuchsia-400/15 blur-3xl" />
        <div className="absolute -bottom-24 left-10 size-80 rounded-full bg-indigo-300/15 blur-3xl" />
        <div className="relative flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10"><Sparkles className="size-5" /></span><div><p className="font-extrabold">Sales Agent</p><p className="text-xs text-violet-200">AI opportunity finder</p></div></div>
        <div className="relative max-w-xl"><span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold"><Bot className="size-4" /> Multi-tenant AI sales workspace</span><h1 className="text-5xl font-extrabold leading-[1.08] tracking-[-0.045em]">Tell the agent what you sell. It finds who needs it.</h1><p className="mt-5 max-w-lg text-base leading-7 text-violet-100/80">Securely research opportunities, qualify real need signals, and manage respectful outreach from one organization-scoped workspace.</p></div>
        <div className="relative flex items-center gap-3 text-xs text-violet-100/75"><ShieldCheck className="size-5" /><span>Encrypted provider keys · tenant isolation · auditable outreach</span></div>
      </section>
      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white"><Sparkles className="size-5" /></span><div><p className="font-extrabold">Sales Agent</p><p className="text-xs text-violet-600">AI opportunity finder</p></div></div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-600">Welcome back</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">Sign in to your workspace</h2><p className="mt-2 text-sm leading-6 text-[#747083]">Use the prepared demo account to inspect Akilimatic and the second isolated organization.</p>
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block"><span className="mb-2 block text-xs font-bold">Email address</span><span className="relative block"><Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#918da1]" /><Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="h-12 rounded-xl bg-white pl-10 shadow-sm" /></span></label>
            <label className="block"><span className="mb-2 block text-xs font-bold">Password</span><span className="relative block"><LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#918da1]" /><Input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="h-12 rounded-xl bg-white px-10 shadow-sm" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#777386] hover:bg-violet-50 hover:text-violet-700">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>
            {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">{error}</p> : null}
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-violet-600 font-bold text-white shadow-[0_12px_28px_rgb(109_40_217/24%)] hover:bg-violet-700">{loading ? 'Opening workspace…' : 'Sign in securely'} {!loading ? <ArrowRight className="size-4" /> : null}</Button>
          </form>
          <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/70 p-4 text-xs text-violet-950/70"><strong className="text-violet-900">Demo access is prefilled.</strong> The login calls the real Express API, loads your organizations, and selects the Akilimatic tenant before opening Leads.</div>
        </div>
      </section>
    </main>
  );
}
