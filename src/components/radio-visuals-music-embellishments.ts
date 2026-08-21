import { clampVisualValue } from "@/lib/radio-visuals-engine";
import type { RadioVisualAudioDrives } from "@/lib/radio-visuals-engine";
import type { RadioVisualMusicEmbellishmentPlan } from "@/lib/radio-visuals-music-embellishments";

export type RadioVisualMusicRgb = [number, number, number];

export interface DrawRadioVisualMusicEmbellishmentsInput {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  plan: RadioVisualMusicEmbellishmentPlan;
  primary: RadioVisualMusicRgb;
  secondary: RadioVisualMusicRgb;
  highlight: RadioVisualMusicRgb;
  seed: number;
}

function rgba(color: RadioVisualMusicRgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${clampVisualValue(alpha)})`;
}

function mixRgb(
  current: RadioVisualMusicRgb,
  target: RadioVisualMusicRgb,
  amount: number,
): RadioVisualMusicRgb {
  const bounded = clampVisualValue(amount);
  return [
    current[0] + (target[0] - current[0]) * bounded,
    current[1] + (target[1] - current[1]) * bounded,
    current[2] + (target[2] - current[2]) * bounded,
  ];
}

function randomUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 1_919) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function ease(value: number): number {
  const bounded = clampVisualValue(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function evolvedColors(
  primary: RadioVisualMusicRgb,
  secondary: RadioVisualMusicRgb,
  highlight: RadioVisualMusicRgb,
  hueShift: number,
): [RadioVisualMusicRgb, RadioVisualMusicRgb, RadioVisualMusicRgb] {
  return [
    mixRgb(primary, secondary, hueShift * 0.7),
    mixRgb(secondary, highlight, hueShift * 0.34),
    mixRgb(highlight, primary, hueShift * 0.24),
  ];
}

function perimeterPoint(
  progress: number,
  width: number,
  height: number,
  inset: number,
): { x: number; y: number } {
  const safeWidth = Math.max(1, width - inset * 2);
  const safeHeight = Math.max(1, height - inset * 2);
  const perimeter = (safeWidth + safeHeight) * 2;
  let distance = (((progress % 1) + 1) % 1) * perimeter;
  if (distance <= safeWidth) return { x: inset + distance, y: inset };
  distance -= safeWidth;
  if (distance <= safeHeight) return { x: width - inset, y: inset + distance };
  distance -= safeHeight;
  if (distance <= safeWidth) return { x: width - inset - distance, y: height - inset };
  distance -= safeWidth;
  return { x: inset, y: height - inset - distance };
}

function musicAlpha(input: DrawRadioVisualMusicEmbellishmentsInput): number {
  const { mix, plan } = input;
  const event = Math.max(
    plan.bassImpact,
    plan.midImpact,
    plan.trebleImpact,
    plan.tapestryImpact,
  );
  return clampVisualValue(
    mix
      * (0.025
        + plan.structureLevel * 0.22
        + plan.morphology * 0.08
        + event * 0.28),
    0,
    0.76,
  );
}

function strokePolyline(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
): void {
  if (points.length === 0) return;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function drawBarsToTeeth(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const count = Math.max(4, plan.edgePrimitiveBudget);
  const toothDepth = height
    * (0.012 + plan.structureLevel * 0.035 + plan.morphology * 0.055 + plan.pulse * 0.035)
    * plan.reach;
  for (let tooth = 0; tooth < count; tooth += 1) {
    const x0 = width * tooth / count;
    const x1 = width * (tooth + 1) / count;
    const centerX = (x0 + x1) * 0.5;
    const irregularity = 0.72 + randomUnit(seed, 101_000 + tooth) * 0.46;
    const depth = toothDepth * irregularity;
    context.fillStyle = rgba(colors[tooth % colors.length], alpha * (0.38 + plan.structureLevel * 0.42));
    context.beginPath();
    context.moveTo(x0, 0);
    context.lineTo(x1, 0);
    context.lineTo(centerX, depth);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(x0, height);
    context.lineTo(x1, height);
    context.lineTo(centerX, height - depth * (0.72 + plan.bassImpact * 0.42));
    context.closePath();
    context.fill();
  }
  context.strokeStyle = rgba(colors[2], alpha * (0.38 + plan.snareFlash * 0.52));
  context.lineWidth = Math.max(1, unit * (0.0014 + plan.lineWeight * 0.002));
  const rail = width * (0.025 + plan.bassImpact * 0.11);
  context.beginPath();
  context.moveTo(0, height * 0.28);
  context.lineTo(rail, height * 0.28);
  context.moveTo(width, height * 0.72);
  context.lineTo(width - rail, height * 0.72);
  context.stroke();
}

function drawRibbonsToBraids(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const count = Math.max(2, Math.min(6, Math.round(plan.edgePrimitiveBudget * 0.65)));
  for (let ribbon = 0; ribbon < count; ribbon += 1) {
    const top = ribbon % 2 === 0;
    const lane = Math.floor(ribbon / 2) + 1;
    const baseY = top
      ? height * (0.018 + lane * 0.018)
      : height * (0.982 - lane * 0.018);
    const amplitude = height * (0.006 + plan.structureLevel * 0.012 + plan.deformation * 0.021);
    const phase = time * (0.32 + plan.tempoRate * 0.35) + ribbon * 1.75 + randomUnit(seed, 102_000 + ribbon) * Math.PI;
    const points: Array<{ x: number; y: number }> = [];
    for (let step = 0; step <= 40; step += 1) {
      const progress = step / 40;
      const braid = Math.sin(progress * Math.PI * (4 + plan.morphology * 7) + phase);
      const counter = Math.cos(progress * Math.PI * (3 + plan.finale * 5) - phase * 0.62);
      points.push({
        x: width * progress,
        y: baseY + (braid + counter * plan.morphology * 0.55) * amplitude,
      });
    }
    context.strokeStyle = rgba(colors[ribbon % colors.length], alpha * (0.48 + plan.structureLevel * 0.34));
    context.lineWidth = Math.max(1, unit * (0.0012 + plan.lineWeight * 0.0022));
    strokePolyline(context, points);
  }
}

function drawFramesToSplice(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const count = Math.max(2, Math.min(6, Math.round(plan.edgePrimitiveBudget * 0.7)));
  for (let frame = 0; frame < count; frame += 1) {
    const depth = (frame + 1) / (count + 1);
    const insetX = width * (0.014 + depth * 0.045);
    const insetY = height * (0.012 + depth * 0.038);
    const splice = Math.sin(time * (0.2 + plan.tempoRate * 0.18) + frame * 1.6)
      * unit * plan.movement * 0.022;
    const cornerX = width * (0.08 + plan.morphology * 0.08);
    const cornerY = height * (0.07 + plan.morphology * 0.06);
    context.strokeStyle = rgba(colors[frame % colors.length], alpha * (0.42 + plan.structureLevel * 0.4));
    context.lineWidth = Math.max(1, unit * (0.0013 + plan.lineWeight * 0.002));
    context.beginPath();
    context.moveTo(insetX + splice, insetY + cornerY);
    context.lineTo(insetX + splice, insetY);
    context.lineTo(insetX + cornerX + splice, insetY);
    context.moveTo(width - insetX + splice, insetY + cornerY);
    context.lineTo(width - insetX + splice, insetY);
    context.lineTo(width - insetX - cornerX + splice, insetY);
    context.moveTo(insetX - splice, height - insetY - cornerY);
    context.lineTo(insetX - splice, height - insetY);
    context.lineTo(insetX + cornerX - splice, height - insetY);
    context.moveTo(width - insetX - splice, height - insetY - cornerY);
    context.lineTo(width - insetX - splice, height - insetY);
    context.lineTo(width - insetX - cornerX - splice, height - insetY);
    context.stroke();
  }
  if (plan.midImpact > 0.02) {
    const y = height * (0.16 + randomUnit(seed, 103_900) * 0.68);
    const spliceWidth = width * (0.08 + plan.midImpact * 0.16);
    context.fillStyle = rgba(colors[2], alpha * (0.4 + plan.midImpact * 0.5));
    context.fillRect(0, y, spliceWidth, Math.max(2, unit * (0.002 + plan.midImpact * 0.005)));
    context.fillRect(width - spliceWidth, y, spliceWidth, Math.max(2, unit * (0.002 + plan.midImpact * 0.005)));
  }
}

const MATRIX_GLYPHS = ["0", "1", "A", "F", "#", "/", "<", ">", ":"] as const;

function drawRainToCrossfeed(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const count = Math.max(3, plan.edgePrimitiveBudget);
  const fontSize = Math.max(10, unit * (0.009 + plan.lineWeight * 0.003));
  context.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let column = 0; column < count; column += 1) {
    const fromRight = column % 2 === 1;
    const x = fromRight
      ? width * (0.96 - (column % 3) * 0.025)
      : width * (0.04 + (column % 3) * 0.025);
    const head = height * (((time * (0.035 + plan.tempoRate * 0.025 + plan.movement * 0.09)
      + randomUnit(seed, 104_000 + column)) % 1.16) - 0.08);
    const trail = 2 + Math.round(plan.structureLevel * 3 + plan.morphology * 2);
    for (let glyph = 0; glyph < trail; glyph += 1) {
      const character = MATRIX_GLYPHS[Math.floor(randomUnit(seed + Math.floor(time * 3), 104_300 + column * 11 + glyph) * MATRIX_GLYPHS.length)];
      context.fillStyle = rgba(glyph === 0 ? colors[2] : colors[column % 2], alpha * (1 - glyph / (trail + 1)) * (0.42 + plan.trebleImpact * 0.45));
      context.fillText(character, x, head - glyph * fontSize * 1.15);
    }
  }
  const crossfeeds = Math.max(1, Math.round(plan.morphology * 3 + plan.midImpact * 2));
  for (let feed = 0; feed < crossfeeds; feed += 1) {
    const y = height * (0.16 + (feed + 1) / (crossfeeds + 1) * 0.68);
    const reach = width * (0.025 + plan.morphology * 0.08 + plan.midImpact * 0.12);
    context.strokeStyle = rgba(colors[(feed + 1) % colors.length], alpha * (0.26 + plan.morphology * 0.42 + plan.midImpact * 0.26));
    context.lineWidth = Math.max(1, unit * (0.001 + plan.lineWeight * 0.0017));
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(reach, y);
    context.moveTo(width, y + unit * 0.006);
    context.lineTo(width - reach, y + unit * 0.006);
    context.stroke();
  }
}

function drawTerminalToBreach(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const labels = ["[SIGNAL]", "// LIVE", "SYNC::ACK", "0xB4RC0DE", "[AUDIO]"];
  const count = Math.max(2, Math.min(labels.length, Math.round(plan.edgePrimitiveBudget * 0.55)));
  context.font = `800 ${Math.max(9, unit * (0.008 + plan.lineWeight * 0.002))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  context.textBaseline = "middle";
  for (let label = 0; label < count; label += 1) {
    const top = label % 2 === 0;
    const y = top ? height * (0.025 + label * 0.012) : height * (0.975 - label * 0.012);
    const fromRight = randomUnit(seed, 105_000 + label) > 0.5;
    context.textAlign = fromRight ? "right" : "left";
    context.fillStyle = rgba(colors[label % colors.length], alpha * (0.38 + plan.structureLevel * 0.4 + plan.trebleImpact * 0.2));
    context.fillText(labels[(label + Math.floor(time * plan.movement * 2)) % labels.length], fromRight ? width * 0.97 : width * 0.03, y);
  }
  const cursorY = height * (0.14 + ((time * (0.025 + plan.movement * 0.15) + randomUnit(seed, 105_800)) % 0.72));
  const breach = width * (0.018 + plan.morphology * 0.08 + plan.midImpact * 0.1);
  context.fillStyle = rgba(colors[2], alpha * (0.3 + plan.midImpact * 0.5));
  context.fillRect(0, cursorY, breach, Math.max(2, unit * (0.0015 + plan.lineWeight * 0.0015)));
  context.fillRect(width - breach, cursorY, breach, Math.max(2, unit * (0.0015 + plan.lineWeight * 0.0015)));
}

