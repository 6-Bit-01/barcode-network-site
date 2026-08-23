import { clampVisualValue } from "@/lib/radio-visuals-engine";
import type {
  RadioVisualAudioDrives,
  RadioVisualMusicPerimeterPlan,
  RadioVisualMusicScene,
  RadioVisualMusicSceneLayerPlan,
} from "@/lib/radio-visuals-engine";

export type ExpandedRadioVisualRgb = [number, number, number];

interface DrawExpandedRadioVisualMusicInput {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  layerPlan: RadioVisualMusicSceneLayerPlan;
  primary: ExpandedRadioVisualRgb;
  secondary: ExpandedRadioVisualRgb;
  highlight: ExpandedRadioVisualRgb;
  seed: number;
}

interface DrawExpandedRadioVisualPerimeterInput {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  plan: RadioVisualMusicPerimeterPlan;
  primary: ExpandedRadioVisualRgb;
  secondary: ExpandedRadioVisualRgb;
  highlight: ExpandedRadioVisualRgb;
  seed: number;
}

interface ExpandedFamilyActivity {
  bass: number;
  mid: number;
  treble: number;
  tapestry: number;
  bassCount: number;
  midCount: number;
  trebleCount: number;
  tapestryCount: number;
  build: number;
  progress: number;
  phrase: number;
  act: number;
}

const KINETIC_GLYPHS = ["B", "4", "R", "C", "0", "D", "E", "//", "01", "<>", "[]", "#"] as const;
const KINETIC_TAPESTRY_GLYPHS = ["//", "01", "<>", "[]", "#"] as const;

function rgba(color: ExpandedRadioVisualRgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${clampVisualValue(alpha)})`;
}

function randomUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 1_919) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function activity(input: DrawExpandedRadioVisualMusicInput): ExpandedFamilyActivity {
  const { drives, layerPlan } = input;
  return {
    bass: clampVisualValue(drives.bass * 0.16 + drives.bassLayer * 0.56 + drives.bassPulse * 0.38),
    mid: clampVisualValue(drives.mid * 0.14 + drives.midLayer * 0.54 + drives.midPulse * 0.4),
    treble: clampVisualValue(drives.treble * 0.14 + drives.trebleLayer * 0.5 + drives.treblePulse * 0.44),
    tapestry: clampVisualValue(drives.tapestry * 0.66 + drives.tapestryPulse * 0.34),
    bassCount: layerPlan.bass,
    midCount: layerPlan.mid,
    trebleCount: layerPlan.treble,
    tapestryCount: layerPlan.tapestry,
    build: drives.build,
    progress: drives.progress,
    phrase: drives.phrase,
    act: Math.min(3, Math.floor(drives.progress * 4)),
  };
}

function familyAlpha(input: DrawExpandedRadioVisualMusicInput): number {
  return clampVisualValue(input.mix * (0.74 + input.drives.presence * 0.2), 0, 0.96);
}

function polygon(
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
): void {
  if (points.length < 3) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
}

function drawCrtSignalBreach(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const bandCount = Math.min(13, 3 + a.midCount + a.tapestryCount);
  const tearDirection = a.act % 2 === 0 ? 1 : -1;
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let band = 0; band < bandCount; band += 1) {
    const local = randomUnit(seed, 120_100 + band);
    const y = height * ((local + time * (0.018 + a.treble * 0.12) + a.phrase * 0.08) % 1);
    const bandHeight = Math.max(4, unit * (0.006 + randomUnit(seed, 120_200 + band) * 0.022 + a.bass * 0.014));
    const offset = width * Math.sin(time * (0.3 + a.mid * 0.8) + band * 1.71) * (0.018 + a.mid * 0.11) * tearDirection;
    const inset = width * randomUnit(seed, 120_300 + band) * 0.12;
    const color = band % 5 === 0 ? highlight : band % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + a.mid * 0.34 + a.treble * 0.24));
    context.fillRect(-width * 0.08 + offset + inset, y, width * (0.54 + a.tapestry * 0.42), bandHeight);
    context.fillStyle = rgba(band % 2 ? primary : secondary, alpha * (0.12 + a.treble * 0.32));
    context.fillRect(width * 0.58 - offset - inset, y + bandHeight * 1.3, width * (0.5 + a.tapestry * 0.3), Math.max(2, bandHeight * 0.38));
  }

  const columnCount = Math.min(8, 2 + a.bassCount + a.tapestryCount);
  for (let column = 0; column < columnCount; column += 1) {
    const fromRight = column % 2 === 1;
    const depth = (Math.floor(column / 2) + 1) / (Math.ceil(columnCount / 2) + 1);
    const x = fromRight ? width * (0.98 - depth * 0.16) : width * (0.02 + depth * 0.16);
    const roll = height * ((time * (0.025 + a.bass * 0.07) + randomUnit(seed, 120_500 + column)) % 1.18 - 0.09);
    const columnWidth = unit * (0.012 + a.bass * 0.034 + (column % 3) * 0.004);
    const columnHeight = height * (0.12 + a.bass * 0.28 + randomUnit(seed, 120_600 + column) * 0.18);
    context.fillStyle = rgba(column % 2 ? secondary : primary, alpha * (0.18 + a.bass * 0.4));
    context.fillRect(x - columnWidth * 0.5, roll, columnWidth, columnHeight);
  }

  const dropoutCount = Math.min(14, a.trebleCount + a.act + 2);
  for (let block = 0; block < dropoutCount; block += 1) {
    const localSeed = seed + Math.floor(time * (1.2 + a.treble * 8)) * 71 + block * 31;
    const side = block % 2;
    const blockWidth = width * (0.035 + randomUnit(localSeed, 120_800 + block) * (0.08 + a.treble * 0.12));
    const blockHeight = unit * (0.008 + randomUnit(localSeed, 120_900 + block) * 0.026);
    const y = height * randomUnit(localSeed, 121_000 + block);
    context.fillStyle = rgba(block % 5 === 0 ? highlight : block % 2 ? secondary : primary, alpha * (0.2 + a.treble * 0.48));
    context.fillRect(side ? width - blockWidth : 0, y, blockWidth, blockHeight);
  }

  if (a.tapestryCount > 0) {
    const breachY = height * ((time * (0.05 + a.tapestry * 0.14) + a.progress) % 1);
    context.fillStyle = rgba(highlight, alpha * (0.12 + a.tapestry * 0.4));
    context.fillRect(0, breachY, width, Math.max(3, unit * (0.004 + a.tapestry * 0.012)));
  }
  context.restore();
}

function drawVoxelMegacity(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  // Begin as a sparse block district, then add towers and elevated routing in
  // later acts without changing the family or inventing audio-layer density.
  const buildingCount = Math.min(18, 4 + a.act * 2 + a.bassCount + a.midCount);
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let building = 0; building < buildingCount; building += 1) {
    const fromRight = building % 2 === 1;
    const districtIndex = Math.floor(building / 2);
    const districtCount = Math.ceil(buildingCount / 2);
    const lane = (districtIndex + 0.5) / districtCount;
    const buildingWidth = unit * (0.035 + randomUnit(seed, 121_200 + building) * 0.055 + a.bass * 0.018);
    const lifecycleRise = 0.72 + a.progress * 0.38;
    const rise = height * (0.11 + randomUnit(seed, 121_300 + building) * 0.25 + a.bass * 0.18 + a.build * 0.06) * lifecycleRise;
    const streetX = width * lane * 0.31;
    const x = fromRight ? width - streetX - buildingWidth : streetX;
    const baseY = building % 4 < 2 ? height : 0;
    const direction = baseY === height ? -1 : 1;
    const topY = baseY + direction * rise;
    const lean = Math.sin(time * (0.08 + a.mid * 0.18) + building) * unit * a.mid * 0.018;
    const color = building % 5 === 0 ? highlight : building % 2 ? secondary : primary;
    polygon(context, [
      { x, y: baseY },
      { x: x + buildingWidth, y: baseY },
      { x: x + buildingWidth + lean, y: topY },
      { x: x + lean, y: topY },
    ]);
    context.fillStyle = rgba(color, alpha * (0.18 + a.bass * 0.34 + a.mid * 0.12));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.12 + a.mid * 0.3));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.003));
    context.stroke();

    const windowCount = Math.min(6, 1 + a.act + Math.floor(a.treble * 3) + (building % 2));
    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const y = baseY + direction * rise * (windowIndex + 1) / (windowCount + 1);
      const windowWidth = buildingWidth * (0.22 + a.treble * 0.2);
      context.fillStyle = rgba(windowIndex % 3 === 0 ? highlight : building % 2 ? primary : secondary, alpha * (0.2 + a.treble * 0.48));
      context.fillRect(x + buildingWidth * 0.5 - windowWidth * 0.5 + lean * (windowIndex / windowCount), y, windowWidth, Math.max(2, unit * 0.004));
    }
    if (a.act >= 2 && building % 3 === 0) {
      const roofY = topY + direction * unit * 0.018;
      context.fillStyle = rgba(highlight, alpha * (0.16 + a.treble * 0.38));
      context.fillRect(x + buildingWidth * 0.4 + lean, Math.min(topY, roofY), Math.max(3, buildingWidth * 0.2), Math.abs(roofY - topY));
    }
  }

  const bridgeCount = Math.min(7, Math.max(0, a.midCount + a.tapestryCount + a.act - 1));
  for (let bridge = 0; bridge < bridgeCount; bridge += 1) {
    const y = height * (0.18 + bridge / Math.max(1, bridgeCount - 1) * 0.64);
    const reach = width * (0.08 + a.mid * 0.2 + a.tapestry * 0.08);
    const thickness = Math.max(4, unit * (0.006 + a.bass * 0.014));
    context.fillStyle = rgba(bridge % 2 ? secondary : primary, alpha * (0.16 + a.mid * 0.38));
    context.fillRect(0, y, reach, thickness);
    context.fillRect(width - reach, y + thickness * 1.3, reach, thickness);
  }

  if (a.tapestryCount > 0) {
    const horizonY = height * (0.5 + Math.sin(time * 0.16 + a.phrase * Math.PI * 2) * 0.04);
    context.fillStyle = rgba(highlight, alpha * (0.08 + a.tapestry * 0.28));
    context.fillRect(width * 0.07, horizonY, width * 0.86, Math.max(3, unit * 0.005));
  }
  context.restore();
}

function drawLiquidChrome(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const membraneCount = Math.min(8, 2 + a.midCount + Math.min(2, a.tapestryCount));
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let membrane = 0; membrane < membraneCount; membrane += 1) {
    const fromRight = membrane % 2 === 1;
    const edge = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    const centerY = height * (membrane + 0.5) / membraneCount;
    const reach = width * (0.05 + a.bass * 0.12 + a.mid * 0.1 + randomUnit(seed, 121_900 + membrane) * 0.05);
    const halfHeight = height / membraneCount * (0.32 + a.bass * 0.32);
    const wave = Math.sin(time * (0.22 + a.mid * 0.42) + membrane * 1.37 + a.progress * Math.PI) * unit * (0.012 + a.mid * 0.035);
    context.beginPath();
    context.moveTo(edge, centerY - halfHeight * 1.4);
    context.bezierCurveTo(
      edge + direction * reach * 0.42,
      centerY - halfHeight + wave,
      edge + direction * reach * 1.12,
      centerY - halfHeight * 0.18 - wave,
      edge + direction * reach,
      centerY,
    );
    context.bezierCurveTo(
      edge + direction * reach * 1.06,
      centerY + halfHeight * 0.24 + wave,
      edge + direction * reach * 0.36,
      centerY + halfHeight - wave,
      edge,
      centerY + halfHeight * 1.4,
    );
    context.closePath();
    const color = membrane % 3 === 0 ? highlight : membrane % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.12 + a.bass * 0.2 + a.mid * 0.18));
    context.fill();
    context.strokeStyle = rgba(membrane % 2 ? primary : highlight, alpha * (0.22 + a.treble * 0.5));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.008 + a.treble * 0.003));
    context.stroke();
  }

  const specularCount = Math.min(12, 2 + a.trebleCount);
  for (let streak = 0; streak < specularCount; streak += 1) {
    const fromRight = streak % 2 === 1;
    const y = height * randomUnit(seed, 122_200 + streak);
    const reach = width * (0.025 + a.treble * 0.15 + randomUnit(seed, 122_300 + streak) * 0.07);
    const weight = Math.max(2, unit * (0.002 + randomUnit(seed, 122_400 + streak) * 0.006));
    context.fillStyle = rgba(streak % 4 === 0 ? highlight : streak % 2 ? secondary : primary, alpha * (0.2 + a.treble * 0.52));
    context.fillRect(fromRight ? width - reach : 0, y, reach, weight);
  }

  if (a.tapestryCount > 0) {
    const seamY = height * (0.18 + ((time * 0.035 + a.phrase) % 0.64));
    const inset = width * (0.08 + (1 - a.tapestry) * 0.05);
    context.strokeStyle = rgba(highlight, alpha * (0.12 + a.tapestry * 0.38));
    context.lineWidth = Math.max(2, unit * (0.003 + a.tapestry * 0.007));
    context.beginPath();
    context.moveTo(inset, seamY);
    context.bezierCurveTo(width * 0.32, seamY - unit * 0.04, width * 0.68, seamY + unit * 0.04, width - inset, seamY);
    context.stroke();
  }
  context.restore();
}

function drawCellularTakeover(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const cellSize = unit * (0.032 + (1 - a.bass) * 0.018);
  const colonyCount = Math.min(42, 8 + a.bassCount + a.midCount + a.trebleCount + a.tapestryCount * 2);
  const tick = Math.floor(time * (0.35 + a.treble * 3.8) + a.act * 11);
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let cell = 0; cell < colonyCount; cell += 1) {
    const localSeed = seed + tick * 97 + cell * 53;
    const side = cell % 4;
    const depth = Math.floor(randomUnit(localSeed, 122_700 + cell) * (2 + a.mid * 4));
    const along = randomUnit(localSeed, 122_800 + cell);
    const size = cellSize * (0.55 + randomUnit(localSeed, 122_900 + cell) * 0.8 + a.bass * 0.24);
    let x = along * width;
    let y = along * height;
    if (side === 0) x = depth * cellSize;
    if (side === 1) x = width - (depth + 1) * cellSize;
    if (side === 2) y = depth * cellSize;
    if (side === 3) y = height - (depth + 1) * cellSize;
    const alive = randomUnit(localSeed, 123_000 + cell) < 0.34 + a.mid * 0.34 + a.tapestry * 0.2;
    const color = cell % 7 === 0 ? highlight : cell % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (alive ? 0.2 + a.mid * 0.34 : 0.06 + a.treble * 0.12));
    context.fillRect(x, y, size, size);
    if (alive && a.treble > 0.15) {
      context.fillStyle = rgba(highlight, alpha * (0.14 + a.treble * 0.44));
      context.fillRect(x + size * 0.24, y + size * 0.24, size * 0.52, Math.max(2, size * 0.12));
    }
  }

  const bridgeCount = Math.min(8, a.midCount + a.tapestryCount);
  for (let bridge = 0; bridge < bridgeCount; bridge += 1) {
    const y = height * (bridge + 1) / (bridgeCount + 1);
    const reach = width * (0.035 + a.mid * 0.16 + a.tapestry * 0.07);
    context.fillStyle = rgba(bridge % 2 ? secondary : primary, alpha * (0.16 + a.mid * 0.32));
    context.fillRect(0, y, reach, Math.max(3, cellSize * 0.16));
    context.fillRect(width - reach, y + cellSize * 0.22, reach, Math.max(3, cellSize * 0.16));
  }

  if (a.tapestryCount > 0) {
    const frontX = width * ((time * (0.035 + a.tapestry * 0.06) + a.progress) % 1);
    context.fillStyle = rgba(highlight, alpha * (0.08 + a.tapestry * 0.3));
    context.fillRect(frontX, 0, Math.max(3, cellSize * 0.14), height);
  }
  context.restore();
}

function drawShatteredBroadcast(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const shardCount = Math.min(20, 6 + a.bassCount + a.midCount + Math.floor(a.trebleCount * 0.6) + a.tapestryCount);
  const tick = Math.floor(time * (0.18 + a.treble * 2.6 + a.act * 0.12));
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let shard = 0; shard < shardCount; shard += 1) {
    const localSeed = seed + tick * 43 + shard * 97;
    const side = shard % 4;
    const along = randomUnit(localSeed, 123_400 + shard);
    const depth = unit * (0.025 + randomUnit(localSeed, 123_500 + shard) * (0.09 + a.mid * 0.12));
    const length = unit * (0.04 + randomUnit(localSeed, 123_600 + shard) * (0.12 + a.bass * 0.09));
    const shear = (randomUnit(localSeed, 123_700 + shard) - 0.5) * unit * (0.025 + a.treble * 0.07);
    let points: Array<{ x: number; y: number }>;
    if (side < 2) {
      const edgeX = side === 0 ? 0 : width;
      const direction = side === 0 ? 1 : -1;
      const y = along * height;
      points = [
        { x: edgeX, y: y - length * 0.45 },
        { x: edgeX + direction * depth, y: y - length * 0.2 + shear },
        { x: edgeX + direction * depth * 0.72, y: y + length * 0.48 },
        { x: edgeX, y: y + length * 0.28 },
      ];
    } else {
      const edgeY = side === 2 ? 0 : height;
      const direction = side === 2 ? 1 : -1;
      const x = along * width;
      points = [
        { x: x - length * 0.45, y: edgeY },
        { x: x - length * 0.15 + shear, y: edgeY + direction * depth },
        { x: x + length * 0.5, y: edgeY + direction * depth * 0.7 },
        { x: x + length * 0.25, y: edgeY },
      ];
    }
    polygon(context, points);
    const color = shard % 5 === 0 ? highlight : shard % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.12 + a.bass * 0.18 + a.mid * 0.2));
    context.fill();
    context.strokeStyle = rgba(shard % 2 ? primary : secondary, alpha * (0.24 + a.treble * 0.46));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.005));
    context.stroke();
  }

  const fractureCount = Math.min(7, a.midCount + a.tapestryCount);
  for (let fracture = 0; fracture < fractureCount; fracture += 1) {
    const y = height * randomUnit(seed, 124_000 + fracture);
    const reach = width * (0.06 + a.mid * 0.2 + a.tapestry * 0.08);
    const jitter = unit * (0.006 + a.treble * 0.028);
    context.strokeStyle = rgba(fracture % 2 ? secondary : highlight, alpha * (0.2 + a.mid * 0.34));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.treble * 0.003));
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(reach * 0.45, y + jitter);
    context.lineTo(reach, y - jitter * 0.4);
    context.moveTo(width, height - y);
    context.lineTo(width - reach * 0.45, height - y - jitter);
    context.lineTo(width - reach, height - y + jitter * 0.4);
    context.stroke();
  }
  context.restore();
}

function drawBarcodeFoundry(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const barCount = Math.min(24, 7 + a.bassCount + a.midCount + Math.floor(a.trebleCount * 0.45));
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let bar = 0; bar < barCount; bar += 1) {
    const x = width * (bar + 0.5) / barCount;
    const fromTop = (bar + a.act) % 2 === 0;
    const widthFactor = randomUnit(seed, 124_300 + bar);
    const barWidth = Math.max(3, width / barCount * (0.2 + widthFactor * 0.62 + a.bass * 0.28));
    const travel = 0.5 + 0.5 * Math.sin(time * (0.13 + a.mid * 0.35) + bar * 0.83 + a.phrase * Math.PI * 2);
    const barHeight = height * (0.035 + a.bass * 0.12 + a.mid * 0.08 + travel * (0.04 + a.build * 0.08));
    const color = bar % 6 === 0 ? highlight : bar % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + a.bass * 0.36));
    context.fillRect(x - barWidth * 0.5, fromTop ? 0 : height - barHeight, barWidth, barHeight);
    if (a.treble > 0.12) {
      context.fillStyle = rgba(highlight, alpha * (0.16 + a.treble * 0.42));
      const stampY = fromTop ? barHeight : height - barHeight - unit * 0.006;
      context.fillRect(x - barWidth, stampY, barWidth * 2, Math.max(2, unit * 0.005));
    }
  }

  const pistonCount = Math.min(8, 2 + a.midCount + a.tapestryCount);
  for (let piston = 0; piston < pistonCount; piston += 1) {
    const fromRight = piston % 2 === 1;
    const y = height * (piston + 1) / (pistonCount + 1);
    const reach = width * (0.05 + a.mid * 0.15 + a.bass * 0.07);
    const head = unit * (0.014 + a.bass * 0.026);
    context.fillStyle = rgba(piston % 2 ? secondary : primary, alpha * (0.22 + a.mid * 0.36));
    context.fillRect(fromRight ? width - reach : 0, y, reach, Math.max(4, unit * (0.006 + a.bass * 0.01)));
    context.fillStyle = rgba(highlight, alpha * (0.18 + a.treble * 0.42));
    context.fillRect(fromRight ? width - reach - head : reach, y - head * 0.35, head, head);
  }

  if (a.tapestryCount > 0) {
    const scannerX = width * ((time * (0.08 + a.tapestry * 0.16) + a.progress) % 1);
    context.fillStyle = rgba(highlight, alpha * (0.1 + a.tapestry * 0.34));
    context.fillRect(scannerX, 0, Math.max(3, unit * (0.004 + a.treble * 0.004)), height);
  }
  context.restore();
}

function drawRecursivePortal(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const ringCount = Math.min(9, 3 + a.midCount + a.tapestryCount);
  const centerX = width * 0.5;
  const centerY = height * 0.45;
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let ring = 0; ring < ringCount; ring += 1) {
    const depth = (ring + 1) / (ringCount + 1);
    const pulse = Math.sin(time * (0.12 + a.mid * 0.2) + ring * 0.9) * a.mid * unit * 0.012;
    const halfWidth = width * (0.46 - depth * (0.24 + a.bass * 0.045)) + pulse;
    const halfHeight = height * (0.45 - depth * (0.23 + a.bass * 0.035)) + pulse * 0.7;
    const slab = unit * (0.012 + a.bass * 0.022 + depth * 0.01);
    const skew = Math.sin(time * 0.09 + ring + a.progress * Math.PI) * unit * (0.008 + a.mid * 0.026);
    const color = ring % 5 === 0 ? highlight : ring % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.09 + a.bass * 0.14 + a.mid * 0.12 + (1 - depth) * 0.12));

    polygon(context, [
      { x: centerX - halfWidth + skew, y: centerY - halfHeight },
      { x: centerX + halfWidth + skew * 0.3, y: centerY - halfHeight },
      { x: centerX + halfWidth - slab, y: centerY - halfHeight + slab },
      { x: centerX - halfWidth + slab, y: centerY - halfHeight + slab },
    ]);
    context.fill();
    polygon(context, [
      { x: centerX - halfWidth - skew * 0.3, y: centerY + halfHeight },
      { x: centerX + halfWidth - skew, y: centerY + halfHeight },
      { x: centerX + halfWidth - slab, y: centerY + halfHeight - slab },
      { x: centerX - halfWidth + slab, y: centerY + halfHeight - slab },
    ]);
    context.fill();
    polygon(context, [
      { x: centerX - halfWidth, y: centerY - halfHeight + slab },
      { x: centerX - halfWidth + slab, y: centerY - halfHeight + slab },
      { x: centerX - halfWidth + slab - skew * 0.3, y: centerY + halfHeight - slab },
      { x: centerX - halfWidth, y: centerY + halfHeight },
    ]);
    context.fill();
    polygon(context, [
      { x: centerX + halfWidth - slab, y: centerY - halfHeight + slab },
      { x: centerX + halfWidth, y: centerY - halfHeight },
      { x: centerX + halfWidth, y: centerY + halfHeight },
      { x: centerX + halfWidth - slab + skew * 0.3, y: centerY + halfHeight - slab },
    ]);
    context.fill();
    context.strokeStyle = rgba(ring % 2 ? primary : secondary, alpha * (0.16 + a.treble * 0.36));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.treble * 0.003));
    context.strokeRect(centerX - halfWidth, centerY - halfHeight, halfWidth * 2, halfHeight * 2);
  }

  if (a.tapestryCount > 0) {
    const packetCount = Math.min(8, a.trebleCount + a.tapestryCount);
    for (let packet = 0; packet < packetCount; packet += 1) {
      const depth = ((time * (0.05 + a.tapestry * 0.12) + randomUnit(seed, 124_900 + packet)) % 1);
      const x = centerX + (randomUnit(seed, 125_000 + packet) - 0.5) * width * (0.82 - depth * 0.58);
      const y = centerY + (randomUnit(seed, 125_100 + packet) - 0.5) * height * (0.78 - depth * 0.5);
      const size = unit * (0.004 + depth * 0.012 + a.treble * 0.006);
      context.fillStyle = rgba(packet % 3 === 0 ? highlight : packet % 2 ? secondary : primary, alpha * (0.18 + a.treble * 0.42));
      context.fillRect(x - size, y - size * 0.3, size * 2, size * 0.6);
    }
  }
  context.restore();
}

function drawHolographicTerrain(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const ridgeCount = Math.min(9, 3 + a.midCount + a.tapestryCount);
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let ridge = 0; ridge < ridgeCount; ridge += 1) {
    const depth = (ridge + 1) / (ridgeCount + 1);
    const mirrored = ridge % 3 === 2 && a.act >= 2;
    const baseY = mirrored ? 0 : height;
    const direction = mirrored ? 1 : -1;
    const ridgeHeight = height * (0.025 + depth * 0.12 + a.bass * 0.1 + a.build * 0.035);
    const points: Array<{ x: number; y: number }> = [{ x: 0, y: baseY }];
    for (let step = 0; step <= 12; step += 1) {
      const progress = step / 12;
      const seededPeak = randomUnit(seed + ridge * 101, 125_400 + step);
      const wave = Math.sin(progress * Math.PI * (3 + a.act) + time * (0.12 + a.mid * 0.26) + ridge) * 0.36;
      const peak = ridgeHeight * (0.4 + seededPeak * 0.42 + wave * a.mid + a.treble * (step % 3 === 0 ? 0.18 : 0));
      points.push({ x: width * progress, y: baseY + direction * peak });
    }
    points.push({ x: width, y: baseY });
    polygon(context, points);
    const color = ridge % 4 === 0 ? highlight : ridge % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.055 + a.bass * 0.08 + a.mid * 0.08 + (1 - depth) * 0.09));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.16 + a.treble * 0.4 + a.mid * 0.1));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.004));
    context.stroke();
  }

  const beaconCount = Math.min(9, 2 + a.bassCount + Math.floor(a.trebleCount * 0.45));
  for (let beacon = 0; beacon < beaconCount; beacon += 1) {
    const fromRight = beacon % 2 === 1;
    const x = fromRight
      ? width * (0.97 - randomUnit(seed, 125_800 + beacon) * 0.18)
      : width * (0.03 + randomUnit(seed, 125_800 + beacon) * 0.18);
    const heightValue = height * (0.04 + a.bass * 0.12 + randomUnit(seed, 125_900 + beacon) * 0.1);
    context.fillStyle = rgba(beacon % 3 === 0 ? highlight : beacon % 2 ? secondary : primary, alpha * (0.16 + a.treble * 0.38));
    context.fillRect(x, height - heightValue, Math.max(3, unit * (0.004 + a.bass * 0.007)), heightValue);
  }

  if (a.tapestryCount > 0) {
    const horizonY = height * (0.44 + Math.sin(time * 0.12 + a.phrase * Math.PI * 2) * 0.035);
    context.fillStyle = rgba(highlight, alpha * (0.08 + a.tapestry * 0.28));
    context.fillRect(width * 0.05, horizonY, width * 0.9, Math.max(2, unit * 0.004));
  }
  context.restore();
}

function drawKineticGlyphEngine(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const glyphCount = Math.min(18, 5 + a.bassCount + a.midCount + Math.floor(a.trebleCount * 0.55));
  const tick = Math.floor(time * (0.32 + a.treble * 4.6) + a.act * 13);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (let glyph = 0; glyph < glyphCount; glyph += 1) {
    const side = glyph % 4;
    const along = (Math.floor(glyph / 4) + 0.5) / Math.ceil(glyphCount / 4);
    const size = unit * (0.035 + randomUnit(seed, 126_200 + glyph) * 0.04 + a.bass * 0.035);
    const inset = unit * (0.025 + (glyph % 3) * 0.018 + a.mid * 0.02);
    const jitter = Math.sin(time * (0.24 + a.mid * 0.5) + glyph) * unit * a.mid * 0.018;
    let x = width * along;
    let y = height * along;
    if (side === 0) x = inset + jitter;
    if (side === 1) x = width - inset - jitter;
    if (side === 2) y = inset + jitter;
    if (side === 3) y = height - inset - jitter;
    const plateWidth = side < 2 ? size * 1.25 : size * 1.85;
    const plateHeight = side < 2 ? size * 1.25 : size;
    const color = glyph % 5 === 0 ? highlight : glyph % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.08 + a.bass * 0.18 + a.mid * 0.12));
    context.fillRect(x - plateWidth * 0.5, y - plateHeight * 0.5, plateWidth, plateHeight);
    context.strokeStyle = rgba(glyph % 2 ? primary : secondary, alpha * (0.18 + a.mid * 0.34));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.004));
    context.strokeRect(x - plateWidth * 0.5, y - plateHeight * 0.5, plateWidth, plateHeight);
    context.font = `900 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.fillStyle = rgba(color, alpha * (0.42 + a.treble * 0.46));
    const glyphValue = KINETIC_GLYPHS[(glyph * 5 + tick) % KINETIC_GLYPHS.length];
    context.fillText(glyphValue, x, y);
  }

  if (a.tapestryCount > 0) {
    const wordY = height * (0.16 + ((time * (0.035 + a.tapestry * 0.08) + a.progress) % 0.68));
    const tapestryGlyphCount = Math.min(11, 5 + a.tapestryCount * 2 + Math.floor(a.trebleCount * 0.35));
    const tapestryStep = width * 0.055;
    context.font = `900 ${Math.max(24, unit * (0.032 + a.bass * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.fillStyle = rgba(highlight, alpha * (0.1 + a.tapestry * 0.32));
    for (let glyph = 0; glyph < tapestryGlyphCount; glyph += 1) {
      const glyphValue = KINETIC_TAPESTRY_GLYPHS[(glyph * 3 + tick) % KINETIC_TAPESTRY_GLYPHS.length];
      const x = width * 0.5 + (glyph - (tapestryGlyphCount - 1) * 0.5) * tapestryStep;
      context.fillText(glyphValue, x, wordY + Math.sin(time * 0.8 + glyph) * unit * 0.006);
    }
  }
  context.restore();
}

function drawMechanicalIris(input: DrawExpandedRadioVisualMusicInput): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const bladeCount = Math.min(18, 8 + a.midCount + Math.min(2, a.tapestryCount));
  const centerX = width * 0.5;
  const centerY = height * 0.45;
  const innerRadius = unit * (0.205 + (1 - a.bass) * 0.035 + Math.sin(time * 0.18 + a.phrase * Math.PI * 2) * 0.008);
  const outerRadius = unit * (0.47 + a.bass * 0.045);
  const rotation = time * (0.045 + a.mid * 0.16) + a.progress * 0.42;
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const start = rotation + blade / bladeCount * Math.PI * 2;
    const end = rotation + (blade + 0.82) / bladeCount * Math.PI * 2;
    const twist = (0.08 + a.mid * 0.18 + a.act * 0.018) * (blade % 2 ? -1 : 1);
    const localOuter = outerRadius * (0.88 + randomUnit(seed, 126_700 + blade) * 0.12);
    polygon(context, [
      { x: centerX + Math.cos(start + twist) * innerRadius, y: centerY + Math.sin(start + twist) * innerRadius },
      { x: centerX + Math.cos(start) * localOuter, y: centerY + Math.sin(start) * localOuter },
      { x: centerX + Math.cos(end) * localOuter, y: centerY + Math.sin(end) * localOuter },
      { x: centerX + Math.cos(end - twist) * innerRadius, y: centerY + Math.sin(end - twist) * innerRadius },
    ]);
    const color = blade % 6 === 0 ? highlight : blade % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.08 + a.bass * 0.14 + a.mid * 0.12));
    context.fill();
    context.strokeStyle = rgba(blade % 2 ? primary : secondary, alpha * (0.2 + a.treble * 0.48));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.006));
    context.stroke();
  }

  const actuatorCount = Math.min(10, 2 + a.bassCount + Math.floor(a.trebleCount * 0.4));
  for (let actuator = 0; actuator < actuatorCount; actuator += 1) {
    const angle = rotation * -0.72 + actuator / actuatorCount * Math.PI * 2;
    const radius = outerRadius * 0.92;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    const size = unit * (0.008 + a.bass * 0.018);
    context.fillStyle = rgba(actuator % 3 === 0 ? highlight : actuator % 2 ? secondary : primary, alpha * (0.22 + a.treble * 0.42));
    context.fillRect(x - size, y - size * 0.35, size * 2, size * 0.7);
  }

  if (a.tapestryCount > 0) {
    context.strokeStyle = rgba(highlight, alpha * (0.12 + a.tapestry * 0.36));
    context.lineWidth = Math.max(2, unit * (0.002 + a.tapestry * 0.006));
    context.beginPath();
    context.arc(centerX, centerY, innerRadius * 1.05, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function drawExpandedRadioVisualMusicScene(
  scene: RadioVisualMusicScene,
  input: DrawExpandedRadioVisualMusicInput,
): boolean {
  if (input.mix < 0.002) return false;
  if (scene === "crt_signal_breach") drawCrtSignalBreach(input);
  else if (scene === "voxel_megacity") drawVoxelMegacity(input);
  else if (scene === "liquid_chrome") drawLiquidChrome(input);
  else if (scene === "cellular_takeover") drawCellularTakeover(input);
  else if (scene === "shattered_broadcast") drawShatteredBroadcast(input);
  else if (scene === "barcode_foundry") drawBarcodeFoundry(input);
  else if (scene === "recursive_portal") drawRecursivePortal(input);
  else if (scene === "holographic_terrain") drawHolographicTerrain(input);
  else if (scene === "kinetic_glyph_engine") drawKineticGlyphEngine(input);
  else if (scene === "mechanical_iris") drawMechanicalIris(input);
  else return false;
  return true;
}

function drawCrtSyncBands(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(14, plan.midElements + plan.trebleElements);
  for (let band = 0; band < count; band += 1) {
    const y = height * ((randomUnit(seed, 127_100 + band) + time * (0.025 + plan.trebleDrive * 0.09)) % 1);
    const reach = width * plan.reach * (0.38 + plan.midDrive * 0.62);
    const weight = Math.max(3, unit * plan.thickness * (0.36 + (band % 4 === 0 ? plan.bassDrive : 0.18)));
    context.fillStyle = rgba(band % 5 === 0 ? highlight : band % 2 ? secondary : primary, alpha * (0.46 + plan.trebleDrive * 0.4));
    context.fillRect(0, y, reach, weight);
    context.fillRect(width - reach, y + weight * 1.25, reach, weight);
  }
}

function drawVoxelSkyline(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(18, plan.bassElements + plan.midElements);
  for (let block = 0; block < count; block += 1) {
    const x = width * (block + 0.5) / count;
    const blockWidth = width / count * (0.28 + randomUnit(seed, 127_300 + block) * 0.58);
    const rise = unit * (0.018 + randomUnit(seed, 127_400 + block) * plan.reach * 0.68 + plan.bassDrive * 0.055);
    const color = block % 5 === 0 ? highlight : block % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.4 + plan.bassDrive * 0.34));
    context.fillRect(x - blockWidth * 0.5, height - rise, blockWidth, rise);
    if (block % 3 === 0) context.fillRect(x - blockWidth * 0.35, 0, blockWidth * 0.7, rise * 0.56);
  }
}

function drawLiquidMembranes(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(8, Math.max(3, Math.ceil(plan.midElements * 0.65)));
  for (let membrane = 0; membrane < count; membrane += 1) {
    const fromRight = membrane % 2 === 1;
    const edge = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    const y = height * (membrane + 0.5) / count;
    const reach = width * plan.reach * (0.42 + plan.midDrive * 0.58);
    const heightSpan = unit * (0.018 + plan.bassDrive * 0.025);
    const wave = Math.sin(time * (0.18 + plan.midDrive * 0.3) + membrane) * unit * 0.012;
    context.beginPath();
    context.moveTo(edge, y - heightSpan);
    context.bezierCurveTo(edge + direction * reach * 0.42, y - heightSpan + wave, edge + direction * reach, y - wave, edge + direction * reach, y);
    context.bezierCurveTo(edge + direction * reach, y + wave, edge + direction * reach * 0.42, y + heightSpan - wave, edge, y + heightSpan);
    context.closePath();
    const color = membrane % 4 === 0 ? highlight : membrane % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.28 + plan.midDrive * 0.26));
    context.fill();
    context.strokeStyle = rgba(membrane % 2 ? primary : highlight, alpha * (0.42 + plan.trebleDrive * 0.42));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * 0.42);
    context.stroke();
  }
}

function drawCellularColonies(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const size = unit * (0.018 + plan.bassDrive * 0.025);
  const count = Math.min(24, plan.bassElements + plan.midElements + plan.trebleElements);
  const tick = Math.floor(time * (0.4 + plan.trebleDrive * 2));
  for (let cell = 0; cell < count; cell += 1) {
    const localSeed = seed + tick * 41 + cell * 23;
    const side = cell % 4;
    const along = randomUnit(localSeed, 127_700 + cell);
    const depth = randomUnit(localSeed, 127_800 + cell) * unit * plan.reach * 0.7;
    const x = side === 0 ? depth : side === 1 ? width - depth - size : along * width;
    const y = side === 2 ? depth : side === 3 ? height - depth - size : along * height;
    const color = cell % 6 === 0 ? highlight : cell % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.36 + plan.midDrive * 0.36));
    context.fillRect(x, y, size, size);
  }
}

function drawShardPanels(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(18, plan.midElements + plan.trebleElements);
  for (let shard = 0; shard < count; shard += 1) {
    const side = shard % 4;
    const along = randomUnit(seed, 128_000 + shard);
    const reach = unit * plan.reach * (0.38 + randomUnit(seed, 128_100 + shard) * 0.62);
    const span = unit * (0.022 + randomUnit(seed, 128_200 + shard) * 0.06);
    const shift = Math.sin(time * (0.2 + plan.trebleDrive * 0.4) + shard) * unit * 0.008;
    let points: Array<{ x: number; y: number }>;
    if (side < 2) {
      const edge = side === 0 ? 0 : width;
      const direction = side === 0 ? 1 : -1;
      const y = along * height;
      points = [{ x: edge, y: y - span }, { x: edge + direction * reach, y: y + shift }, { x: edge, y: y + span }];
    } else {
      const edge = side === 2 ? 0 : height;
      const direction = side === 2 ? 1 : -1;
      const x = along * width;
      points = [{ x: x - span, y: edge }, { x: x + shift, y: edge + direction * reach }, { x: x + span, y: edge }];
    }
    polygon(context, points);
    const color = shard % 5 === 0 ? highlight : shard % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.3 + plan.bassDrive * 0.22));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.38 + plan.trebleDrive * 0.42));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * 0.38);
    context.stroke();
  }
}

function drawFoundryGates(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(12, plan.bassElements + plan.midElements);
  for (let gate = 0; gate < count; gate += 1) {
    const fromRight = gate % 2 === 1;
    const y = height * (gate + 1) / (count + 1);
    const reach = width * plan.reach * (0.42 + plan.midDrive * 0.58);
    const weight = Math.max(4, unit * plan.thickness * (0.54 + plan.bassDrive * 0.72));
    const color = gate % 4 === 0 ? highlight : gate % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.4 + plan.bassDrive * 0.34));
    context.fillRect(fromRight ? width - reach : 0, y, reach, weight);
    context.fillRect(fromRight ? width - reach - weight * 1.6 : reach, y - weight * 0.75, weight * 1.6, weight * 2.5);
  }
}

function drawPortalNotches(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(7, Math.max(3, plan.midElements));
  for (let frame = 0; frame < count; frame += 1) {
    const depth = (frame + 1) / (count + 1);
    const insetX = width * plan.reach * depth;
    const insetY = unit * plan.reach * depth;
    const notchX = width * plan.reach * (0.42 - depth * 0.08);
    const notchY = unit * plan.reach * (0.5 - depth * 0.08);
    const skew = Math.sin(time * 0.16 + frame) * unit * plan.midDrive * 0.006;
    const color = frame % 5 === 0 ? highlight : frame % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.38 + plan.midDrive * 0.34));
    context.lineWidth = Math.max(2, unit * plan.thickness * (0.38 + plan.bassDrive * 0.55));
    context.beginPath();
    context.moveTo(insetX + notchX + skew, insetY);
    context.lineTo(insetX + skew, insetY);
    context.lineTo(insetX, insetY + notchY);
    context.moveTo(width - insetX - notchX + skew, insetY);
    context.lineTo(width - insetX + skew, insetY);
    context.lineTo(width - insetX, insetY + notchY);
    context.moveTo(insetX, height - insetY - notchY);
    context.lineTo(insetX - skew, height - insetY);
    context.lineTo(insetX + notchX - skew, height - insetY);
    context.moveTo(width - insetX, height - insetY - notchY);
    context.lineTo(width - insetX - skew, height - insetY);
    context.lineTo(width - insetX - notchX - skew, height - insetY);
    context.stroke();
  }
}

function drawTerrainShelves(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(7, Math.max(3, Math.ceil(plan.midElements * 0.6)));
  for (let ridge = 0; ridge < count; ridge += 1) {
    const top = ridge % 2 === 1;
    const baseY = top ? 0 : height;
    const direction = top ? 1 : -1;
    const points: Array<{ x: number; y: number }> = [{ x: 0, y: baseY }];
    for (let step = 0; step <= 10; step += 1) {
      const progress = step / 10;
      const peak = unit * plan.reach * (0.2 + randomUnit(seed + ridge * 71, 128_800 + step) * 0.42 + plan.bassDrive * 0.22);
      const wave = Math.sin(time * 0.14 + step + ridge) * unit * plan.midDrive * 0.008;
      points.push({ x: width * progress, y: baseY + direction * (peak + wave) });
    }
    points.push({ x: width, y: baseY });
    polygon(context, points);
    const color = ridge % 4 === 0 ? highlight : ridge % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + plan.bassDrive * 0.18));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.34 + plan.trebleDrive * 0.4));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * 0.4);
    context.stroke();
  }
}

function drawGlyphMarquee(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(16, plan.midElements + plan.trebleElements);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${Math.max(16, unit * (0.022 + plan.bassDrive * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  for (let glyph = 0; glyph < count; glyph += 1) {
    const side = glyph % 4;
    const along = (Math.floor(glyph / 4) + 0.5) / Math.ceil(count / 4);
    const inset = unit * (0.018 + (glyph % 2) * 0.02);
    const x = side === 0 ? inset : side === 1 ? width - inset : width * along;
    const y = side === 2 ? inset : side === 3 ? height - inset : height * along;
    const color = glyph % 5 === 0 ? highlight : glyph % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.5 + plan.trebleDrive * 0.36));
    context.fillText(KINETIC_GLYPHS[(glyph * 3 + Math.floor(time * (1 + plan.trebleDrive * 4))) % KINETIC_GLYPHS.length], x, y);
  }
}

function drawIrisBlades(input: DrawExpandedRadioVisualPerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(16, Math.max(8, plan.midElements + plan.bassElements));
  const centerX = width * 0.5;
  const centerY = height * 0.45;
  const inner = unit * 0.39;
  const outer = Math.hypot(width, height) * 0.54;
  const rotation = time * (0.035 + plan.midDrive * 0.08);
  for (let blade = 0; blade < count; blade += 1) {
    const start = rotation + blade / count * Math.PI * 2;
    const end = rotation + (blade + 0.68) / count * Math.PI * 2;
    polygon(context, [
      { x: centerX + Math.cos(start) * inner, y: centerY + Math.sin(start) * inner },
      { x: centerX + Math.cos(start) * outer, y: centerY + Math.sin(start) * outer },
      { x: centerX + Math.cos(end) * outer, y: centerY + Math.sin(end) * outer },
      { x: centerX + Math.cos(end) * inner, y: centerY + Math.sin(end) * inner },
    ]);
    const color = blade % 6 === 0 ? highlight : blade % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.22 + plan.bassDrive * 0.2));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.28 + plan.trebleDrive * 0.4));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * 0.34);
    context.stroke();
  }
}

export function drawExpandedRadioVisualMusicPerimeter(
  input: DrawExpandedRadioVisualPerimeterInput,
): boolean {
  const { context, mix, drives, plan } = input;
  const alpha = clampVisualValue(mix * (0.82 + drives.presence * 0.16) * plan.strength * 1.14, 0, 0.94);
  context.save();
  context.globalCompositeOperation = "source-over";
  if (plan.motif === "crt_sync_bands") drawCrtSyncBands(input, alpha);
  else if (plan.motif === "voxel_skyline") drawVoxelSkyline(input, alpha);
  else if (plan.motif === "liquid_membranes") drawLiquidMembranes(input, alpha);
  else if (plan.motif === "cellular_colonies") drawCellularColonies(input, alpha);
  else if (plan.motif === "shard_panels") drawShardPanels(input, alpha);
  else if (plan.motif === "foundry_gates") drawFoundryGates(input, alpha);
  else if (plan.motif === "portal_notches") drawPortalNotches(input, alpha);
  else if (plan.motif === "terrain_shelves") drawTerrainShelves(input, alpha);
  else if (plan.motif === "glyph_marquee") drawGlyphMarquee(input, alpha);
  else if (plan.motif === "iris_blades") drawIrisBlades(input, alpha);
  else {
    context.restore();
    return false;
  }
  context.restore();
  return true;
}
