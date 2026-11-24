/** Human-readable role for selects and labels (API values stay lowercase). */
export function formatRoleLabel(role: string): string {
  const r = role.trim();
  if (!r) return role;
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
}
