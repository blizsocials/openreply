import { NextResponse } from "next/server";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { getBaseUrl } from "@/lib/env";
import { createOAuthState } from "@/lib/meta/oauth";
import { getFacebookAuthorizationUrl } from "@/lib/meta/facebook-login";

// Start "Continue with Facebook": one login that brings in every client
// Instagram account linked to a Page the user manages in Business Manager.
export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) return NextResponse.redirect(`${getBaseUrl()}/login`);
  if (!canManageWorkspace(context.role)) {
    return NextResponse.redirect(`${getBaseUrl()}/settings?instagram=forbidden`);
  }
  const missing = ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return NextResponse.redirect(
      `${getBaseUrl()}/settings?instagram=misconfigured&missing=${encodeURIComponent(missing.join(","))}`
    );
  }
  const redirectUri = `${getBaseUrl()}/api/facebook/callback`;
  const state = createOAuthState(context.workspaceId);
  return NextResponse.redirect(getFacebookAuthorizationUrl(redirectUri, state));
}