function drawSlicesToScramble(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const eventEnergy = Math.max(plan.bassImpact, plan.midImpact, plan.trebleImpact, plan.tapestryImpact);
  const tick = Math.floor(time * (0.35 + plan.movement * 4 + eventEnergy * 8));
  const count = Math.max(3, plan.edgePrimitiveBudget);
  for (let fragment = 0; fragment < count; fragment += 1) {
    const localSeed = seed + tick * 97 + fragment * 31;
    const y = height * (0.05 + randomUnit(localSeed, 106_000 + fragment) * 0.9);
    const length = width * (0.018 + plan.structureLevel * 0.045 + plan.morphology * 0.055 + randomUnit(localSeed, 106_200 + fragment) * 0.04);
    const thickness = Math.max(2, unit * (0.0012 + plan.lineWeight * 0.0024 + randomUnit(localSeed, 106_400 + fragment) * 0.003));
    const fromRight = fragment % 2 === 1;
    const displacement = plan.deformation * unit * (randomUnit(localSeed, 106_600 + fragment) - 0.5) * 0.04;
    context.fillStyle = rgba(colors[fragment % colors.length], alpha * (0.34 + eventEnergy * 0.42 + plan.structureLevel * 0.22));
    context.fillRect(fromRight ? width - length : 0, y + displacement, length, thickness);
  }
}

