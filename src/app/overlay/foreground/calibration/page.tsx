import type { Metadata } from "next";
import { ForegroundCalibrationPreview } from "./ForegroundCalibrationPreview";
import type { ForegroundActionTone, ForegroundIdentityPhase } from "@/components/ForegroundOverlayStrip";

export const metadata: Metadata = {
  title: "Foreground Overlay Calibration — BARCODE Radio",
  description: "Nonfunctional browser-source size, motion, and readability calibration for BARCODE Radio.",
  robots: { index: false, follow: false },
};

type CalibrationActionName = "show-online" | "intake-open" | "intake-closed" | "wheel-unlocked" | "skip-sent" | "skip-confirmed" | "sponsor";

type CalibrationAction = {
  label: string;
  message: string;
  tone: ForegroundActionTone;
};

const CALIBRATION_ACTIONS: Record<CalibrationActionName, CalibrationAction> = {
  "show-online": {
    label: "SHOW ONLINE",
    message: "BARCODE RADIO TRANSMISSION ACTIVE",
    tone: "signal",
  },
  "intake-open": {
    label: "INTAKE OPEN",
    message: "SUBMISSIONS LIVE // 25 SLOTS REMAIN",
    tone: "signal",
  },
  "intake-closed": {
    label: "INTAKE CLOSED",
    message: "CURRENT LINE LOCKED // TRANSMISSION CONTINUES",
    tone: "closed",
  },
  "wheel-unlocked": {
    label: "WHEEL UNLOCKED",
    message: "2 SPINS ARMED // TAP TARGET CLEARED",
    tone: "wheel",
  },
  "skip-sent": {
    label: "SKIP SENT",
    message: "TEST ARTIST — TEST TRACK // FROM TEST MEMBER",
    tone: "skip",
  },
  "skip-confirmed": {
    label: "SKIP CONFIRMED",
    message: "TEST ARTIST — TEST TRACK // FOR TEST MEMBER",
    tone: "skip",
  },
  sponsor: {
    label: "SPONSOR BREAK",
    message: "A WORD FROM OUR SPONSOR // 08:42 REMAINING",
    tone: "sponsor",
  },
};

const CALIBRATION_ARTIST = "TEST ARTIST WITH A DELIBERATELY LONG TRANSMISSION NAME";
const CALIBRATION_TRACK = "A TRACK TITLE LONG ENOUGH TO PROVE THE SLOW SCROLL BEHAVIOR";

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveAction(value: string | string[] | undefined): CalibrationActionName {
  const candidate = firstQueryValue(value);
  return candidate === "show-online"
    || candidate === "intake-open"
    || candidate === "intake-closed"
    || candidate === "wheel-unlocked"
    || candidate === "skip-sent"
    || candidate === "skip-confirmed"
    || candidate === "sponsor"
    ? candidate
    : "show-online";
}

function resolveWheelCount(value: string | string[] | undefined) {
  const parsed = Number.parseInt(firstQueryValue(value) ?? "12", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(99, parsed)) : 12;
}

function resolvePhase(value: string | string[] | undefined): ForegroundIdentityPhase | undefined {
  const candidate = firstQueryValue(value);
  return candidate === "artist" || candidate === "track" ? candidate : undefined;
}

export default async function ForegroundOverlayCalibrationPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const query = (await searchParams) ?? {};
  const actionName = resolveAction(query.action);
  const action = CALIBRATION_ACTIONS[actionName];

  return (
    <ForegroundCalibrationPreview
      actionName={actionName}
      actionLabel={action.label}
      actionMessage={action.message}
      actionTone={action.tone}
      artistName={CALIBRATION_ARTIST}
      trackTitle={CALIBRATION_TRACK}
      submissionsOpen={firstQueryValue(query.state) !== "closed"}
      view={firstQueryValue(query.view) === "source" ? "source" : "review"}
      wheelCount={resolveWheelCount(query.count)}
      forcedPhase={resolvePhase(query.phase)}
    />
  );
}
