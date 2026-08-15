"use client";

import { getSupabaseBrowserClient } from "@/app/lib/supabase/browser";

export async function supabaseBrowserFetch<T = unknown>(
  table: string,
  query = "",
  options: RequestInit = {},
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw new Error("Tu sesión no está activa. Inicia sesión nuevamente.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Faltan las credenciales públicas de Supabase.");
  }

  const response = await fetch(
    `${url}/rest/v1/${table}${query}`,
    {
      ...options,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase error ${response.status}.`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}
