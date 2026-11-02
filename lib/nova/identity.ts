/** An operation/account binding, not a credential. The session cookie still authorizes every request. */
export async function novaIdentityTag(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || /[\u0000-\u0020\u007f]/u.test(normalized)) throw new TypeError("Invalid Nova identity.");
  const bytes = new TextEncoder().encode(`nova-identity:v1:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
