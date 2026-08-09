"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ForegroundOverlayStrip } from "@/components/ForegroundOverlayStrip";
import type { ForegroundActionTone, ForegroundIdentityPhase } from "@/components/ForegroundOverlayStrip";

type CalibrationActionName = "skip-sent" | "skip-confirmed" | "bnl" | "sponsor";
type CalibrationView = "review" | "source";

type ForegroundCalibrationPreviewProps = {
  actionName: CalibrationActionName;
  actionLabel: string;
  actionMessage: string;
  actionTone: ForegroundActionTone;
  artistName: string;
  trackTitle: string;
  submissionsOpen: boolean;
  view: CalibrationView;
  wheelCount: number;
  forcedPhase?: ForegroundIdentityPhase;
};

const SOURCE_WIDTH = 1080;
const SOURCE_HEIGHT = 1920;

function previewHref({ actionName, submissionsOpen, forcedPhase }: Pick<ForegroundCalibrationPreviewProps, "actionName" | "submissionsOpen" | "forcedPhase">) {
  const params = new URLSearchParams();
  params.set("action", actionName);
  params.set("state", submissionsOpen ? "open" : "closed");
  if (forcedPhase) params.set("phase", forcedPhase);
  return `?${params.toString()}`;
}

export function ForegroundCalibrationPreview(props: ForegroundCalibrationPreviewProps) {
  const [sceneScale, setSceneScale] = useState(0.35);

  useEffect(() => {
    if (props.view === "source") return;
    const measure = () => {
      const widthScale = Math.max(0.16, (window.innerWidth - 40) / SOURCE_WIDTH);
      const heightScale = Math.max(0.16, Math.min(0.56, (window.innerHeight * 0.66) / SOURCE_HEIGHT));
      setSceneScale(Math.min(0.56, widthScale, heightScale));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [props.view]);

  const sourceStyle = useMemo(() => ({
    "--fg-height": "100px",
    "--fg-primary-size": "31px",
    "--fg-secondary-size": "18px",
    "--fg-wheel-size": "92px",
    "--fg-wheel-count-size": "50px",
    "--fg-anchor-y": "1222px",
    "--fg-side-margin": "24px",
    "--fg-key-color": "#0000ff",
  }) as CSSProperties, []);

  const strip = (
    <ForegroundOverlayStrip
      artistName={props.artistName}
      trackTitle={props.trackTitle}
      wheelSpinsOwed={props.wheelCount}
      submissionsOpen={props.submissionsOpen}
      actionLabel={props.actionLabel}
      actionMessage={props.actionMessage}
      actionTone={props.actionTone}
      forcedPhase={props.forcedPhase}
    />
  );

  if (props.view === "source") {
    return (
      <div className="fg-calibration-source-shell" data-calibration-only="true" data-view="source" data-source-resolution="1080x1920" style={sourceStyle}>
        <div className="fg-calibration-canvas">{strip}</div>
      </div>
    );
  }

  const sceneFrameStyle = {
    width: `${SOURCE_WIDTH * sceneScale}px`,
    height: `${SOURCE_HEIGHT * sceneScale}px`,
  } as CSSProperties;
  const scaledCanvasStyle = {
    ...sourceStyle,
    transform: `scale(${sceneScale})`,
  } as CSSProperties;

  return (
    <div className="fg-calibration-review" data-calibration-only="true" data-view="review" style={sourceStyle}>
      <header className="fg-calibration-review-header">
        <p>BARCODE RADIO // FOREGROUND CALIBRATION</p>
        <h1>100px action strip</h1>
        <div className="fg-calibration-specs" aria-label="Locked timing and size">
          <span>ARTIST 12s</span><span>TRACK 6s</span><span>WHEEL 92px</span><span>COUNT 50px</span>
        </div>
      </header>

      <section className="fg-calibration-detail" aria-label="Foreground strip detail preview">
        {strip}
      </section>

      <nav className="fg-calibration-controls" aria-label="Calibration samples">
        {(["skip-sent", "skip-confirmed", "bnl", "sponsor"] as const).map((actionName) => (
          <a key={actionName} data-active={props.actionName === actionName ? "true" : "false"} href={previewHref({ ...props, actionName })}>{actionName.replace("-", " ")}</a>
        ))}
        <a data-active={!props.submissionsOpen ? "true" : "false"} href={previewHref({ ...props, submissionsOpen: !props.submissionsOpen })}>{props.submissionsOpen ? "show closed" : "show open"}</a>
      </nav>

      <p className="fg-calibration-behavior-note">
        The top line alternates automatically. Overflow moves only when the active artist or track name does not fit. The lower rail is reserved for queue state and event messages—there is no permanent TikTok promotion.
      </p>

      <section className="fg-calibration-scene-review" aria-label="Scaled 1080 by 1920 placement preview">
        <div>
          <p>PLACEMENT // SCALED FULL SCENE</p>
          <span>The exact source stays flat blue for chroma keying.</span>
        </div>
        <div className="fg-calibration-scene-frame" style={sceneFrameStyle}>
          <div className="fg-calibration-canvas fg-calibration-canvas--scaled" style={scaledCanvasStyle}>{strip}</div>
        </div>
      </section>

      <a className="fg-calibration-source-link" href={`?view=source&action=${props.actionName}&state=${props.submissionsOpen ? "open" : "closed"}${props.forcedPhase ? `&phase=${props.forcedPhase}` : ""}`}>
        Open exact 1080×1920 chroma source
      </a>
    </div>
  );
}
