import { externalLinks, radioPage } from "@/content";
import { isQueueProductionEnabled } from "@/lib/queue-production";

export type RadioSubmissionRouting = {
  mode: "auxchord" | "native_queue";
  href: string;
  external: boolean;
  resourceLabel: string;
  submitLabel: string;
  heroDescription: string;
  submitStepDescription: string;
  acceptedSourcesRule: string;
  bnlBoundary: string;
  footerSummary: string;
  terminalDescription: string;
  readModelSummary: string;
};

const AUXCHORD_ROUTING: RadioSubmissionRouting = {
  mode: "auxchord",
  href: externalLinks.auxchord,
  external: true,
  resourceLabel: "Auxchord",
  submitLabel: "Submit via Auxchord",
  heroDescription: radioPage.hero.description,
  submitStepDescription: radioPage.steps[0].description,
  acceptedSourcesRule: radioPage.rules[2],
  bnlBoundary:
    "BNL-01 relays approved Network status and public Discord-side activity to website surfaces. It does not control Auxchord submissions, replace the live host, or provide autonomous broadcast decisions.",
  footerSummary:
    "BARCODE Radio submissions run through Auxchord. Discord is the community hub. Terminal is the Network archive/interface.",
  terminalDescription: `${radioPage.hero.heading1} ${radioPage.hero.heading2} is the weekly live broadcast. Submissions go through Auxchord and the show routes original music into a public live session.`,
  readModelSummary: `${radioPage.hero.heading1} ${radioPage.hero.heading2} is the weekly live broadcast. Public submissions enter the show through Auxchord and the website queue surface reflects public session state.`,
};

const NATIVE_QUEUE_ROUTING: RadioSubmissionRouting = {
  mode: "native_queue",
  href: "/queue",
  external: false,
  resourceLabel: "Radio Queue",
  submitLabel: "Submit via Radio Queue",
  heroDescription:
    "BARCODE Radio is a weekly live broadcast hosted by 6 Bit where original music enters through the native BARCODE Radio queue, is heard on TikTok Live, and is discussed with the community.",
  submitStepDescription:
    "Send your original track through the native BARCODE Radio queue.",
  acceptedSourcesRule:
    "SoundCloud, Spotify, YouTube, TikTok, Apple Music song links, or direct MP3/WAV uploads are accepted through the BARCODE Radio queue.",
  bnlBoundary:
    "BNL-01 relays approved Network status and public Discord-side activity to website surfaces. It does not control queue submissions, replace the live host, or provide autonomous broadcast decisions.",
  footerSummary:
    "BARCODE Radio submissions run through the native BARCODE Radio queue. Discord is the community hub. Terminal is the Network archive/interface.",
  terminalDescription: `${radioPage.hero.heading1} ${radioPage.hero.heading2} is the weekly live broadcast. Submissions go through the native BARCODE Radio queue and the show routes original music into a public live session.`,
  readModelSummary: `${radioPage.hero.heading1} ${radioPage.hero.heading2} is the weekly live broadcast. Public submissions enter the show through the native BARCODE Radio queue and the website queue surface reflects public session state.`,
};

export function getRadioSubmissionRouting(
  env: NodeJS.ProcessEnv = process.env,
): RadioSubmissionRouting {
  return isQueueProductionEnabled(env)
    ? NATIVE_QUEUE_ROUTING
    : AUXCHORD_ROUTING;
}