function jaggedRail(
  context: CanvasRenderingContext2D,
  width: number,
  y: number,
  reach: number,
  direction: 1 | -1,
  jitter: number,
  seed: number,
): void {
  context.beginPath();
  const startX = direction > 0 ? 0 : width;
  context.moveTo(startX, y);
  for (let step = 1; step <= 8; step += 1) {
    const progress = step / 8;
    context.lineTo(
      startX + direction * reach * progress,
      y + (randomUnit(seed, 107_000 + step) - 0.5) * jitter * Math.sin(progress * Math.PI),
    );
  }
  context.stroke();
}

function drawRailsToDischarge(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const rails = Math.max(2, Math.min(6, Math.round(plan.edgePrimitiveBudget * 0.6)));
  for (let rail = 0; rail < rails; rail += 1) {
    const y = height * (rail + 1) / (rails + 1);
    const reach = width * (0.04 + plan.structureLevel * 0.055 + plan.bassImpact * 0.12 + plan.morphology * 0.04);
    const jitter = unit * (0.004 + plan.deformation * 0.045 + plan.trebleImpact * 0.06);
    context.strokeStyle = rgba(colors[rail % colors.length], alpha * (0.4 + plan.structureLevel * 0.3 + plan.trebleImpact * 0.28));
    context.lineWidth = Math.max(1, unit * (0.001 + plan.lineWeight * 0.0023));
    jaggedRail(context, width, y, reach, 1, jitter, seed + rail * 47 + Math.floor(time * plan.movement * 8));
    jaggedRail(context, width, y + unit * 0.004, reach, -1, jitter, seed + rail * 61 + Math.floor(time * plan.movement * 8));
  }
}

