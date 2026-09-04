'use client';

const apiOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN ?? '').replace(/\/$/, '');

export function apiUrl(path: string) {
  return `${apiOrigin}/api/v1${path}`;
}

export function sessionHeaders(json = false): HeadersInit {
  const token = sessionStorage.getItem('salesAgentAccessToken');
  const organizationId = sessionStorage.getItem('salesAgentOrganizationId');
  return {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(organizationId ? { 'x-organization-id': organizationId } : {}),
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: { ...sessionHeaders(Boolean(init.body)), ...(init.headers ?? {}) },
  });
  if (response.status === 401) {
    const refreshed = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
    });
    if (refreshed.ok) {
      const body = (await refreshed.json()) as { accessToken: string };
      sessionStorage.setItem('salesAgentAccessToken', body.accessToken);
      response = await fetch(apiUrl(path), {
        ...init,
        credentials: 'include',
        headers: {
          ...sessionHeaders(Boolean(init.body)),
          ...(init.headers ?? {}),
        },
      });
    } else {
      sessionStorage.removeItem('salesAgentAccessToken');
      window.location.href = '/login';
      throw new Error('Your session expired');
    }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.message ??
        body?.error?.message ??
        `Request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function organizationName() {
  return sessionStorage.getItem('salesAgentOrganizationName') ?? 'Organization';
}
