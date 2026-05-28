export type VerifySessionPayload = {
  accessToken: string;
  expiresAt: string | null;
  profileDrawingsUrl: string | null;
};

export function parseVerifyResponse(json: unknown): VerifySessionPayload | null {
  if (!json || typeof json !== "object") {
    return null;
  }
  const o = json as Record<string, unknown>;
  const access_token = o.access_token;
  const expires_at = o.expires_at;
  if (typeof access_token !== "string") {
    return null;
  }
  let profileDrawingsUrl: string | null = null;
  const userObj = o.user;
  if (userObj && typeof userObj === "object") {
    const u = userObj as Record<string, unknown>;
    if (typeof u.profile_drawings_url === "string" && u.profile_drawings_url.length > 0) {
      profileDrawingsUrl = u.profile_drawings_url;
    }
  }
  return {
    accessToken: access_token,
    expiresAt:
      typeof expires_at === "string" || expires_at === null
        ? (expires_at as string | null)
        : null,
    profileDrawingsUrl,
  };
}
