export function envOptional(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  return value;
}

export function env(name: string): string {
  const value = envOptional(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function dashboardPasswordHash(): string {
  const encoded = envOptional("DASHBOARD_PASSWORD_HASH_B64");
  if (encoded) return Buffer.from(encoded, "base64").toString("utf8");
  return envOptional("DASHBOARD_PASSWORD_HASH") ?? "";
}
