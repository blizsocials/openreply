import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

// Public: Instagram's servers fetch scheduled images from here. Ids are
// unguessable cuids and only post images are stored.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findUnique({ where: { id }, select: { data: true, mimeType: true } });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(asset.data), {
    headers: { "Content-Type": asset.mimeType, "Cache-Control": "public, max-age=86400" },
  });
}
