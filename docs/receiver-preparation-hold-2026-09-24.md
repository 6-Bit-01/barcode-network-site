# Keep repeated provider playback held during preparation

The September 16 audit's S01 sequence still existed on main `2804c510`:
the receiver paused only the first warming `playing` event. A repeated event
after pause/readiness could advance media while preparation was still active.
This is a reproduced callback defect; it does not invalidate previously accepted
normal YouTube/TikTok starts or establish that a live broadcast hit this sequence.

The existing `VideoReceiverPreparation` now holds every `playing` event until
preparation is cancelled or replaced by the scheduled playback packet. A late
readiness response cannot mark the receiver ready while it is waiting for the
new pause confirmation. The existing two-attempt acknowledgement limit remains.

Focused regressions cover both providers, repeated events while pausing/held/ready,
late acknowledgements, the retry bound, release and cancellation. Full repository
check/build results are recorded in the PR. These callbacks use fake providers;
they do not establish real-device synchronized decoding.

This narrow repair leaves host disposal S02 as a separate follow-up because its
server revocation must not overwrite a successor's playback. Queue state, payments,
commercials, BNL, production flags and submitter editing are outside this change.
No new environment setting or migration is needed. After deployment, only a focused
receiver regression observation is new acceptance; prior accepted rehearsals stand.
