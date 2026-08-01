import type { Paginated } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(formatApiError(status, body));
    this.status = status;
    this.body = body;
  }
}

function formatApiError(status: number, body: unknown): string {
  if (!body || typeof body !== "object") return `API ${status}`;
  const obj = body as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  if (Array.isArray(obj.detail)) return obj.detail.map(String).join(", ");
  const fieldErrors = Object.entries(obj)
    .map(([key, val]) => {
      if (Array.isArray(val)) return `${key}: ${val.join(", ")}`;
      if (typeof val === "string") return `${key}: ${val}`;
      return null;
    })
    .filter(Boolean);
  if (fieldErrors.length) return fieldErrors.join(" · ");
  return `API ${status}`;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pipelinehq_access");
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem("pipelinehq_access", access);
  if (refresh) localStorage.setItem("pipelinehq_refresh", refresh);
}

export function clearTokens() {
  localStorage.removeItem("pipelinehq_access");
  localStorage.removeItem("pipelinehq_refresh");
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type") && !(rest.body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export async function apiList<T>(path: string): Promise<T[]> {
  const data = await api<Paginated<T> | T[]>(path);
  if (Array.isArray(data)) return data;
  return data.results;
}

export { API_URL };
