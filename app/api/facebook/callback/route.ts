import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { canConnectInstagramAccount } from "@/lib/instagram-accounts";
import { encryptToken, verifyOAuthState } from "@/lib/meta/oauth";
import {
  encodeFacebookLoginToken,
  exchangeFacebookCode,
  getLongLivedFacebookUserToken,
  listManagedInstagramAccounts,
} from "@/lib/meta/facebook-login";
import { subscribeInstagramAccountToWebhooks } from "@/lib/meta/client";
import { canManageWorkspace } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl();
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = verifyOAuthState(request.nextUrl.searchParams.get("state"));

  if (error) return NextResponse.redirect(`${baseUrl}/settings?instagram=denied`);
  if (!code || !state) return NextResponse.redirect(`${baseUrl}/settings?instagram=invalid`);

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(`${baseUrl}/login`);

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: state.workspaceId, userId: session.user.id },
  });
  if (!membership || !canManageWorkspace(membership.role)) {
    return NextResponse.redirect(`${baseUrl}/settings?instagram=forbidden`);
  }

  try {
    const redirectUri = `${baseUrl}/api/facebook/callback`;
    const shortToken = await exchangeFacebookCode(code, redirectUri);
    const userToken = await getLongLivedFacebookUserToken(shortToken);
    const pages = await listManagedInstagramAccounts(userToken);

    let connected = 0;
    let skipped = 0;
    const withoutInstagram = pages.filter((p) => !p.instagramId).length;

    for (const page of pages) {
      if (!page.instagramId) continue;
      const instagramId = page.instagramId;
      const allowed = await canConnectInstagramAccount({ workspaceId: state.workspaceId, instagramId });
      if (!allowed.allowed) {
        skipped++;
        continue;
      }
      const composite = encodeFacebookLoginToken({ ig: instagramId, page: page.pageId, t: page.pageToken });

      let webhookSubscribed = false;
      try {
        const sub = await subscribeInstagramAccountToWebhooks(instagramId, composite);
        webhookSubscribed = Boolean(sub.success);
      } catch (subscriptionError) {
        console.warn("[Facebook Callback] Page subscription failed:", page.pageName, subscriptionError);
      }

      const data = {
        username: page.username ?? page.pageName,
        name: page.name ?? page.pageName,
        accessToken: encryptToken(composite),
        // Page tokens from a long-lived user token do not expire, so the
        // Instagram token refresh cron must leave these accounts alone.
        tokenExpiresAt: null,
        webhookSubscribed,
      };
      const existing = await prisma.instagramAccount.findUnique({ where: { instagramId } });
      if (existing) {
        await prisma.instagramAccount.update({ where: { id: existing.id }, data });
      } else {
        await prisma.instagramAccount.create({
          data: { ...data, workspaceId: state.workspaceId, instagramId, provider: "META" },
        });
      }
      connected++;
    }

    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "INFO",
          workspaceId: state.workspaceId,
          message: `Facebook connect: ${connected} Instagram accounts connected, ${withoutInstagram} Pages without Instagram, ${skipped} in another workspace`,
          payload: { pages: pages.map((p) => ({ page: p.pageName, instagram: p.username })) },
        },
      })
      .catch(() => {});

    return NextResponse.redirect(
      `${baseUrl}/dashboard?connected=${connected}&noInstagram=${withoutInstagram}&skipped=${skipped}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Facebook Callback] Error:", err);
    await prisma.operationalEvent
      .create({
        data: {
          source: "SYSTEM",
          level: "ERROR",
          workspaceId: state.workspaceId,
          message: "Facebook connection failed",
          payload: { reason: message },
        },
      })
      .catch(() => {});
    return NextResponse.redirect(
      `${baseUrl}/settings?instagram=failed&reason=${encodeURIComponent(message.slice(0, 200))}`
    );
  }
}
