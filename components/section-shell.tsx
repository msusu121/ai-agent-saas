'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Bell,
  Bot,
  ChevronDown,
  Compass,
  FileText,
  FlaskConical,
  LayoutDashboard,
  MessageCircleMore,
  PlugZap,
  SearchCheck,
  Send,
  Sparkle,
  Settings2,
  Sparkles,
  BarChart3,
  Users,
  Workflow,
  Package,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api';

const routes = [
  { label: 'Social Media', icon: Sparkles, href: '/social' },
  { label: 'Home', icon: LayoutDashboard, href: '/' },
  { label: 'Scout Agent', icon: Compass, href: '/opportunities' },
  {
    label: 'Research Agent',
    icon: FlaskConical,
    href: '/opportunities?mode=research',
  },
  {
    label: 'Qualification Agent',
    icon: SearchCheck,
    href: '/leads?mode=qualification',
  },
  { label: 'Outreach Agent', icon: Send, href: '/autopilot' },
  {
    label: 'Follow-up Agent',
    icon: MessageCircleMore,
    href: '/messages?filter=followup',
  },
  { label: 'Leads', icon: Users, href: '/leads' },
  { label: 'Products', icon: Package, href: '/products' },
  { label: 'Content', icon: FileText, href: '/content' },
  { label: 'Calendar', icon: Workflow, href: '/calendar' },
  { label: 'Campaigns', icon: Send, href: '/campaigns' },
  { label: 'Pipeline', icon: Workflow, href: '/pipeline' },
  { label: 'Templates', icon: FileText, href: '/templates' },
  { label: 'Reports', icon: BarChart3, href: '/analytics' },
  { label: 'Integrations', icon: PlugZap, href: '/settings?tab=sources' },
  { label: 'Settings', icon: Settings2, href: '/settings' },
];

const mobileRoutes = [
  { label: 'Home', icon: LayoutDashboard, href: '/' },
  { label: 'Leads', icon: Users, href: '/leads' },
  { label: 'Agent', icon: Sparkle, href: '/content' },
  { label: 'Messages', icon: MessageCircleMore, href: '/messages' },
  { label: 'More', icon: Settings2, href: '/more' },
];

export function SectionShell({
  active,
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  active: string;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [organizationName, setOrganizationName] = useState('Organization');
  const [organizations, setOrganizations] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [showOrganizations, setShowOrganizations] = useState(false);
  const [currentHref, setCurrentHref] = useState(active);
  useEffect(() => {
    setCurrentHref(`${window.location.pathname}${window.location.search}`);
    setOrganizationName(
      sessionStorage.getItem('salesAgentOrganizationName') ?? 'Organization',
    );
    if (!sessionStorage.getItem('salesAgentAccessToken')) return;
    apiRequest<{ organizations: Array<{ id: string; name: string }> }>(
      '/organizations',
    )
      .then((body) => setOrganizations(body.organizations))
      .catch(() => setOrganizations([]));
  }, []);
  function chooseOrganization(organization: { id: string; name: string }) {
    sessionStorage.setItem('salesAgentOrganizationId', organization.id);
    sessionStorage.setItem('salesAgentOrganizationName', organization.name);
    setOrganizationName(organization.name);
    setShowOrganizations(false);
    window.location.reload();
  }
  return (
    <main className="min-h-dvh bg-[#f8f8fc] text-[#17162b]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col overflow-y-auto border-r border-[#e9e8f1] bg-white px-3 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-[14px] bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_10px_24px_rgb(99_56_241/24%)]">
            <Sparkles className="size-5" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold tracking-[0.02em]">
              AKILIMATIC
            </span>
            <span className="block text-[10px] font-semibold tracking-[0.12em] text-violet-600">
              AI AGENT
            </span>
          </span>
        </Link>
        <button
          aria-label="Switch organization"
          onClick={() => setShowOrganizations((value) => !value)}
          className="mt-7 flex w-full items-center gap-3 rounded-2xl border border-[#e8e6f1] bg-[#faf9ff] p-3 text-left"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-[#17162b] text-xs font-bold text-white">
            AK
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {organizationName}
            </span>
            <span className="block text-[11px] text-[#747186]">
              Organization workspace
            </span>
          </span>
          <ChevronDown className="size-4 text-[#747186]" />
        </button>
        {showOrganizations ? (
          <div className="mt-2 rounded-xl border bg-white p-1 shadow-lg">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                onClick={() => chooseOrganization(organization)}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-violet-50"
              >
                {organization.name}
              </button>
            ))}
          </div>
        ) : null}
        <nav aria-label="Main navigation" className="mt-6 space-y-0.5">
          {routes.map((route) => (
            <Link
              key={`${route.label}-${route.href}`}
              href={route.href}
              className={`flex h-9 items-center gap-3 rounded-xl px-3 text-[12px] font-semibold transition ${currentHref === route.href || (route.href === active && !currentHref.includes('?')) ? 'bg-violet-50 text-violet-700' : 'text-[#656276] hover:bg-[#f7f6fb] hover:text-[#252238]'}`}
            >
              <route.icon className="size-[18px]" strokeWidth={1.9} />
              <span className="flex-1">{route.label}</span>
            </Link>
          ))}
        </nav>
        <Link
          href="/autopilot"
          className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm">
              <Bot className="size-[19px]" />
            </span>
            <div>
              <p className="text-xs font-bold">Agent Status</p>
              <p className="mt-0.5 text-[11px] font-semibold text-emerald-700">
                All systems running
              </p>
            </div>
          </div>
        </Link>
      </aside>

      <section className="min-h-dvh pb-24 lg:ml-[232px] lg:pb-10">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[#ebeaf1]/90 bg-white/85 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-violet-600 text-white">
              <Sparkles className="size-[18px]" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-600">
                Akilimatic AI Agent
              </p>
              <p className="text-sm font-bold">{organizationName}</p>
            </div>
          </div>
          <p className="hidden text-sm font-semibold lg:block">{title}</p>
          <div className="flex items-center gap-2">
            <Link
              aria-label="Open audit notifications"
              href="/settings?tab=security"
              className="relative grid size-10 place-items-center rounded-xl hover:bg-[#f4f3f8]"
            >
              <Bell className="size-[18px]" />
            </Link>
            <Link
              aria-label="Open team settings"
              href="/settings?tab=team"
              className="grid size-8 place-items-center rounded-[11px] bg-[#221f37] text-[11px] font-bold text-white"
            >
              HM
            </Link>
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-7 lg:px-6 lg:py-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-600">
                {eyebrow}
              </p>
              <h1 className="text-[25px] font-extrabold tracking-[-0.035em] sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-[#706c7e] sm:text-sm">
                {description}
              </p>
            </div>
            {action}
          </div>
          {children}
        </div>
      </section>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e7e5ee] bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgb(31_26_55/7%)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {mobileRoutes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${active === route.href ? 'text-violet-700' : 'text-[#777386]'}`}
            >
              <route.icon className="size-[19px]" />
              <span>{route.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </main>
  );
}