function drawGridToPrism(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const planes = Math.max(2, Math.min(7, Math.round(plan.edgePrimitiveBudget * 0.7)));
  const phase = Math.sin(time * (0.08 + plan.tempoRate * 0.08)) * plan.movement;
  for (let plane = 0; plane < planes; plane += 1) {
    const depth = (plane + 1) / (planes + 1);
    const insetX = width * (0.018 + depth * 0.065);
    const insetY = height * (0.014 + depth * 0.05);
    const prism = unit * plan.morphology * (0.012 + depth * 0.016) * phase;
    context.strokeStyle = rgba(colors[plane % colors.length], alpha * (0.36 + plan.structureLevel * 0.36 + plan.glow * 0.22));
    context.lineWidth = Math.max(1, unit * (0.001 + plan.lineWeight * 0.0018));
    context.beginPath();
    context.moveTo(width * 0.5, insetY + prism);
    context.lineTo(width - insetX, height * 0.5);
    context.lineTo(width * 0.5, height - insetY - prism);
    context.lineTo(insetX, height * 0.5);
    context.closePath();
    context.stroke();
  }
}

function drawDriftToVortex(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const count = Math.max(4, plan.edgePrimitiveBudget);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  for (let particle = 0; particle < count; particle += 1) {
    const baseAngle = particle / count * Math.PI * 2 + randomUnit(seed, 108_000 + particle) * 0.3;
    const angle = baseAngle + time * (0.035 + plan.movement * 0.22) * (particle % 2 ? -1 : 1);
    const radiusX = width * (0.42 - randomUnit(seed, 108_200 + particle) * 0.045 - plan.pulse * 0.025);
    const radiusY = height * (0.43 - randomUnit(seed, 108_400 + particle) * 0.05 - plan.pulse * 0.02);
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    const radius = Math.max(1.2, unit * (0.0018 + plan.lineWeight * 0.0026 + plan.bassImpact * 0.006));
    context.fillStyle = rgba(colors[particle % colors.length], alpha * (0.44 + plan.structureLevel * 0.32 + plan.glow * 0.18));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = rgba(colors[2], alpha * (0.2 + plan.morphology * 0.36 + plan.bassImpact * 0.28));
  context.lineWidth = Math.max(1, unit * (0.001 + plan.lineWeight * 0.0015));
  context.beginPath();
  context.ellipse(centerX, centerY, width * (0.41 - plan.pulse * 0.018), height * (0.42 - plan.pulse * 0.015), plan.morphology * 0.08, 0, Math.PI * 2);
  context.stroke();
}

function drawStarsToNetwork(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, time, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  const count = Math.max(4, plan.edgePrimitiveBudget);
  const points = Array.from({ length: count }, (_, point) => {
    const drift = Math.sin(time * (0.05 + plan.movement * 0.18) + point) * plan.movement * 0.012;
    return perimeterPoint(point / count + drift, width, height, unit * (0.018 + randomUnit(seed, 109_000 + point) * 0.028));
  });
  const links = Math.max(1, Math.round(plan.morphology * count * 0.72 + plan.midImpact * 2));
  context.lineWidth = Math.max(1, unit * (0.0008 + plan.lineWeight * 0.0012));
  for (let link = 0; link < links; link += 1) {
    const from = points[link % points.length];
    const to = points[(link + 1 + Math.round(plan.finale * 2)) % points.length];
    context.strokeStyle = rgba(colors[link % colors.length], alpha * (0.2 + plan.morphology * 0.36 + plan.midImpact * 0.24));
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  points.forEach((point, index) => {
    const radius = Math.max(1.2, unit * (0.0018 + plan.lineWeight * 0.002 + (index % 3 === 0 ? plan.bassImpact * 0.006 : plan.trebleImpact * 0.003)));
    context.fillStyle = rgba(colors[index % colors.length], alpha * (0.46 + plan.structureLevel * 0.28 + plan.glow * 0.2));
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  });
}

function drawBandAccents(input: DrawRadioVisualMusicEmbellishmentsInput, alpha: number): void {
  const { context, width, height, plan, seed } = input;
  const unit = Math.min(width, height);
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  if (plan.bassImpact >= 0.025) {
    context.strokeStyle = rgba(colors[0], alpha * (0.38 + plan.bassImpact * 0.5));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + plan.bassImpact * 0.008));
    context.beginPath();
    context.ellipse(width * 0.5, height * 0.5, width * (0.43 - plan.bassImpact * 0.025), height * (0.44 - plan.bassImpact * 0.02), 0, 0, Math.PI * 2);
    context.stroke();
  }
  if (plan.snareFlash >= 0.025) {
    const y = height * (0.14 + randomUnit(seed, 110_101) * 0.72);
    const reach = width * (0.045 + plan.snareFlash * 0.17);
    context.strokeStyle = rgba(colors[2], alpha * (0.42 + plan.snareFlash * 0.48));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + plan.snareFlash * 0.006));
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(reach, y);
    context.moveTo(width, y);
    context.lineTo(width - reach, y);
    context.stroke();
  }
  if (plan.trebleImpact >= 0.025) {
    const sparks = 1 + Math.floor(plan.trebleImpact * 4);
    for (let spark = 0; spark < sparks; spark += 1) {
      const fromRight = spark % 2 === 1;
      const x = fromRight ? width * 0.94 : width * 0.06;
      const y = height * (0.12 + randomUnit(seed, 110_300 + spark) * 0.76);
      const length = unit * (0.012 + plan.trebleImpact * 0.036);
      context.strokeStyle = rgba(spark % 2 ? colors[1] : colors[2], alpha * (0.48 + plan.trebleImpact * 0.44));
      context.lineWidth = Math.max(1, unit * (0.001 + plan.trebleImpact * 0.002));
      context.beginPath();
      context.moveTo(x - length, y);
      context.lineTo(x + length, y);
      context.moveTo(x, y - length);
      context.lineTo(x, y + length);
      context.stroke();
    }
  }
}

