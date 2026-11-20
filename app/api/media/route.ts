import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

// Upload one JPEG (the browser converts and resizes before sending). Returns
// a public URL Instagram can fetch when the post publishes.
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("image/jpeg")) {
    return NextResponse.json({ success: false, error: "Images must be JPEG" }, { status: 400 });
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return NextResponse.json({ success: false, error: "Image must be under 4 MB" }, { status: 400 });
  }
  const asset = await prisma.mediaAsset.create({
    data: { workspaceId, mimeType: "image/jpeg", size: buffer.length, data: buffer },
    select: { id: true },
  });
  return NextResponse.json({ success: true, data: { id: asset.id, url: `${getBaseUrl()}/api/media/${asset.id}` } });
}
