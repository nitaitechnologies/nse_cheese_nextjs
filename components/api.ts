export async function endSession(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  window.location.assign("/login");
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}
