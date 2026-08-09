import type { Metadata } from "next";
import { ForegroundCalibrationPreview } from "./ForegroundCalibrationPreview";
import type { ForegroundActionTone, ForegroundIdentityPhase } from "@/components/ForegroundOverlayStrip";

export const metadata: Metadata = {
  title: "Foreground Overlay Calibration — BARCODE Radio",
  description: "Nonfunctional browser-source size, motion, and readability calibration for BARCODE Radio.",
  robots: { index: false, follow: false },
};

type CalibrationActionName = "skip-sent" | "skip-confirmed" | "bnl" | "sponsor";

type CalibrationAction = {
  label: string;
  message: string;
  tone: ForegroundActionTone;
};

const CALIBRATION_ACTIONS: Record<CalibrationActionName, CalibrationAction> = {
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
  bnl: {
    label: "BNL",
    message: "SIGNAL RECEIVED // NEXT TRANSMISSION STANDING BY",
    tone: "bnl",
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
  return candidate === "skip-sent" || candidate === "bnl" || candidate === "sponsor" ? candidate : "skip-confirmed";
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