/** Drawn strictly after the accepted family renderer; it cannot suppress it. */
export function drawRadioVisualMusicEmbellishments(
  input: DrawRadioVisualMusicEmbellishmentsInput,
): void {
  if (!input.plan.enabled || !input.plan.active || input.mix < 0.002) return;
  const alpha = musicAlpha(input);
  if (alpha < 0.002) return;
  const { context, plan } = input;
  const unit = Math.min(input.width, input.height);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = rgba(input.highlight, alpha * (0.1 + plan.glow * 0.52));
  context.shadowBlur = unit * (0.001 + plan.glow * 0.014);

  if (plan.scene === "edge_spectrum") drawBarsToTeeth(input, alpha);
  if (plan.scene === "oscilloscope_ribbons") drawRibbonsToBraids(input, alpha);
  if (plan.scene === "tape_feedback") drawFramesToSplice(input, alpha);
  if (plan.scene === "matrix_rain") drawRainToCrossfeed(input, alpha);
  if (plan.scene === "ascii_terminal") drawTerminalToBreach(input, alpha);
  if (plan.scene === "pixel_sort_storm") drawSlicesToScramble(input, alpha);
  if (plan.scene === "lightning_switchyard") drawRailsToDischarge(input, alpha);
  if (plan.scene === "laser_lattice") drawGridToPrism(input, alpha);
  if (plan.scene === "particle_pressure") drawDriftToVortex(input, alpha);
  if (plan.scene === "signal_constellation") drawStarsToNetwork(input, alpha);
  drawBandAccents(input, alpha);
  context.restore();
}

