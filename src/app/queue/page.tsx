/* eslint-disable react/jsx-no-comment-textnodes */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PublicQueueGateway } from "@/components/PublicQueueGateway";
import { COOKIE_NAME, REHEARSAL_QUEUE_COOKIE_NAME } from "@/lib/auth";
import { getPublicQueueSnapshot } from "@/lib/queue";
import { resolveQueueCookieAccess } from "@/lib/queue-rehearsal-access";

export const metadata = {
  title: "BARCODE Radio Queue | BARCODE Network",
  description: "BARCODE Radio public queue gateway.",
};

export default async function QueuePage() {
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

  if (!access.authorized) redirect("/radio");

  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">// BARCODE RADIO</p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground mb-4"><span className="text-accent text-glow">Queue</span> Gateway</h1>
          <p className="max-w-2xl text-sm sm:text-base text-muted">Waiting room for the current BARCODE Radio broadcast queue. Submissions unlock only when admin opens the session.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <PublicQueueGateway />
      </section>
    </main>
  );
}
