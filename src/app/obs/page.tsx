import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OBSOverlay } from "@/components/OBSOverlay";
import { COOKIE_NAME, REHEARSAL_QUEUE_COOKIE_NAME } from "@/lib/auth";
import { getPublicQueueSnapshot } from "@/lib/queue";
import { resolveQueueCookieAccess } from "@/lib/queue-rehearsal-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OBS Overlay",
  description: "Browser source overlay for OBS. Shows live queue state.",
  robots: { index: false, follow: false },
};

export default async function OBSPage() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(COOKIE_NAME)?.value;
  const rehearsalToken = cookieStore.get(REHEARSAL_QUEUE_COOKIE_NAME)?.value;
  let access = await resolveQueueCookieAccess({ adminToken, rehearsalToken });

  if (!access.authorized && rehearsalToken) {
    const snapshot = await getPublicQueueSnapshot();
    access = await resolveQueueCookieAccess({
      adminToken,
      rehearsalToken,
      session: snapshot.session,
      isCurrentSession: snapshot.sessionActive === true,
    });
  }

  if (!access.authorized) notFound();
  return <OBSOverlay />;
}