function centerAlpha(input: DrawRadioVisualMusicEmbellishmentsInput): number {
  const strongest = Math.max(
    input.plan.bassImpact,
    input.plan.midImpact,
    input.plan.trebleImpact,
    input.plan.tapestryImpact,
    input.plan.gestureProgress === null ? 0 : input.plan.gestureStrength,
  );
  return clampVisualValue(input.mix * strongest * 0.68, 0, 0.68);
}

/**
 * Sparse event-only breach of the performer window. The caller applies the
 * existing intrusion mask, and this function enforces a hard nine-primitive
 * budget regardless of how many channels fire together.
 */
export function drawRadioVisualMusicCenterEmbellishments(
  input: DrawRadioVisualMusicEmbellishmentsInput,
): void {
  const { context, width, height, plan, seed } = input;
  if (!plan.enabled || !plan.centerActive || input.mix < 0.002) return;
  const alpha = centerAlpha(input);
  if (alpha < 0.002) return;
  const unit = Math.min(width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.44;
  const colors = evolvedColors(input.primary, input.secondary, input.highlight, plan.hueShift);
  let remaining = plan.centerPrimitiveBudget;
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  if (plan.bassImpact >= 0.025) {
    const contours = Math.min(2, remaining);
    context.strokeStyle = rgba(colors[0], alpha * (0.62 + plan.bassImpact * 0.32));
    context.lineWidth = Math.max(1.5, unit * (0.002 + plan.bassImpact * 0.009));
    context.shadowColor = rgba(colors[0], alpha * 0.82);
    context.shadowBlur = unit * (0.008 + plan.bassImpact * 0.022);
    for (let contour = 0; contour < contours; contour += 1) {
      const depth = contour * unit * 0.02;
      if (plan.scene === "laser_lattice" || plan.scene === "particle_pressure" || plan.scene === "signal_constellation") {
        context.beginPath();
        context.ellipse(centerX, centerY, width * (0.12 + plan.bassImpact * 0.12) + depth, height * (0.08 + plan.bassImpact * 0.09) + depth, contour ? -0.08 : 0.08, 0, Math.PI * 2);
        context.stroke();
      } else {
        const halfWidth = width * (0.11 + plan.bassImpact * 0.13) + depth;
        const halfHeight = height * (0.075 + plan.bassImpact * 0.08) + depth;
        context.strokeRect(centerX - halfWidth, centerY - halfHeight, halfWidth * 2, halfHeight * 2);
      }
    }
    remaining -= contours;
  }

  if (plan.midImpact >= 0.025 && remaining > 0) {
    const flashes = Math.min(2, remaining);
    const y = centerY + (randomUnit(seed, 111_101) - 0.5) * height * 0.2;
    context.strokeStyle = rgba(colors[2], alpha * (0.66 + plan.snareFlash * 0.3));
    context.fillStyle = rgba(colors[2], alpha * (0.48 + plan.snareFlash * 0.4));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + plan.midImpact * 0.008));
    if (plan.scene === "matrix_rain" || plan.scene === "ascii_terminal") {
      context.font = `900 ${Math.max(10, unit * (0.011 + plan.midImpact * 0.006))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(plan.scene === "matrix_rain" ? "// MID HIT //" : "[SYNC::ACK]", centerX, y);
      remaining -= 1;
      if (flashes > 1) {
        context.fillRect(centerX - width * 0.16, y + unit * 0.018, width * 0.32, Math.max(1.5, unit * 0.002));
        remaining -= 1;
      }
    } else {
      const reach = width * (0.09 + plan.midImpact * 0.18);
      for (let flash = 0; flash < flashes; flash += 1) {
        const offset = (flash - (flashes - 1) / 2) * unit * 0.015;
        context.beginPath();
        context.moveTo(centerX - reach, y + offset);
        context.lineTo(centerX - reach * 0.2, y - offset);
        context.lineTo(centerX + reach * 0.18, y + offset * 0.5);
        context.lineTo(centerX + reach, y - offset);
        context.stroke();
      }
      remaining -= flashes;
    }
  }

  if (plan.trebleImpact >= 0.025 && remaining > 0) {
    const sparkCount = Math.min(4, remaining, 1 + Math.floor(plan.trebleImpact * 4));
    context.shadowColor = rgba(colors[2], alpha);
    context.shadowBlur = unit * (0.008 + plan.trebleImpact * 0.02);
    context.lineWidth = Math.max(1, unit * (0.0012 + plan.trebleImpact * 0.0025));
    for (let spark = 0; spark < sparkCount; spark += 1) {
      const angle = randomUnit(seed, 111_300 + spark) * Math.PI * 2;
      const orbit = unit * (0.055 + randomUnit(seed, 111_400 + spark) * 0.14);
      const x = centerX + Math.cos(angle) * orbit;
      const y = centerY + Math.sin(angle) * orbit * 1.16;
      const length = unit * (0.012 + plan.trebleImpact * 0.035);
      context.strokeStyle = rgba(spark % 2 ? colors[1] : colors[2], alpha * (0.62 + plan.trebleImpact * 0.32));
      context.beginPath();
      context.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
    remaining -= sparkCount;
  }

  if (plan.tapestryImpact >= 0.025 && remaining > 0) {
    const angle = randomUnit(seed, 111_701) * Math.PI - Math.PI * 0.5;
    const length = Math.hypot(width, height) * 0.34;
    context.strokeStyle = rgba(colors[1], alpha * (0.48 + plan.tapestryImpact * 0.46));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + plan.tapestryImpact * 0.007));
    context.beginPath();
    context.moveTo(centerX - Math.cos(angle) * length, centerY - Math.sin(angle) * length);
    context.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
    context.stroke();
    remaining -= 1;
  }

  if (plan.gestureProgress !== null && remaining > 0) {
    const progress = ease(plan.gestureProgress);
    const direction = randomUnit(seed, 111_901) > 0.5 ? 1 : -1;
    const x = direction > 0 ? width * (-0.08 + progress * 1.16) : width * (1.08 - progress * 1.16);
    const lift = plan.gesture === "melodic_lift" ? Math.sin(progress * Math.PI) * unit * 0.1 : 0;
    const y = height * (0.24 + randomUnit(seed, 111_902) * 0.48) - lift;
    const length = unit * (0.04 + plan.gestureStrength * 0.045);
    context.fillStyle = rgba(plan.gesture === "vocal_pattern" ? colors[1] : colors[2], alpha * (0.5 + plan.gestureStrength * 0.36));
    context.fillRect(direction > 0 ? x - length : x, y, length, Math.max(1.5, unit * 0.003));
  }
  context.restore();
}
