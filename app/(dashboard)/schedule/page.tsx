"use client";
import FeedPlanner from "@/components/feed-planner";
import ContentCalendar from "@/components/content-calendar";
import { PlatformIcon, PLATFORM_ORDER, PLATFORMS } from "@/components/platform-icon";

/**
 * Blizsocials: schedule Instagram posts for any connected client account.
 * Images are resized to JPEG in the browser, uploaded, and published by the
 * worker at the chosen time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { onClientChange, readClient, writeClient } from "@/lib/client-selection";

type Account = { id: string; username: string; name?: string | null };
type Upload = { id: string; url: string; preview: string };
type Post = {
  id: string;
  instagramAccountId: string;
  caption: string;
  mediaAssetIds: string[];
  mediaKind?: string;
  scheduledAt: string;
  platforms?: string[];
  socialConnectionIds?: string[];
  facebookPostId?: string | null;
  coverAssetId?: string | null;
  status: string;
  permalink: string | null;
  errorMessage: string | null;
};

const BLACK = "#0E0E0E";
const YELLOW = "#FFD701";

const SIZES = [
  { id: "portrait", label: "Portrait 4:5 (1080×1350), best for feed", w: 1080, h: 1350 },
  { id: "square", label: "Square 1:1 (1080×1080)", w: 1080, h: 1080 },
  { id: "landscape", label: "Landscape 1.91:1 (1080×566)", w: 1080, h: 566 },
  { id: "story", label: "Story 9:16 (1080×1920), Facebook only", w: 1080, h: 1920 },
  { id: "pinterest", label: "Pinterest 2:3 (1000×1500)", w: 1000, h: 1500 },
  { id: "youtube", label: "YouTube thumbnail 16:9 (1280×720)", w: 1280, h: 720 },
] as const;
type SizeId = (typeof SIZES)[number]["id"];

// Centre-crops to the chosen size so every platform accepts the image.
async function toJpeg(file: File, sizeId: SizeId): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = SIZES.find((s) => s.id === sizeId) ?? SIZES[0];
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read the image");
  const target = size.w / size.h;
  const source = bitmap.width / bitmap.height;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (source > target) sw = Math.round(bitmap.height * target);
  else sh = Math.round(bitmap.width / target);
  const sx = Math.round((bitmap.width - sw) / 2);
  const sy = Math.round((bitmap.height - sh) / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size.w, size.h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not convert image"))), "image/jpeg", 0.9)
  );
}

function defaultTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  SCHEDULED: { bg: "#FFF6BF", fg: "#5A4A00", label: "Scheduled" },
  PUBLISHING: { bg: "#E3ECFF", fg: "#1D3F8F", label: "Publishing" },
  PUBLISHED: { bg: "#DFF3DF", fg: "#1F5A1F", label: "Published" },
  FAILED: { bg: "#FDE2E2", fg: "#8A1C1C", label: "Failed" },
};

export default function SchedulePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [caption, setCaption] = useState("");
  const [autoKeywords, setAutoKeywords] = useState<Array<{ keyword: string; name: string; accountId: string }>>([]);
  useEffect(() => {
    fetch("/api/automations").then((r) => r.json()).then((p) => {
      const list = (p?.data?.automations ?? p?.data ?? []) as Array<{ name: string; keywords?: string[]; isActive?: boolean; instagramAccountId?: string }>;
      if (!Array.isArray(list)) return;
      setAutoKeywords(list.filter((a) => a.isActive !== false).flatMap((a) => (a.keywords ?? []).map((k) => ({ keyword: k, name: a.name, accountId: a.instagramAccountId ?? "" }))));
    }).catch(() => {});
  }, []);
  const [when, setWhen] = useState(defaultTime);
  const [toInstagram, setToInstagram] = useState(true);
  const [toFacebook, setToFacebook] = useState(false);
  const [kind, setKind] = useState<"IMAGE" | "REEL">("IMAGE");
  const [sizeId, setSizeId] = useState<SizeId>("portrait");
  const [video, setVideo] = useState<{ url: string; preview: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [cover, setCover] = useState<{ id: string; preview: string } | null>(null);
  const [channels, setChannels] = useState<Array<{ id: string; name: string; platform: string; clientName: string; instagramAccountId: string | null }>>([]);
  const [chosenChannels, setChosenChannels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((p) => {
        const list: Account[] = p?.data?.instagramAccounts ?? [];
        setAccounts(list);
        const saved = readClient();
        const pick = saved && list.some((a) => a.id === saved) ? saved : list[0]?.id;
        if (pick) setAccountId((cur) => cur || pick);
      })
      .catch(() => setError("Could not load your accounts"));
  }, []);

  useEffect(() => onClientChange((id) => { if (id !== "all") setAccountId(id); }), []);

  useEffect(() => {
    fetch("/api/connect-links")
      .then((r) => r.json())
      .then((p) => p.success && setChannels(p.data.connections.filter((c: { platform: string }) => c.platform === "youtube" || c.platform === "tiktok")))
      .catch(() => {});
  }, []);

  const loadPosts = useCallback(() => {
    fetch("/api/scheduled-posts")
      .then((r) => r.json())
      .then((p) => p.success && setPosts(p.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPosts();
    const t = setInterval(loadPosts, 30_000);
    return () => clearInterval(t);
  }, [loadPosts]);

  const account = accounts.find((a) => a.id === accountId);
  const usernameOf = useMemo(() => new Map(accounts.map((a) => [a.id, a.username])), [accounts]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const room = 10 - uploads.length;
      const next: Upload[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const jpeg = await toJpeg(file, sizeId);
        const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg });
        const payload = await res.json();
        if (!payload.success) throw new Error(payload.error ?? "Upload failed");
        next.push({ id: payload.data.id, url: payload.data.url, preview: URL.createObjectURL(jpeg) });
      }
      setUploads((u) => [...u, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onVideo(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 300 * 1024 * 1024) return setError("Videos must be under 300 MB");
    setBusy(true);
    setProgress(0);
    try {
      const result = await blobUpload(`videos/${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        contentType: file.type || "video/mp4",
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      setVideo({ url: result.url, preview: URL.createObjectURL(file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function onCover(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const jpeg = await toJpeg(file, "story");
      const res = await fetch("/api/media", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error ?? "Upload failed");
      setCover({ id: payload.data.id, preview: URL.createObjectURL(jpeg) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cover upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function schedule(now: boolean) {
    setError(null);
    setNotice(null);
    if (!accountId) return setError("Choose a client account");
    if (kind === "IMAGE" && !uploads.length) return setError("Add at least one image");
    if (kind === "REEL" && !video) return setError("Upload a video first");
    const platforms = [toInstagram ? "instagram" : null, toFacebook ? "facebook" : null].filter(Boolean);
    const socialConnectionIds = kind === "REEL" ? chosenChannels : [];
    if (!platforms.length && !socialConnectionIds.length) return setError("Choose where to post");
    const at = now ? new Date() : new Date(when);
    if (!now && at.getTime() < Date.now() - 60_000) return setError("Pick a time in the future");
    setBusy(true);
    try {
      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: accountId,
          caption,
          mediaAssetIds: kind === "IMAGE" ? uploads.map((u) => u.id) : [],
          mediaKind: kind,
          videoUrl: kind === "REEL" ? video?.url : null,
          coverAssetId: kind === "REEL" ? cover?.id ?? null : null,
          scheduledAt: at.toISOString(),
          platforms,
          socialConnectionIds,
        }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error ?? "Could not schedule");
      setNotice(now ? "Publishing within a minute." : `Scheduled for ${at.toLocaleString()}.`);
      setUploads([]);
      setVideo(null);
      setCover(null);
      setChosenChannels([]);
      setCaption("");
      loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    await fetch(`/api/scheduled-posts/${id}`, { method: "DELETE" });
    loadPosts();
  }

  const upcoming = posts.filter((p) => p.status === "SCHEDULED" || p.status === "PUBLISHING").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const done = posts.filter((p) => p.status === "PUBLISHED" || p.status === "FAILED");

  const field = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">

      <div className="flex flex-wrap gap-6 items-start">
        <section className="panel flex flex-col gap-4 rounded-2xl p-5" style={{ flex: "999 1 420px", minWidth: 0 }}>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#444]">Post to</p>
              <div className="flex flex-wrap items-center gap-2">
                <IconToggle id="instagram" title="Instagram" on={toInstagram} onClick={() => setToInstagram((v) => !v)} />
                <IconToggle id="facebook" title="Facebook Page" on={toFacebook} onClick={() => setToFacebook((v) => !v)} />
                {channels
                  .filter((c) => !c.instagramAccountId || c.instagramAccountId === accountId)
                  .map((c) => (
                    <IconToggle
                      key={c.id}
                      id={c.platform === "tiktok" ? "tiktok" : "youtube"}
                      title={kind === "REEL" ? `${c.platform === "tiktok" ? "TikTok" : "YouTube"}: ${c.name}` : "Needs a video"}
                      disabled={kind !== "REEL"}
                      on={kind === "REEL" && chosenChannels.includes(c.id)}
                      onClick={() => setChosenChannels((list) => (list.includes(c.id) ? list.filter((x) => x !== c.id) : [...list, c.id]))}
                    />
                  ))}
                <span title={PLATFORM_ORDER.filter((id) => !PLATFORMS[id].live).map((id) => PLATFORMS[id].name).join(", ") + ": coming soon"} className="px-1 text-xs font-semibold text-muted">+{PLATFORM_ORDER.filter((id) => !PLATFORMS[id].live).length} soon</span>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#444]">Format</p>
              <div className="flex rounded-xl bg-[#F1EFE8] p-0.5" role="group" aria-label="Post type">
                {([["IMAGE", "Post"], ["IMAGE", "Carousel"], ["REEL", "Reel"], ["STORY", "Story"]] as const).map(([k, l]) => (
                  <button
                    key={l}
                    type="button"
                    disabled={k === "STORY"}
                    title={k === "STORY" ? "Stories: coming soon" : l === "Carousel" ? "Add 2 to 10 images" : undefined}
                    onClick={() => k !== "STORY" && setKind(k)}
                    aria-pressed={kind === k && (l !== "Carousel" || uploads.length > 1) && (l !== "Post" || uploads.length <= 1)}
                    className="h-8 rounded-lg px-3 text-[12.5px] font-semibold disabled:opacity-40"
                    style={kind === k && (k === "REEL" || (l === "Carousel" ? uploads.length > 1 : uploads.length <= 1)) ? { background: "#fff", boxShadow: "0 1px 2px #0002" } : { color: "#555" }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {kind === "IMAGE" && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[#444]">Size</p>
                <select value={sizeId} onChange={(e) => setSizeId(e.target.value as SizeId)} className="h-9 rounded-xl border border-border bg-white px-3 text-[13px] font-medium">
                  {SIZES.map((sz) => (
                    <option key={sz.id} value={sz.id}>{sz.label}</option>
                  ))}
                </select>
              </div>
            )}
            {accounts.length > 1 && (
              <div className="ml-auto">
                <p className="mb-1.5 text-xs font-semibold text-[#444]">Client</p>
                <select value={accountId} onChange={(e) => { setAccountId(e.target.value); writeClient(e.target.value); }} className="h-9 rounded-xl border border-border bg-white px-3 text-[13px] font-medium">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>@{a.username}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {kind === "REEL" && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-[#444]">Video (MP4 or MOV, 9:16 works best, under 300 MB)</span>
              {video ? (
                <div className="flex items-center gap-3">
                  <video src={video.preview} className="h-32 rounded-lg" muted controls />
                  <button type="button" onClick={() => setVideo(null)} className="text-sm font-semibold underline">Remove</button>
                </div>
              ) : (
                <label className="cursor-pointer rounded-xl border-[1.5px] border-dashed border-[#D6D3C9] bg-[#FCFBF8] px-4 py-6 text-center text-[12.5px] text-muted">
                  {progress !== null ? `Uploading… ${progress}%` : "Choose a video"}
                  <input type="file" accept="video/mp4,video/quicktime" className="sr-only" onChange={(e) => { void onVideo(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
              <span className="pt-2 text-xs font-semibold text-[#444]">Cover (optional, cropped to 9:16)</span>
              {cover ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.preview} alt="Cover" className="h-32 rounded-lg" />
                  <button type="button" onClick={() => setCover(null)} className="text-sm font-semibold underline">Remove</button>
                </div>
              ) : (
                <label className="w-fit rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm text-muted cursor-pointer">
                  Upload a cover image
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void onCover(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
              <span className="text-xs text-muted">Used on Instagram and Facebook. YouTube uses it once the channel is phone verified.</span>
            </div>
          )}

          {kind === "IMAGE" && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-3">
              {uploads.map((u, i) => (
                <div key={u.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u.preview} alt={`Image ${i + 1}`} className="h-24 w-24 rounded-lg object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove image ${i + 1}`}
                    onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))}
                    className="absolute -top-2 -right-2 h-7 w-7 rounded-full text-xs font-bold text-white"
                    style={{ background: BLACK }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {uploads.length < 10 && (
                <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-[1.5px] border-dashed border-[#D6D3C9] bg-[#FCFBF8] px-4 text-center text-[12.5px] text-muted ${uploads.length ? "h-24 w-24" : "w-full py-6"}`}>
                  {busy ? "Uploading…" : uploads.length ? "Add more" : <><b className="text-foreground">Drop images here or click to browse</b><span>1 image for a post, 2 to 10 for a carousel. Choose Reel above for a video.</span></>}
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>

          )}

          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#444]">
            Caption
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2200} className={field} placeholder="Write the caption, hashtags included" />
            {(() => {
              const hit = autoKeywords.find((k) => new RegExp(`\\b${k.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(caption));
              return (
                <p className="mt-1 flex justify-between text-xs text-muted">
                  <span>{hit ? <>Tip: the word <b className="text-foreground">{hit.keyword.toUpperCase()}</b> triggers your &ldquo;{hit.name}&rdquo; automation</> : "\u00a0"}</span>
                  <span>{caption.length.toLocaleString("en-NG")} / 2,200</span>
                </p>
              );
            })()}
          </label>

          {error && <p className="text-sm" style={{ color: "#B42318" }}>{error}</p>}
          {notice && <p className="text-sm" style={{ color: "#1F5A1F" }}>{notice}</p>}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Publish at" className="h-9 rounded-xl border border-border bg-white px-3 text-[13px] font-medium" />
            <span className="text-xs text-muted">Lagos time</span>
            <div className="flex-1" />
            <button type="button" disabled={busy} onClick={() => void schedule(true)} className="h-9 rounded-xl border border-border bg-white px-4 text-[13px] font-semibold disabled:opacity-50">
              Publish now
            </button>
            <button type="button" disabled={busy} onClick={() => void schedule(false)} className="h-9 rounded-xl px-4 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: BLACK }}>
              Schedule post
            </button>
          </div>
        </section>

        <aside className="flex flex-col items-center gap-2" style={{ flex: "1 1 280px", maxWidth: 320 }}>
                    <div className="w-full rounded-[36px] p-3" style={{ background: BLACK }}>
            <div className="rounded-[26px] bg-white overflow-hidden text-[#121212]">
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: YELLOW }}>
                  {(account?.username ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-semibold">{account?.username ?? "account"}</span>
              </div>
              <div className="aspect-[4/5] flex items-center justify-center" style={{ background: "linear-gradient(135deg,#FFE97A,#FFD701 55%,#F4B400)" }}>
                {kind === "REEL" && cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.preview} alt="Cover preview" className="h-full w-full object-cover" />
                ) : kind === "REEL" && video ? (
                  <video src={video.preview} className="h-full w-full object-cover" muted autoPlay loop playsInline />
                ) : uploads[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploads[0].preview} alt="Post preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-[#5a4800]" style={{ fontFamily: "var(--font-display)" }}>Your image</span>
                )}
              </div>
              {uploads.length > 1 && <p className="text-center text-xs text-[#5A5A5A] pt-2">1 of {uploads.length}</p>}
              <p className="px-3 py-3 text-sm whitespace-pre-line line-clamp-6">
                <b>{account?.username ?? "account"}</b> {caption || "Your caption"}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <ContentCalendar posts={posts} usernameOf={usernameOf} onlyAccount={accountId} />

      <FeedPlanner accountId={accountId} posts={posts} onMoved={loadPosts} />

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Upcoming</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted">Nothing scheduled yet.</p>}
        {upcoming.map((p) => (
          <PostRow key={p.id} post={p} username={usernameOf.get(p.instagramAccountId)} onCancel={p.status === "SCHEDULED" ? () => void cancel(p.id) : undefined} />
        ))}
      </section>

      <section className="panel p-5 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Published and failed</h2>
        {done.length === 0 && <p className="text-sm text-muted">No posts yet.</p>}
        {done.map((p) => (
          <PostRow key={p.id} post={p} username={usernameOf.get(p.instagramAccountId)} onCancel={p.status === "FAILED" ? () => void cancel(p.id) : undefined} />
        ))}
      </section>
    </div>
  );
}

function IconToggle({ id, title, on, onClick, disabled }: { id: "instagram" | "facebook" | "youtube" | "tiktok"; title: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border-2 transition ${on ? "border-[#0E0E0E] bg-[#FFF6BF]" : "border-border bg-surface opacity-50 grayscale"} disabled:cursor-not-allowed`}
    >
      <PlatformIcon id={id} size={24} />
      {on && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#0E0E0E] text-[10px] font-bold text-[#FFD701]">✓</span>}
    </button>
  );
}

function PostRow({ post, username, onCancel }: { post: Post; username?: string; onCancel?: () => void }) {
  const s = STATUS_STYLE[post.status] ?? STATUS_STYLE.SCHEDULED;
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
      {post.mediaAssetIds[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/media/${post.mediaAssetIds[0]}`} alt="" className="h-14 w-14 rounded-lg object-cover" />
      ) : (
        <span className="h-14 w-14 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: BLACK, color: YELLOW }}>Reel</span>
      )}
      <div className="flex flex-col min-w-0" style={{ flex: "1 1 220px" }}>
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          @{username ?? "account"} · {new Date(post.scheduledAt).toLocaleString()}
          {(post.platforms ?? []).map((p) => <PlatformIcon key={p} id={p === "facebook" ? "facebook" : "instagram"} size={16} />)}
          {(post.socialConnectionIds?.length ?? 0) > 0 && <PlatformIcon id="youtube" size={16} />}
        </span>
        <span className="text-sm text-muted truncate">{post.caption || "No caption"}{post.mediaAssetIds.length > 1 ? ` · carousel of ${post.mediaAssetIds.length}` : ""}</span>
        {post.errorMessage && <span className="text-xs" style={{ color: "#B42318" }}>{post.errorMessage}</span>}
      </div>
      <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>
      {post.permalink && (
        <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">View on Instagram</a>
      )}
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-sm font-semibold underline">
          {post.status === "FAILED" ? "Remove" : "Cancel"}
        </button>
      )}
    </div>
  );
}
