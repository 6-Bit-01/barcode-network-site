import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { readBallad, requireBalladShow } from "@/lib/bnl-ballads-store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({ body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!await verifyAdminRequest(request)) throw new Error("Unauthorized");
        const payload = JSON.parse(clientPayload || "{}");
        await requireBalladShow(payload.showId);
        const doc = await readBallad(payload.showId);
        if (!doc.versions.some(v => v.id === payload.versionId)) throw new Error("Choose a saved prompt version.");
        if (!pathname.startsWith(`bnl-ballads/${payload.showId}/`) || pathname.includes("..")) throw new Error("Invalid upload path.");
        return { allowedContentTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"], maximumSizeInBytes: 100 * 1024 * 1024, addRandomSuffix: true };
      },
      onUploadCompleted: async () => { /* Attachment is an explicit admin confirmation. */ },
    });
    return NextResponse.json(response);
  } catch { return NextResponse.json({ error: "Upload could not be authorized or completed." }, { status: 400 }); }
}
