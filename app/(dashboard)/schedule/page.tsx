"use client";

/**
 * Blizsocials: schedule Instagram posts for any connected client account.
 * Images are resized to JPEG in the browser, uploaded, and published by the
 * worker at the chosen time.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload as blobUpload } from "@vercel/blob/client";

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
  facebookPostId?: string | null;
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
  const [when, setWhen] = useState(defaultTime);
  const [toInstagram, setToInstagram] = useState(true);
  const [toFacebook, setToFacebook] = useState(false);
  const [kind, setKind] = useState<"IMAGE" | "REEL">("IMAGE");
  const [sizeId, setSizeId] = useState<SizeId>("portrait");
  const [video, setVideo] = useState<{ url: string; preview: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
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
        if (list[0]) setAccountId((cur) => cur || list[0].id);
      })
      .catch(() => setError("Could not load your accounts"));
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

  async function schedule(now: boolean) {
    setError(null);
    setNotice(null);
    if (!accountId) return setError("Choose a client account");
    if (kind === "IMAGE" && !uploads.length) return setError("Add at least one image");
    if (kind === "REEL" && !video) return setError("Upload a video first");
    const platforms = [toInstagram ? "instagram" : null, toFacebook ? "facebook" : null].filter(Boolean);
    if (!platforms.length) return setError("Choose Instagram, Facebook or both");
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
          scheduledAt: at.toISOString(),
          platforms,
        }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error ?? "Could not schedule");
      setNotice(now ? "Publishing within a minute." : `Scheduled for ${at.toLocaleString()}.`);
      setUploads([]);
      setVideo(null);
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

  const field = "w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-accent";

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Schedule posts</h1>
          <p className="text-sm text-muted">Plan feed posts and carousels for any client. They publish automatically at the time you choose.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <section className="panel p-5 flex flex-col gap-4" style={{ flex: "999 1 420px", minWidth: 0 }}>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Client account
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold mb-2">Post to</legend>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={toInstagram} onChange={(e) => setToInstagram(e.target.checked)} className="h-5 w-5" />
                Instagram
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold cursor-pointer">
                <input type="checkbox" checked={toFacebook} onChange={(e) => setToFacebook(e.target.checked)} className="h-5 w-5" />
                Facebook Page
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Post type">
            {(["IMAGE", "REEL"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className="rounded-xl px-4 py-3 text-sm font-semibold border border-border"
                style={kind === k ? { background: BLACK, color: YELLOW } : undefined}
              >
                {k === "IMAGE" ? "Photo or carousel" : "Reel or video"}
              </button>
            ))}
          </div>

          {kind === "REEL" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Video (MP4 or MOV, 9:16 works best, under 300 MB)</span>
              {video ? (
                <div className="flex items-center gap-3">
                  <video src={video.preview} className="h-32 rounded-lg" muted controls />
                  <button type="button" onClick={() => setVideo(null)} className="text-sm font-semibold underline">Remove</button>
                </div>
              ) : (
                <label className="rounded-xl border-2 border-dashed border-border px-4 py-6 text-sm text-muted cursor-pointer text-center">
                  {progress !== null ? `Uploading… ${progress}%` : "Choose a video"}
                  <input type="file" accept="video/mp4,video/quicktime" className="sr-only" onChange={(e) => { void onVideo(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
          )}

          {kind === "IMAGE" && (
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Image size (applied as you add images)
            <select value={sizeId} onChange={(e) => setSizeId(e.target.value as SizeId)} className={field}>
              {SIZES.map((sz) => (
                <option key={sz.id} value={sz.id}>{sz.label}</option>
              ))}
            </select>
          </label>
          )}

          {kind === "IMAGE" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Images (1 for a post, 2 to 10 for a carousel)</span>
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
                <label className="h-24 w-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted cursor-pointer text-center px-1">
                  {busy ? "Uploading…" : "Add images"}
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>

          )}

          <label className="flex flex-col gap-2 text-sm font-semibold">
            Caption
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} maxLength={2200} className={field} placeholder="Write the caption, hashtags included" />
            <span className="text-xs font-normal text-muted">{caption.length} / 2200</span>
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            Publish at (your time)
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
          </label>

          {error && <p className="text-sm" style={{ color: "#B42318" }}>{error}</p>}
          {notice && <p className="text-sm" style={{ color: "#1F5A1F" }}>{notice}</p>}

          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => void schedule(false)} className="rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50" style={{ background: YELLOW, color: BLACK }}>
              Schedule post
            </button>
            <button type="button" disabled={busy} onClick={() => void schedule(true)} className="rounded-xl px-5 py-3 text-sm font-semibold border border-border bg-surface disabled:opacity-50">
              Publish now
            </button>
          </div>
        </section>

        <aside className="flex flex-col items-center gap-2" style={{ flex: "1 1 280px", maxWidth: 320 }}>
          <span className="text-xs font-bold tracking-wider text-muted">PREVIEW</span>
          <div className="w-full rounded-[36px] p-3" style={{ background: BLACK }}>
            <div className="rounded-[26px] bg-white overflow-hidden text-[#121212]">
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: YELLOW }}>
                  {(account?.username ?? "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="text-sm font-semibold">{account?.username ?? "account"}</span>
              </div>
              <div className="aspect-square bg-[#F0EEE6] flex items-center justify-center">
                {kind === "REEL" && video ? (
                  <video src={video.preview} className="h-full w-full object-cover" muted autoPlay loop playsInline />
                ) : uploads[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploads[0].preview} alt="Post preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-[#5A5A5A]">Your image appears here</span>
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
        <span className="text-sm font-semibold">@{username ?? "account"} · {new Date(post.scheduledAt).toLocaleString()} · {(post.platforms?.length ? post.platforms : ["instagram"]).map((p) => (p === "facebook" ? "Facebook" : "Instagram")).join(" + ")}</span>
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
