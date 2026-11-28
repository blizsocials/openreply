# Blizsocials Automations: handoff for ChatGPT / Codex

Last updated 28 Nov 2026 (Claude). Read this before changing anything.

## What this is
An internal tool for Blizsocials Limited (Lagos social media agency, Creative Director: Diana Grace-Ese Ibhiabor) to run many clients' social accounts with staff logins: scheduling, unified inbox, comment-to-DM automations, client reports. Not sold to clients. Live at https://automations.blizsocials.com. Forked from OpenReply.

Approved design (follow it closely; Diana: "this is my vision"): https://claude.ai/artifact/3s37E14wNBjjbH6YEi9Yk7

## Stack and deploy
- Next.js (new major version; read node_modules/next/dist/docs before using APIs), React, Tailwind, Prisma (Postgres), BullMQ worker (Redis).
- Web: Vercel project "openreply", auto-deploys `main`. Worker: Northflank "openreply-worker", rebuilds on every push.
- Build status: https://api.github.com/repos/blizsocials/openreply/commits/main/status
- vercel-build: `prisma generate && PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 prisma migrate deploy && next build`
- Do not add npm packages casually (simple-icons broke an install). Logos are inlined in components/platform-icon.tsx.

## Code rules that have bitten us
- React lint: no setState directly in an effect body (wrap in `Promise.resolve().then`), no `Date.now()` in render (lazy `useState`), no reassigning variables during render.
- `t()` only accepts existing translation keys; new labels are plain strings.
- Any absolutely positioned element must live inside `main` (which is `relative`). The shell (`.bliz-shell`) locks the page; only `main` scrolls.
- Paid and organic numbers are never added together. Missing data shows "n/a" or "Not available", never a guess.
- Copy: warm, human, no em or en dashes. Proverbs 22:29 footer on client reports.

## Map of the app
- Shell: components/dashboard-shell.tsx, sidebar.tsx (Work and Manage groups, client switcher), top-bar.tsx (title + subtitle per route), mobile-tab-bar.tsx, nav-icons.tsx. Logo: public/bliz-app-logo.png.
- Client switcher state: lib/client-selection.ts (localStorage key bliz.client, event bliz-client-change).
- Results: app/(dashboard)/dashboard/page.tsx + components/results-overview.tsx (hero cards, reach by day, by-client table) + components/dashboard/panels.tsx (automation KPIs).
- Client reports: app/(dashboard)/reports/page.tsx. Instagram via /api/instagram/overview?since&until; Facebook via /api/facebook/report (lib/meta/facebook-inbox.ts getPageReport); YouTube via /api/youtube/report (lib/connect/youtube.ts getYoutubeReport). Other platform tabs say "switches on once approved".
- Inbox: app/(dashboard)/inbox/page.tsx (tabs all/ig/fb/igc/fbc, My clients stored in localStorage bliz.myClients, InboxThreadState for assign/priority/notes).
- Schedule: app/(dashboard)/schedule/page.tsx, components/content-calendar.tsx, components/feed-planner.tsx, lib/publishing/publish-due.ts (Instagram, Facebook, YouTube, TikTok branches).
- Automations: app/(dashboard)/campaigns/page.tsx, components/campaign-builder.tsx ("Who can get the link?" Everyone / Followers only = requireFollow), lib/queue/dm-worker.ts (follow gate with rechecks).
- Clients: app/(dashboard)/clients/page.tsx + components/client-connections.tsx (grid), connect links, /api/connect/{youtube,tiktok}/start|callback.

## Accounts and IDs (no secrets here)
- Meta app 1616808026592144, business 1154015667805799, Facebook Login config 1162878356766339. Tech Provider: done. Business verification: in review.
- Google Cloud project blizsocials-automations (blizsocials@gmail.com), YouTube scopes upload + readonly.
- TikTok app 7713069404137572359; Sandbox "Blizsocials Demo" (7713029953683769351); Vercel TIKTOK_CLIENT_KEY/SECRET currently hold the Sandbox keys. blizsocials.com verified for TikTok via DNS TXT.
- LinkedIn app 265176165 (Community Management API requested). Pinterest app 1645741 (trial pending).
- DNS: WhoGoHost zone z-83860 for blizsocials.com.
- Legal: BLIZSOCIALS LIMITED, RC 8256259, 6 Ayodele Amusa Street, Pipeline Bus Stop, Idimu Egbeda, Lagos State.

## Things only Diana does
Typing passwords or secret keys, accepting terms, card details, final submit/delete clicks on platform consoles, approving OAuth on her accounts.

## Next tasks, in priority order
See "Priority plan" in the Claude project doc claude/blizsocials-automations-next-steps.md (copied below for convenience).
1. TikTok demo video (Sandbox): connect the Blizsocials TikTok in the tool, post a private test, record the flow, upload to the TikTok review form, submit.
2. Daily snapshot job: store each client's followers, reach, engagement per day (new Prisma model) so month-to-month comparisons work beyond Instagram's 30-day limit.
3. Hosting decision: Oracle Always Free (retry with tips) or a $5 to $7 server from January; nightly pg_dump backups to two places; UptimeRobot.
4. Meta App Review submission as soon as business verification clears (permissions: pages_read_engagement, read_insights for post reach, instagram_manage_messages, etc.).
5. YouTube comments tab in Inbox (read now; reply needs youtube.force-ssl scope added to Google verification).
6. Speed: Results hero loads every client's posts; consider a server-side cache table filled by the snapshot job.
7. Then TikTok, LinkedIn, Pinterest, Google Business reports and inbox tabs as approvals arrive.
