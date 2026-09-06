'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

export const sourceLabels: Record<string, string> = {
  GOOGLE_PLACES: 'Google Places', INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', WEB: 'Web search',
};
export const defaultSources = ['GOOGLE_PLACES', 'WEB', 'INSTAGRAM', 'FACEBOOK'];

export function DiscoverySources({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const [sources, setSources] = useState<Array<{ source: string; ready: boolean }>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest<{ sources: Array<{ source: string; ready: boolean }> }>('/campaigns/sources')
      .then((body) => setSources(body.sources))
      .catch(() => setError('Source availability could not be checked.'));
  }, []);
  return <fieldset className="mt-4 rounded-xl border border-violet-100 bg-violet-50/30 p-3">
    <legend className="px-1 text-xs font-bold">Find businesses on</legend>
    <div className="flex flex-wrap gap-3">
      {Object.entries(sourceLabels).map(([source, label]) => {
        const state = sources.find((item) => item.source === source);
        return <label key={source} className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={value.includes(source)}
            disabled={value.length === 1 && value.includes(source)}
            onChange={(event) => onChange(event.target.checked ? [...value, source] : value.filter((item) => item !== source))}
            className="accent-violet-600" />
          {label}<span className={state?.ready ? 'text-emerald-700' : 'text-amber-700'}>{state ? state.ready ? 'Configured' : 'Setup needed' : 'Checking…'}</span>
        </label>;
      })}
    </div>
    <p className="mt-2 text-[11px] text-[#716c82]">Instagram and Facebook use Apify keyword discovery. Runs consume Apify credits, capped at $2 per platform per campaign search. Sources without credentials are skipped. <Link href="/settings?tab=sources" className="font-semibold text-violet-700 underline">Set up sources</Link></p>
    {error ? <p role="status" className="mt-2 text-xs text-amber-700">{error}</p> : null}
  </fieldset>;
}

export type DiscoveryReport = { sources: Array<{ source: string; status: string; found: number; message?: string }>; discovered?: number; coverage?: string };
export function DiscoveryStatus({ report }: { report?: DiscoveryReport | null }) {
  if (!report?.sources.length) return null;
  return <div className="mt-2 space-y-1 text-[11px]" role="status">
    {report.sources.map((item) => <p key={item.source} className={['unavailable', 'failed', 'partial'].includes(item.status) ? 'text-amber-700' : 'text-[#716c82]'}>
      {sourceLabels[item.source] ?? item.source}: {item.status} · {item.found} results{item.message ? ` · ${item.message}` : ''}
    </p>)}
    {report.coverage ? <p className="text-[#817d90]">{report.coverage}</p> : null}
  </div>;
}
