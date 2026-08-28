import { clampVisualValue } from "@/lib/radio-visuals-engine";
import type {
  RadioVisualAudioDrives,
  RadioVisualMusicPerimeterPlan,
  RadioVisualMusicScene,
  RadioVisualMusicSceneLayerPlan,
} from "@/lib/radio-visuals-engine";

export type RadioVisualExpansion40Rgb = [number, number, number];

interface DrawRadioVisualExpansion40Input {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  layerPlan: RadioVisualMusicSceneLayerPlan;
  primary: RadioVisualExpansion40Rgb;
  secondary: RadioVisualExpansion40Rgb;
  highlight: RadioVisualExpansion40Rgb;
  seed: number;
}

interface DrawRadioVisualExpansion40PerimeterInput {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  plan: RadioVisualMusicPerimeterPlan;
  primary: RadioVisualExpansion40Rgb;
  secondary: RadioVisualExpansion40Rgb;
  highlight: RadioVisualExpansion40Rgb;
  seed: number;
}

interface Expansion40Activity {
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

function rgba(color: RadioVisualExpansion40Rgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${clampVisualValue(alpha)})`;
}

function randomUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 2_213) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function activity(input: DrawRadioVisualExpansion40Input): Expansion40Activity {
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

function familyAlpha(input: DrawRadioVisualExpansion40Input): number {
  return clampVisualValue(input.mix * (0.74 + input.drives.presence * 0.2), 0, 0.96);
}

function polygon(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  if (points.length < 3) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y);
  context.closePath();
}

function drawMobiusRelay(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const bandSegmentCount = Math.min(36, 12 + a.midCount + a.trebleCount);
  const twistCount = 1 + Math.floor(a.progress * 2.8);
  const ribbonHalfWidth = unit * (0.018 + a.bass * 0.052);
  const relayPacketCount = Math.min(18, a.trebleCount + a.tapestryCount * 2);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusX = width * (0.24 + a.build * 0.08);
  const radiusY = height * (0.17 + a.mid * 0.05);
  const phase = time * (0.08 + a.mid * 0.16) + a.phrase * Math.PI * 2;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineJoin = "round";

  for (let segment = 0; segment < bandSegmentCount; segment += 1) {
    const angleA = phase + segment / bandSegmentCount * Math.PI * 2;
    const angleB = phase + (segment + 1) / bandSegmentCount * Math.PI * 2;
    const edgePoint = (angle: number, side: number) => {
      const twist = angle * twistCount * 0.5;
      const widthOffset = side * ribbonHalfWidth * Math.cos(twist);
      const depthOffset = side * ribbonHalfWidth * Math.sin(twist);
      return {
        x: centerX + (radiusX + widthOffset) * Math.cos(angle),
        y: centerY + (radiusY + widthOffset * 0.45) * Math.sin(angle) + depthOffset * 0.62,
        depth: Math.sin(angle) + depthOffset / Math.max(1, ribbonHalfWidth),
      };
    };
    const aOuter = edgePoint(angleA, 1);
    const bOuter = edgePoint(angleB, 1);
    const bInner = edgePoint(angleB, -1);
    const aInner = edgePoint(angleA, -1);
    const depth = clampVisualValue(0.35 + (aOuter.depth + 2) * 0.18);
    polygon(context, [aOuter, bOuter, bInner, aInner]);
    context.fillStyle = rgba(segment % 5 === 0 ? highlight : segment % 2 ? secondary : primary, alpha * (0.16 + depth * 0.34));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.12 + a.treble * 0.28));
    context.lineWidth = Math.max(1, unit * (0.001 + a.bass * 0.0025));
    context.stroke();
  }

  for (let packet = 0; packet < relayPacketCount; packet += 1) {
    const angle = phase + (packet / Math.max(1, relayPacketCount) + time * 0.012) * Math.PI * 2;
    const twist = angle * twistCount * 0.5;
    const offset = Math.cos(twist) * ribbonHalfWidth * 0.75;
    const x = centerX + (radiusX + offset) * Math.cos(angle);
    const y = centerY + (radiusY + offset * 0.45) * Math.sin(angle) + Math.sin(twist) * ribbonHalfWidth * 0.5;
    const size = unit * (0.003 + a.treble * 0.008 + (packet % 5 === 0 ? a.tapestry * 0.006 : 0));
    context.fillStyle = rgba(packet % 4 === 0 ? highlight : packet % 2 ? primary : secondary, alpha * (0.32 + a.treble * 0.5));
    context.fillRect(x - size, y - size, size * 2, size * 2);
  }
  context.restore();
}

function drawPendulumChoir(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const pendulumCount = Math.min(24, 6 + a.bassCount + a.midCount);
  const phaseSpread = 0.18 + a.progress * 0.72;
  const bobRadius = unit * (0.008 + a.bass * 0.026);
  const strikeCount = Math.min(pendulumCount, a.trebleCount);
  const anchorY = height * (0.12 + (1 - a.progress) * 0.04);
  const bobs: Array<{ x: number; y: number }> = [];
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = rgba(highlight, alpha * (0.16 + a.mid * 0.28));
  context.lineWidth = Math.max(2, unit * (0.0015 + a.bass * 0.002));
  context.beginPath();
  context.moveTo(width * 0.08, anchorY);
  context.lineTo(width * 0.92, anchorY);
  context.stroke();

  for (let pendulum = 0; pendulum < pendulumCount; pendulum += 1) {
    const x = width * (pendulum + 1) / (pendulumCount + 1);
    const normalized = pendulum / Math.max(1, pendulumCount - 1);
    const length = height * (0.28 + randomUnit(seed, 152_100 + pendulum) * 0.3 + a.progress * 0.08);
    const frequency = 0.42 + normalized * phaseSpread;
    const swing = Math.sin(time * frequency + pendulum * phaseSpread + a.phrase * Math.PI * 2) * (0.08 + a.mid * 0.32);
    const bobX = x + Math.sin(swing) * length;
    const bobY = anchorY + Math.cos(swing) * length;
    bobs.push({ x: bobX, y: bobY });
    const color = pendulum % 5 === 0 ? highlight : pendulum % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.18 + a.mid * 0.38));
    context.lineWidth = Math.max(1, unit * (0.001 + a.mid * 0.002));
    context.beginPath();
    context.moveTo(x, anchorY);
    context.lineTo(bobX, bobY);
    context.stroke();
    context.fillStyle = rgba(color, alpha * (0.28 + a.bass * 0.46));
    context.beginPath();
    context.arc(bobX, bobY, bobRadius * (0.72 + randomUnit(seed, 152_300 + pendulum) * 0.56), 0, Math.PI * 2);
    context.fill();
  }

  if (a.tapestryCount > 0 && bobs.length > 1) {
    context.strokeStyle = rgba(highlight, alpha * (0.14 + a.tapestry * 0.44));
    context.lineWidth = Math.max(1.5, unit * (0.0014 + a.tapestry * 0.003));
    context.beginPath();
    context.moveTo(bobs[0].x, bobs[0].y);
    for (let index = 1; index < bobs.length; index += 1) context.lineTo(bobs[index].x, bobs[index].y);
    context.stroke();
  }

  for (let strike = 0; strike < strikeCount; strike += 1) {
    const bob = bobs[(strike * 5) % Math.max(1, bobs.length)];
    const size = bobRadius * (1.5 + a.treble * 2.2);
    context.strokeStyle = rgba(highlight, alpha * (0.26 + a.treble * 0.5));
    context.lineWidth = Math.max(1, unit * 0.0012);
    context.beginPath();
    context.moveTo(bob.x - size, bob.y);
    context.lineTo(bob.x + size, bob.y);
    context.moveTo(bob.x, bob.y - size);
    context.lineTo(bob.x, bob.y + size);
    context.stroke();
  }
  context.restore();
}

function drawChladniForge(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const nodalGrainCount = Math.min(120, 20 + a.midCount * 2 + a.trebleCount * 3);
  const nodalModeX = 2 + a.act;
  const nodalModeY = 3 + Math.floor(a.progress * 3);
  const resonancePlateInset = unit * (0.08 + (1 - a.build) * 0.025);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusX = width * 0.5 - resonancePlateInset;
  const radiusY = height * 0.5 - resonancePlateInset;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = rgba(a.bass > 0.45 ? highlight : primary, alpha * (0.22 + a.bass * 0.38));
  context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.007));
  context.strokeRect(resonancePlateInset, resonancePlateInset, width - resonancePlateInset * 2, height - resonancePlateInset * 2);

  for (let grain = 0; grain < nodalGrainCount; grain += 1) {
    const mode = 1 + grain % Math.max(1, Math.min(5, a.midCount));
    const angle = randomUnit(seed, 153_100 + grain) * Math.PI * 2 + time * (0.008 + a.treble * 0.025);
    const lobe = 0.24 + 0.62 * Math.abs(Math.cos(angle * (nodalModeX + mode * 0.18) + a.phrase * Math.PI));
    const crossMode = 0.78 + Math.sin(angle * nodalModeY + time * 0.12) * 0.18;
    const scatter = (randomUnit(seed, 153_500 + grain) - 0.5) * (1 - a.build) * unit * 0.06;
    const x = centerX + Math.cos(angle) * radiusX * lobe * crossMode + scatter;
    const y = centerY + Math.sin(angle) * radiusY * lobe / Math.max(0.55, crossMode) - scatter * 0.4;
    const size = unit * (0.0018 + randomUnit(seed, 153_900 + grain) * 0.003 + a.treble * 0.0035);
    const color = grain % 7 === 0 ? highlight : grain % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.22 + a.treble * 0.5));
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  if (a.tapestryCount > 0) {
    context.strokeStyle = rgba(highlight, alpha * (0.16 + a.tapestry * 0.4));
    context.lineWidth = Math.max(1.5, unit * (0.001 + a.bass * 0.003));
    const nodalContourCount = Math.min(5, a.tapestryCount + 1);
    for (let contour = 0; contour < nodalContourCount; contour += 1) {
      const contourScale = 0.78 - contour * 0.085;
      const contourPhase = contour * Math.PI / Math.max(2, nodalContourCount);
      context.beginPath();
      for (let sample = 0; sample <= 96; sample += 1) {
        const angle = sample / 96 * Math.PI * 2;
        const x = centerX + Math.sin(angle * nodalModeX + contourPhase) * radiusX * contourScale;
        const y = centerY + Math.sin(angle * nodalModeY + time * 0.04) * radiusY * contourScale;
        if (sample === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  context.restore();
}

function drawTesseractFold(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const hypercubeVertexCount = 16;
  const hypercubeEdgeCount = Math.min(32, 10 + a.midCount + a.trebleCount);
  const foldAngle = time * (0.08 + a.mid * 0.18) + a.progress * Math.PI * 1.5;
  const dimensionGateCount = Math.min(6, a.tapestryCount);
  const vertices: Array<{ x: number; y: number; depth: number }> = [];
  const size = unit * (0.19 + a.bass * 0.065 + a.progress * 0.045);
  for (let vertex = 0; vertex < hypercubeVertexCount; vertex += 1) {
    let x = vertex & 1 ? 1 : -1;
    let y = vertex & 2 ? 1 : -1;
    let z = vertex & 4 ? 1 : -1;
    let w = vertex & 8 ? 1 : -1;
    const xwX = x * Math.cos(foldAngle) - w * Math.sin(foldAngle);
    const xwW = x * Math.sin(foldAngle) + w * Math.cos(foldAngle);
    const yzY = y * Math.cos(foldAngle * 0.63) - z * Math.sin(foldAngle * 0.63);
    const yzZ = y * Math.sin(foldAngle * 0.63) + z * Math.cos(foldAngle * 0.63);
    x = xwX;
    w = xwW;
    y = yzY;
    z = yzZ;
    const fourScale = 1 / (2.8 - w * 0.52);
    const perspective = 1 / (2.4 - z * fourScale * 0.7);
    vertices.push({
      x: width * 0.5 + x * size * fourScale * perspective * 3.6,
      y: height * 0.5 + y * size * fourScale * perspective * 3.6,
      depth: clampVisualValue((z + w + 2) / 4),
    });
  }

  context.save();
  context.globalCompositeOperation = "source-over";
  let edge = 0;
  for (let from = 0; from < hypercubeVertexCount && edge < hypercubeEdgeCount; from += 1) {
    for (let bit = 0; bit < 4 && edge < hypercubeEdgeCount; bit += 1) {
      const to = from ^ (1 << bit);
      if (to < from) continue;
      const depth = (vertices[from].depth + vertices[to].depth) * 0.5;
      context.strokeStyle = rgba(bit === 3 ? highlight : bit % 2 ? secondary : primary, alpha * (0.14 + depth * 0.42 + a.mid * 0.14));
      context.lineWidth = Math.max(1, unit * (0.001 + a.bass * 0.003 + depth * 0.0015));
      context.beginPath();
      context.moveTo(vertices[from].x, vertices[from].y);
      context.lineTo(vertices[to].x, vertices[to].y);
      context.stroke();
      edge += 1;
    }
  }
  for (let vertex = 0; vertex < Math.min(hypercubeVertexCount, 4 + a.trebleCount); vertex += 1) {
    const point = vertices[(vertex * 5) % hypercubeVertexCount];
    const radius = unit * (0.0025 + a.treble * 0.007 + point.depth * 0.003);
    context.fillStyle = rgba(vertex % 4 === 0 ? highlight : vertex % 2 ? secondary : primary, alpha * (0.28 + a.treble * 0.48));
    context.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  }
  for (let gate = 0; gate < dimensionGateCount; gate += 1) {
    const inset = unit * (0.055 + gate * 0.025);
    context.strokeStyle = rgba(gate % 2 ? secondary : highlight, alpha * (0.1 + a.tapestry * 0.28));
    context.lineWidth = Math.max(1, unit * 0.0012);
    context.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }
  context.restore();
}

function drawKintsugiMainframe(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const mainframePlateCount = Math.min(12, 4 + a.bassCount);
  const repairSeamCount = Math.min(16, 3 + a.midCount);
  const seamClosure = clampVisualValue(a.progress * 0.82 + a.tapestry * 0.18);
  const plateOffset = unit * (0.018 + (1 - seamClosure) * 0.055 + a.bass * 0.012);
  const columns = 3;
  const rows = Math.ceil(mainframePlateCount / columns);
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let plate = 0; plate < mainframePlateCount; plate += 1) {
    const column = plate % columns;
    const row = Math.floor(plate / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const driftX = (randomUnit(seed, 155_100 + plate) - 0.5) * plateOffset * 2;
    const driftY = (randomUnit(seed, 155_300 + plate) - 0.5) * plateOffset * 2;
    const left = column * cellWidth + plateOffset * 0.45 + driftX;
    const top = row * cellHeight + plateOffset * 0.45 + driftY;
    const right = (column + 1) * cellWidth - plateOffset * 0.45 + driftX;
    const bottom = (row + 1) * cellHeight - plateOffset * 0.45 + driftY;
    const notch = unit * (0.012 + randomUnit(seed, 155_500 + plate) * 0.03);
    polygon(context, [
      { x: left + notch, y: top },
      { x: right, y: top + notch * 0.4 },
      { x: right - notch * 0.3, y: bottom },
      { x: left, y: bottom - notch },
    ]);
    const color = plate % 5 === 0 ? highlight : plate % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.08 + a.bass * 0.2));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.18 + a.bass * 0.34));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.006));
    context.stroke();
  }

  context.lineCap = "round";
  for (let seam = 0; seam < repairSeamCount; seam += 1) {
    const vertical = seam % 2 === 0;
    const startX = vertical ? width * (0.18 + randomUnit(seed, 155_900 + seam) * 0.64) : 0;
    const startY = vertical ? 0 : height * (0.16 + randomUnit(seed, 156_100 + seam) * 0.68);
    const segments = 4 + (seam % 4);
    context.strokeStyle = rgba(seam % 4 === 0 ? highlight : seam % 2 ? primary : secondary, alpha * (0.28 + a.mid * 0.44));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.0035 + seamClosure * 0.002));
    context.beginPath();
    context.moveTo(startX, startY);
    for (let segment = 1; segment <= segments; segment += 1) {
      const progress = segment / segments;
      const jitter = (randomUnit(seed, 156_300 + seam * 11 + segment) - 0.5) * unit * 0.06;
      context.lineTo(vertical ? startX + jitter : width * progress, vertical ? height * progress : startY + jitter);
    }
    context.stroke();
  }
  context.restore();
}

function drawSonicCalligraphy(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const brushStrokeCount = Math.min(11, 2 + Math.ceil(a.midCount * 0.55));
  const strokeMomentum = 0.35 + a.progress * 0.75 + a.mid * 0.45;
  const inkPoolCount = Math.min(8, a.bassCount);
  const flickCount = Math.min(24, a.trebleCount);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let stroke = 0; stroke < brushStrokeCount; stroke += 1) {
    const fromLeft = stroke % 2 === 0;
    const x1 = width * (fromLeft ? 0.08 : 0.92);
    const y1 = height * (0.12 + randomUnit(seed, 157_100 + stroke) * 0.76);
    const x2 = width * (fromLeft ? 0.92 : 0.08);
    const y2 = height * (0.12 + randomUnit(seed, 157_300 + stroke) * 0.76);
    const bow = (randomUnit(seed, 157_500 + stroke) - 0.5) * height * 0.52 * strokeMomentum;
    const color = stroke % 5 === 0 ? highlight : stroke % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.16 + a.mid * 0.42));
    context.lineWidth = Math.max(2, unit * (0.004 + a.bass * 0.027) * (0.7 + randomUnit(seed, 157_700 + stroke) * 0.6));
    context.beginPath();
    context.moveTo(x1, y1);
    context.bezierCurveTo(
      width * (fromLeft ? 0.28 : 0.72), y1 + bow + Math.sin(time * 0.18 + stroke) * unit * a.mid * 0.025,
      width * (fromLeft ? 0.72 : 0.28), y2 - bow,
      x2, y2,
    );
    context.stroke();
  }

  for (let pool = 0; pool < inkPoolCount; pool += 1) {
    const x = width * randomUnit(seed, 157_900 + pool);
    const y = height * randomUnit(seed, 158_100 + pool);
    const radius = unit * (0.009 + a.bass * 0.027) * (0.7 + randomUnit(seed, 158_300 + pool) * 0.8);
    context.fillStyle = rgba(pool % 4 === 0 ? highlight : pool % 2 ? secondary : primary, alpha * (0.18 + a.bass * 0.34));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let flick = 0; flick < flickCount; flick += 1) {
    const x = width * randomUnit(seed, 158_500 + flick);
    const y = height * randomUnit(seed, 158_700 + flick);
    const angle = randomUnit(seed, 158_900 + flick) * Math.PI * 2 + time * 0.04;
    const length = unit * (0.008 + a.treble * 0.045);
    context.strokeStyle = rgba(flick % 5 === 0 ? highlight : flick % 2 ? primary : secondary, alpha * (0.24 + a.treble * 0.5));
    context.lineWidth = Math.max(1, unit * (0.0008 + a.treble * 0.0018));
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
  context.restore();
}

function drawGear(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  teeth: number,
  rotation: number,
): void {
  context.beginPath();
  for (let point = 0; point < teeth * 2; point += 1) {
    const angle = rotation + point / (teeth * 2) * Math.PI * 2;
    const currentRadius = point % 2 === 0 ? radius : radius * 0.78;
    const px = x + Math.cos(angle) * currentRadius;
    const py = y + Math.sin(angle) * currentRadius;
    if (point === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function drawRubeSignalworks(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const gearCount = Math.min(10, 3 + Math.ceil(a.bassCount * 0.55));
  const pistonCount = Math.min(8, 2 + Math.ceil(a.midCount * 0.4));
  const carrierCount = Math.min(18, a.trebleCount);
  const chainReactionIndex = Math.floor((time * (0.32 + a.mid * 0.7) + a.progress * 4) % Math.max(1, gearCount + pistonCount));
  const gearPoints: Array<{ x: number; y: number; radius: number }> = [];
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let gear = 0; gear < gearCount; gear += 1) {
    const lane = gear % 2;
    const x = width * (0.12 + gear / Math.max(1, gearCount - 1) * 0.76);
    const y = height * (lane ? 0.63 : 0.34) + Math.sin(gear * 1.7) * unit * 0.035;
    const radius = unit * (0.025 + a.bass * 0.025 + randomUnit(seed, 159_100 + gear) * 0.018);
    gearPoints.push({ x, y, radius });
    drawGear(context, x, y, radius, 7 + gear % 5, time * (lane ? -0.18 : 0.18) * (1 + a.mid) + gear);
    const color = gear % 5 === 0 ? highlight : gear % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.1 + a.bass * 0.22));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.26 + a.bass * 0.38));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.003));
    context.stroke();
    context.beginPath();
    context.arc(x, y, radius * 0.22, 0, Math.PI * 2);
    context.stroke();
  }

  context.strokeStyle = rgba(highlight, alpha * (0.16 + a.mid * 0.36));
  context.lineWidth = Math.max(2, unit * (0.0015 + a.bass * 0.003));
  for (let link = 1; link < gearPoints.length; link += 1) {
    context.beginPath();
    context.moveTo(gearPoints[link - 1].x, gearPoints[link - 1].y);
    context.lineTo(gearPoints[link].x, gearPoints[link].y);
    context.stroke();
  }

  for (let piston = 0; piston < pistonCount; piston += 1) {
    const y = height * (0.12 + (piston + 0.5) / pistonCount * 0.76);
    const fromRight = piston % 2 === 1;
    const travel = width * (0.08 + a.mid * 0.11) * (0.5 + 0.5 * Math.sin(time * (0.38 + a.mid * 0.6) + piston));
    const edge = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    context.strokeStyle = rgba(piston % 3 === 0 ? highlight : piston % 2 ? secondary : primary, alpha * (0.22 + a.mid * 0.38));
    context.lineWidth = Math.max(3, unit * (0.003 + a.bass * 0.006));
    context.beginPath();
    context.moveTo(edge, y);
    context.lineTo(edge + direction * travel, y);
    context.stroke();
    context.fillStyle = rgba(highlight, alpha * (0.24 + a.treble * 0.42));
    context.fillRect(edge + direction * travel - unit * 0.008, y - unit * 0.012, unit * 0.016, unit * 0.024);
  }

  for (let carrier = 0; carrier < carrierCount; carrier += 1) {
    const progress = (carrier / Math.max(1, carrierCount) + time * (0.018 + a.treble * 0.05)) % 1;
    const x = width * (0.08 + progress * 0.84);
    const y = height * (carrier % 2 ? 0.78 : 0.22);
    const size = unit * (0.004 + a.treble * 0.008 + (carrier === chainReactionIndex ? a.tapestry * 0.012 : 0));
    context.fillStyle = rgba(carrier === chainReactionIndex ? highlight : carrier % 2 ? secondary : primary, alpha * (0.3 + a.treble * 0.46));
    context.fillRect(x - size, y - size, size * 2, size * 2);
  }
  context.restore();
}

function drawShadowZoetrope(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const frameCount = Math.min(22, 6 + a.midCount + Math.ceil(a.trebleCount * 0.35));
  const drumPhase = time * (0.1 + a.mid * 0.34) + a.progress * Math.PI * 2;
  const silhouetteStep = Math.floor((drumPhase / (Math.PI * 2) * frameCount) % frameCount);
  const strobeWindowCount = Math.min(frameCount, 3 + a.trebleCount);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusX = width * (0.31 + a.bass * 0.035);
  const radiusY = height * (0.25 + a.bass * 0.025);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = rgba(primary, alpha * (0.24 + a.bass * 0.4));
  context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.006));
  context.beginPath();
  context.ellipse(centerX, centerY - radiusY, radiusX, radiusY * 0.24, 0, 0, Math.PI * 2);
  context.ellipse(centerX, centerY + radiusY, radiusX, radiusY * 0.24, 0, 0, Math.PI * 2);
  context.stroke();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const angle = drumPhase + frame / frameCount * Math.PI * 2;
    const depth = (Math.sin(angle) + 1) * 0.5;
    const x = centerX + Math.cos(angle) * radiusX;
    const frameWidth = unit * (0.01 + depth * 0.02);
    const frameHeight = radiusY * (0.58 + depth * 0.5);
    const activeFrame = (frame + silhouetteStep) % frameCount;
    const color = activeFrame % 5 === 0 ? highlight : activeFrame % 2 ? secondary : primary;
    context.fillStyle = rgba([4, 4, 7], alpha * (0.18 + depth * 0.48));
    context.fillRect(x - frameWidth * 0.5, centerY - frameHeight * 0.5, frameWidth, frameHeight);
    if (frame < strobeWindowCount) {
      const pose = activeFrame % 4;
      const poseY = centerY + Math.sin(angle) * radiusY * 0.18;
      const scale = unit * (0.008 + depth * 0.014);
      context.fillStyle = rgba(color, alpha * (0.22 + a.treble * 0.44) * (0.5 + depth * 0.5));
      polygon(context, [
        { x: x, y: poseY - scale * (2 + pose * 0.2) },
        { x: x + scale * (1.4 + pose * 0.18), y: poseY },
        { x: x + scale * (pose % 2 ? 0.2 : 0.8), y: poseY + scale * 2 },
        { x: x - scale * (pose % 2 ? 0.8 : 0.2), y: poseY + scale * 2 },
        { x: x - scale * (1.4 + pose * 0.18), y: poseY },
      ]);
      context.fill();
    }
  }
  if (a.tapestryCount > 0) {
    context.strokeStyle = rgba(highlight, alpha * (0.16 + a.tapestry * 0.42));
    context.lineWidth = Math.max(1.5, unit * (0.001 + a.tapestry * 0.003));
    context.strokeRect(centerX - radiusX, centerY - radiusY, radiusX * 2, radiusY * 2);
  }
  context.restore();
}

function drawPrismLabyrinth(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const prismCount = Math.min(10, 2 + Math.ceil(a.bassCount * 0.35) + Math.ceil(a.midCount * 0.35));
  const rayBranchCount = Math.min(20, 2 + a.trebleCount);
  const refractionDepth = 0.26 + a.mid * 0.58 + a.progress * 0.16;
  const labyrinthTurnCount = Math.min(12, 3 + a.midCount);
  const prisms: Array<{ x: number; y: number; size: number; rotation: number }> = [];
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let prism = 0; prism < prismCount; prism += 1) {
    const column = prism % 3;
    const row = Math.floor(prism / 3);
    const x = width * (0.22 + column * 0.28 + (randomUnit(seed, 160_100 + prism) - 0.5) * 0.08);
    const y = height * (0.16 + row / Math.max(1, Math.ceil(prismCount / 3)) * 0.7 + randomUnit(seed, 160_300 + prism) * 0.08);
    const size = unit * (0.028 + a.bass * 0.024 + randomUnit(seed, 160_500 + prism) * 0.022);
    const rotation = time * 0.025 * (prism % 2 ? -1 : 1) + randomUnit(seed, 160_700 + prism) * Math.PI;
    prisms.push({ x, y, size, rotation });
    polygon(context, Array.from({ length: 3 }, (_, point) => ({
      x: x + Math.cos(rotation + point / 3 * Math.PI * 2) * size,
      y: y + Math.sin(rotation + point / 3 * Math.PI * 2) * size,
    })));
    const color = prism % 5 === 0 ? highlight : prism % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.08 + a.bass * 0.18));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.24 + a.mid * 0.42));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.003));
    context.stroke();
  }

  for (let branch = 0; branch < rayBranchCount; branch += 1) {
    let x = branch % 2 ? width : 0;
    let y = height * ((branch + 0.5) / Math.max(1, rayBranchCount));
    context.strokeStyle = rgba(branch % 5 === 0 ? highlight : branch % 2 ? secondary : primary, alpha * (0.18 + a.treble * 0.46));
    context.lineWidth = Math.max(1, unit * (0.0009 + a.treble * 0.0022));
    context.beginPath();
    context.moveTo(x, y);
    for (let turn = 0; turn < labyrinthTurnCount; turn += 1) {
      const prism = prisms[(branch + turn * 2) % Math.max(1, prisms.length)];
      const direction = branch % 2 ? -1 : 1;
      x = prism.x + direction * prism.size * (0.2 + refractionDepth * 0.35);
      y = prism.y + Math.sin(branch * 1.3 + turn + time * 0.08) * prism.size * refractionDepth;
      context.lineTo(x, y);
      if (turn >= 2 + a.act) break;
    }
    context.stroke();
  }
  if (a.tapestryCount > 0) {
    context.strokeStyle = rgba(highlight, alpha * (0.14 + a.tapestry * 0.42));
    context.lineWidth = Math.max(2, unit * (0.0015 + a.tapestry * 0.003));
    context.beginPath();
    context.moveTo(0, height * 0.5);
    for (const prism of prisms) context.lineTo(prism.x, prism.y);
    context.lineTo(width, height * 0.5);
    context.stroke();
  }
  context.restore();
}

function drawHelixSequencer(input: DrawRadioVisualExpansion40Input): void {
  const { context, width, height, time, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const helixRungCount = Math.min(30, 8 + a.midCount + a.trebleCount);
  const strandTurnCount = 2 + a.progress * 3.2;
  const sequencePacketCount = Math.min(18, a.trebleCount + a.tapestryCount);
  const depthPhase = time * (0.12 + a.mid * 0.26) + a.phrase * Math.PI * 2;
  const centerX = width * 0.5;
  const top = height * 0.1;
  const span = height * 0.8;
  const radius = width * (0.12 + a.bass * 0.05);
  const rungs: Array<{ ax: number; bx: number; y: number; depth: number; index: number }> = [];
  for (let rung = 0; rung < helixRungCount; rung += 1) {
    const progress = rung / Math.max(1, helixRungCount - 1);
    const phase = depthPhase + progress * Math.PI * 2 * strandTurnCount;
    const offset = Math.sin(phase) * radius;
    rungs.push({ ax: centerX + offset, bx: centerX - offset, y: top + progress * span, depth: Math.cos(phase), index: rung });
  }
  context.save();
  context.globalCompositeOperation = "source-over";
  for (const rung of [...rungs].sort((left, right) => left.depth - right.depth)) {
    const depth = (rung.depth + 1) * 0.5;
    context.strokeStyle = rgba(rung.index % 5 === 0 ? highlight : rung.index % 2 ? secondary : primary, alpha * (0.12 + depth * 0.36 + a.mid * 0.12));
    context.lineWidth = Math.max(1, unit * (0.001 + a.bass * 0.003 + depth * 0.0015));
    context.beginPath();
    context.moveTo(rung.ax, rung.y);
    context.lineTo(rung.bx, rung.y);
    context.stroke();
  }
  for (let strand = 0; strand < 2; strand += 1) {
    context.strokeStyle = rgba(strand ? secondary : primary, alpha * (0.3 + a.bass * 0.38));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.007));
    context.beginPath();
    for (let point = 0; point <= 72; point += 1) {
      const progress = point / 72;
      const phase = depthPhase + progress * Math.PI * 2 * strandTurnCount + strand * Math.PI;
      const x = centerX + Math.sin(phase) * radius;
      const y = top + progress * span;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  for (let packet = 0; packet < sequencePacketCount; packet += 1) {
    const rung = rungs[(packet * 7 + Math.floor(time * (1 + a.treble * 3))) % Math.max(1, rungs.length)];
    const travel = (time * (0.18 + a.treble * 0.45) + packet * 0.17) % 1;
    const x = rung.ax + (rung.bx - rung.ax) * travel;
    const size = unit * (0.003 + a.treble * 0.008 + (packet % 5 === 0 ? a.tapestry * 0.006 : 0));
    context.fillStyle = rgba(packet % 5 === 0 ? highlight : packet % 2 ? secondary : primary, alpha * (0.3 + a.treble * 0.5));
    context.fillRect(x - size, rung.y - size, size * 2, size * 2);
  }
  context.restore();
}

export function drawRadioVisualMusicExpansion40Scene(
  scene: RadioVisualMusicScene,
  input: DrawRadioVisualExpansion40Input,
): boolean {
  if (input.mix < 0.002) return false;
  if (scene === "mobius_relay") drawMobiusRelay(input);
  else if (scene === "pendulum_choir") drawPendulumChoir(input);
  else if (scene === "chladni_forge") drawChladniForge(input);
  else if (scene === "tesseract_fold") drawTesseractFold(input);
  else if (scene === "kintsugi_mainframe") drawKintsugiMainframe(input);
  else if (scene === "sonic_calligraphy") drawSonicCalligraphy(input);
  else if (scene === "rube_signalworks") drawRubeSignalworks(input);
  else if (scene === "shadow_zoetrope") drawShadowZoetrope(input);
  else if (scene === "prism_labyrinth") drawPrismLabyrinth(input);
  else if (scene === "helix_sequencer") drawHelixSequencer(input);
  else return false;
  return true;
}

function perimeterPoint(progress: number, width: number, height: number, inset: number): { x: number; y: number } {
  const innerWidth = Math.max(1, width - inset * 2);
  const innerHeight = Math.max(1, height - inset * 2);
  const perimeter = (innerWidth + innerHeight) * 2;
  let distance = (((progress % 1) + 1) % 1) * perimeter;
  if (distance <= innerWidth) return { x: inset + distance, y: inset };
  distance -= innerWidth;
  if (distance <= innerHeight) return { x: width - inset, y: inset + distance };
  distance -= innerHeight;
  if (distance <= innerWidth) return { x: width - inset - distance, y: height - inset };
  distance -= innerWidth;
  return { x: inset, y: height - inset - distance };
}

function drawMobiusTwists(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(18, plan.midElements + plan.trebleElements);
  for (let twist = 0; twist < count; twist += 1) {
    const base = perimeterPoint((twist + 0.5) / Math.max(1, count), width, height, 0);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const length = unit * plan.reach * (0.34 + plan.midDrive * 0.66);
    const dx = centerX - base.x;
    const dy = centerY - base.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / distance;
    const ny = dy / distance;
    const tx = -ny;
    const ty = nx;
    const crossing = Math.sin(time * 0.18 + twist) * unit * 0.01;
    const color = twist % 5 === 0 ? highlight : twist % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.3 + plan.midDrive * 0.38));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.28 + plan.bassDrive * 0.56));
    context.beginPath();
    context.moveTo(base.x + tx * crossing, base.y + ty * crossing);
    context.quadraticCurveTo(base.x + nx * length * 0.5 - tx * crossing, base.y + ny * length * 0.5 - ty * crossing, base.x + nx * length, base.y + ny * length);
    context.moveTo(base.x - tx * crossing, base.y - ty * crossing);
    context.quadraticCurveTo(base.x + nx * length * 0.5 + tx * crossing, base.y + ny * length * 0.5 + ty * crossing, base.x + nx * length, base.y + ny * length);
    context.stroke();
  }
}

function drawPendulumBobs(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(20, plan.bassElements + plan.midElements);
  for (let pendulum = 0; pendulum < count; pendulum += 1) {
    const fromBottom = pendulum % 2 === 1;
    const x = width * (pendulum + 0.5) / Math.max(1, count);
    const edgeY = fromBottom ? height : 0;
    const direction = fromBottom ? -1 : 1;
    const length = unit * plan.reach * (0.34 + plan.midDrive * 0.66);
    const swing = Math.sin(time * (0.3 + plan.midDrive * 0.7) + pendulum * 0.46) * unit * 0.012;
    const bobY = edgeY + direction * length;
    const color = pendulum % 5 === 0 ? highlight : pendulum % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.28 + plan.midDrive * 0.36));
    context.lineWidth = Math.max(1, unit * plan.thickness * 0.24);
    context.beginPath();
    context.moveTo(x, edgeY);
    context.lineTo(x + swing, bobY);
    context.stroke();
    context.fillStyle = rgba(color, alpha * (0.34 + plan.bassDrive * 0.4));
    context.beginPath();
    context.arc(x + swing, bobY, unit * plan.thickness * (0.7 + plan.bassDrive), 0, Math.PI * 2);
    context.fill();
  }
}

function drawChladniNodes(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(36, plan.midElements + plan.trebleElements);
  for (let grain = 0; grain < count; grain += 1) {
    const progress = randomUnit(seed, 161_100 + grain);
    const inset = unit * (0.004 + Math.abs(Math.sin(progress * Math.PI * 6 + time * 0.1)) * plan.reach * 0.2);
    const point = perimeterPoint(progress, width, height, inset);
    const radius = unit * (0.002 + plan.trebleDrive * 0.004 + randomUnit(seed, 161_300 + grain) * 0.003);
    const color = grain % 5 === 0 ? highlight : grain % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.3 + plan.trebleDrive * 0.42));
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawTesseractCorners(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const corners = [[0, 0], [width, 0], [0, height], [width, height]] as const;
  const gateCount = Math.min(4, Math.max(2, Math.ceil(plan.midElements * 0.3)));
  for (let gate = 0; gate < gateCount; gate += 1) {
    const size = unit * plan.reach * (0.3 + gate / gateCount * 0.7);
    const drift = Math.sin(time * 0.14 + gate) * unit * 0.005;
    context.strokeStyle = rgba(gate % 3 === 0 ? highlight : gate % 2 ? secondary : primary, alpha * (0.25 + plan.midDrive * 0.38));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.28 + plan.bassDrive * 0.5));
    for (const [x, y] of corners) {
      const directionX = x === 0 ? 1 : -1;
      const directionY = y === 0 ? 1 : -1;
      context.strokeRect(x + directionX * drift, y + directionY * drift, directionX * size, directionY * size);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + directionX * size, y + directionY * size);
      context.stroke();
    }
  }
}

function drawKintsugiSeams(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(18, plan.bassElements + plan.midElements);
  for (let seam = 0; seam < count; seam += 1) {
    const base = perimeterPoint(randomUnit(seed, 161_700 + seam), width, height, 0);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const distance = Math.max(1, Math.hypot(centerX - base.x, centerY - base.y));
    const nx = (centerX - base.x) / distance;
    const ny = (centerY - base.y) / distance;
    const reach = unit * plan.reach * (0.35 + plan.midDrive * 0.65);
    const color = seam % 5 === 0 ? highlight : seam % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.34 + plan.midDrive * 0.38));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.3 + plan.bassDrive * 0.6));
    context.beginPath();
    context.moveTo(base.x, base.y);
    for (let segment = 1; segment <= 4; segment += 1) {
      const progress = segment / 4;
      const jitter = (randomUnit(seed, 162_100 + seam * 7 + segment) - 0.5) * unit * 0.025;
      context.lineTo(base.x + nx * reach * progress - ny * jitter, base.y + ny * reach * progress + nx * jitter);
    }
    context.stroke();
  }
}

function drawCalligraphyFlicks(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(20, plan.midElements + plan.trebleElements);
  context.lineCap = "round";
  for (let flick = 0; flick < count; flick += 1) {
    const base = perimeterPoint(randomUnit(seed, 162_500 + flick), width, height, 0);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const distance = Math.max(1, Math.hypot(centerX - base.x, centerY - base.y));
    const nx = (centerX - base.x) / distance;
    const ny = (centerY - base.y) / distance;
    const tx = -ny;
    const ty = nx;
    const reach = unit * plan.reach * (0.38 + plan.midDrive * 0.62);
    const bend = Math.sin(time * 0.24 + flick) * unit * 0.014;
    const color = flick % 5 === 0 ? highlight : flick % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.28 + plan.trebleDrive * 0.42));
    context.lineWidth = Math.max(1, unit * plan.thickness * (0.22 + plan.bassDrive * 0.72));
    context.beginPath();
    context.moveTo(base.x, base.y);
    context.quadraticCurveTo(base.x + nx * reach * 0.55 + tx * bend, base.y + ny * reach * 0.55 + ty * bend, base.x + nx * reach, base.y + ny * reach);
    context.stroke();
  }
}

function drawSignalworkCogs(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(14, plan.bassElements + plan.midElements);
  for (let cog = 0; cog < count; cog += 1) {
    const side = cog % 4;
    const progress = (Math.floor(cog / 4) + 0.5) / Math.max(1, Math.ceil(count / 4));
    const x = side === 0 ? 0 : side === 1 ? width : progress * width;
    const y = side === 2 ? 0 : side === 3 ? height : progress * height;
    const radius = unit * (0.008 + plan.bassDrive * 0.015);
    drawGear(context, x, y, radius, 6 + cog % 4, time * (cog % 2 ? -0.2 : 0.2));
    const color = cog % 5 === 0 ? highlight : cog % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.32 + plan.midDrive * 0.4));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.3 + plan.bassDrive * 0.56));
    context.stroke();
  }
}

function drawZoetropeSlits(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(28, plan.midElements + plan.trebleElements);
  for (let slit = 0; slit < count; slit += 1) {
    const progress = (slit / Math.max(1, count) + time * (0.006 + plan.trebleDrive * 0.018)) % 1;
    const point = perimeterPoint(progress, width, height, 0);
    const horizontalEdge = point.y < unit * 0.01 || point.y > height - unit * 0.01;
    const length = unit * plan.reach * (0.28 + plan.midDrive * 0.72);
    const color = slit % 5 === 0 ? highlight : slit % 2 ? secondary : primary;
    context.fillStyle = rgba([3, 3, 6], alpha * (0.28 + plan.bassDrive * 0.34));
    if (horizontalEdge) context.fillRect(point.x - unit * 0.006, point.y === 0 ? 0 : height - length, unit * 0.012, length);
    else context.fillRect(point.x === 0 ? 0 : width - length, point.y - unit * 0.006, length, unit * 0.012);
    context.strokeStyle = rgba(color, alpha * (0.24 + plan.trebleDrive * 0.38));
    context.lineWidth = Math.max(1, unit * plan.thickness * 0.2);
    if (horizontalEdge) context.strokeRect(point.x - unit * 0.006, point.y === 0 ? 0 : height - length, unit * 0.012, length);
    else context.strokeRect(point.x === 0 ? 0 : width - length, point.y - unit * 0.006, length, unit * 0.012);
  }
}

function drawPrismWedges(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(22, plan.midElements + plan.trebleElements);
  for (let prism = 0; prism < count; prism += 1) {
    const base = perimeterPoint(randomUnit(seed, 163_100 + prism), width, height, 0);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const distance = Math.max(1, Math.hypot(centerX - base.x, centerY - base.y));
    const nx = (centerX - base.x) / distance;
    const ny = (centerY - base.y) / distance;
    const tx = -ny;
    const ty = nx;
    const reach = unit * plan.reach * (0.32 + plan.midDrive * 0.68);
    const halfWidth = unit * (0.006 + plan.bassDrive * 0.012);
    polygon(context, [
      { x: base.x + tx * halfWidth, y: base.y + ty * halfWidth },
      { x: base.x + nx * reach, y: base.y + ny * reach },
      { x: base.x - tx * halfWidth, y: base.y - ty * halfWidth },
    ]);
    const color = prism % 5 === 0 ? highlight : prism % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + plan.midDrive * 0.26));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.28 + plan.trebleDrive * 0.4));
    context.lineWidth = Math.max(1, unit * plan.thickness * 0.22);
    context.stroke();
  }
}

function drawHelixRungs(input: DrawRadioVisualExpansion40PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(24, plan.midElements + plan.trebleElements);
  for (let rung = 0; rung < count; rung += 1) {
    const fromRight = rung % 2 === 1;
    const y = height * (rung + 0.5) / Math.max(1, count);
    const edge = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    const wave = Math.sin(time * (0.16 + plan.midDrive * 0.4) + rung * 0.7);
    const reach = unit * plan.reach * (0.36 + plan.midDrive * 0.64) * (0.78 + wave * 0.16);
    const color = rung % 5 === 0 ? highlight : rung % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.3 + plan.midDrive * 0.36));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.25 + plan.bassDrive * 0.52));
    context.beginPath();
    context.moveTo(edge, y - unit * 0.006);
    context.lineTo(edge + direction * reach, y + unit * 0.006);
    context.moveTo(edge, y + unit * 0.006);
    context.lineTo(edge + direction * reach, y - unit * 0.006);
    context.stroke();
  }
}

export function drawRadioVisualMusicExpansion40Perimeter(
  input: DrawRadioVisualExpansion40PerimeterInput,
): boolean {
  const { context, mix, drives, plan } = input;
  const alpha = clampVisualValue(mix * (0.82 + drives.presence * 0.16) * plan.strength * 1.14, 0, 0.94);
  context.save();
  context.globalCompositeOperation = "source-over";
  if (plan.motif === "mobius_twists") drawMobiusTwists(input, alpha);
  else if (plan.motif === "pendulum_bobs") drawPendulumBobs(input, alpha);
  else if (plan.motif === "chladni_nodes") drawChladniNodes(input, alpha);
  else if (plan.motif === "tesseract_corners") drawTesseractCorners(input, alpha);
  else if (plan.motif === "kintsugi_seams") drawKintsugiSeams(input, alpha);
  else if (plan.motif === "calligraphy_flicks") drawCalligraphyFlicks(input, alpha);
  else if (plan.motif === "signalwork_cogs") drawSignalworkCogs(input, alpha);
  else if (plan.motif === "zoetrope_slits") drawZoetropeSlits(input, alpha);
  else if (plan.motif === "prism_wedges") drawPrismWedges(input, alpha);
  else if (plan.motif === "helix_rungs") drawHelixRungs(input, alpha);
  else {
    context.restore();
    return false;
  }
  context.restore();
  return true;
}
