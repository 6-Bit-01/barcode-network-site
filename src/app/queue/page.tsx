import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, REHEARSAL_QUEUE_COOKIE_NAME } from "@/lib/auth";
import { getPublicQueueSnapshot, sanitizeQueueSnapshotForPublic } from "@/lib/queue";
import { resolveQueueCookieAccess } from "@/lib/queue-rehearsal-access";

export const metadata = {
  title: "BARCODE Radio Queue | BARCODE Network",
  description: "Submit music and follow the current BARCODE Radio queue.",
};

export default async function QueuePage() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(COOKIE_NAME)?.value;
  const rehearsalToken = cookieStore.get(REHEARSAL_QUEUE_COOKIE_NAME)?.value;
  const preliminaryAccess = await resolveQueueCookieAccess({ adminToken, rehearsalToken });
  if (!preliminaryAccess.authorized && !rehearsalToken) redirect("/radio");

  const rawSnapshot = await getPublicQueueSnapshot().catch(() => null);
  if (!rawSnapshot) redirect("/radio#queue-status");
  const access = await resolveQueueCookieAccess({
    adminToken,
    rehearsalToken,
    session: rawSnapshot.session,
    isCurrentSession: rawSnapshot.sessionActive === true,
  });
  if (!access.authorized) redirect("/radio");
  const snapshot = access.isAdmin || access.hasRehearsalAccess
    ? rawSnapshot
    : sanitizeQueueSnapshotForPublic(rawSnapshot);
  const session = snapshot.session;
  if (!snapshot.sessionActive || !session || session.status === "archived" || session.broadcastPhase === "ended") {
    redirect("/radio#queue-status");
  }
  redirect(`/queue/${encodeURIComponent(session.sessionId)}`);
}
