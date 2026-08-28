import { clampVisualValue } from "@/lib/radio-visuals-engine";
import type {
  RadioVisualAudioDrives,
  RadioVisualMusicPerimeterPlan,
  RadioVisualMusicScene,
  RadioVisualMusicSceneLayerPlan,
} from "@/lib/radio-visuals-engine";

export type RadioVisualExpansion30Rgb = [number, number, number];

interface DrawRadioVisualExpansion30Input {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  layerPlan: RadioVisualMusicSceneLayerPlan;
  primary: RadioVisualExpansion30Rgb;
  secondary: RadioVisualExpansion30Rgb;
  highlight: RadioVisualExpansion30Rgb;
  seed: number;
}

interface DrawRadioVisualExpansion30PerimeterInput {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  mix: number;
  drives: RadioVisualAudioDrives;
  plan: RadioVisualMusicPerimeterPlan;
  primary: RadioVisualExpansion30Rgb;
  secondary: RadioVisualExpansion30Rgb;
  highlight: RadioVisualExpansion30Rgb;
  seed: number;
}

interface Expansion30Activity {
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

function rgba(color: RadioVisualExpansion30Rgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${clampVisualValue(alpha)})`;
}

function randomUnit(seed: number, index: number): number {
  const value = Math.sin((seed + index * 1_919) * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
}

function activity(input: DrawRadioVisualExpansion30Input): Expansion30Activity {
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

function familyAlpha(input: DrawRadioVisualExpansion30Input): number {
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

function drawSpectralCathedral(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const pillarCount = Math.min(14, 4 + a.bassCount + Math.ceil(a.midCount * 0.45));
  const naveTop = height * (0.08 + (1 - a.progress) * 0.08);
  const naveBottom = height * (0.92 - (1 - a.progress) * 0.08);
  const pillarWidth = Math.max(4, unit * (0.009 + a.bass * 0.026));
  const archCount = Math.min(pillarCount - 1, 1 + a.midCount);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineJoin = "miter";

  for (let pillar = 0; pillar < pillarCount; pillar += 1) {
    const x = width * (pillar + 1) / (pillarCount + 1);
    const sidePull = Math.abs(x / width - 0.5) * 2;
    const breathing = Math.sin(time * (0.14 + a.mid * 0.22) + pillar * 0.83) * unit * a.mid * 0.008;
    const top = naveTop + height * sidePull * (0.04 + a.progress * 0.05) + breathing;
    const bottom = naveBottom - height * sidePull * (0.04 + a.progress * 0.05) - breathing;
    const color = pillar % 5 === 0 ? highlight : pillar % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + a.bass * 0.34));
    context.fillRect(x - pillarWidth * 0.5, top, pillarWidth, Math.max(1, bottom - top));
    context.fillStyle = rgba(highlight, alpha * (0.16 + a.treble * 0.3));
    context.fillRect(x - pillarWidth, top, pillarWidth * 2, Math.max(2, unit * (0.004 + a.treble * 0.006)));
    context.fillRect(x - pillarWidth, bottom - unit * 0.006, pillarWidth * 2, Math.max(2, unit * 0.006));
  }

  for (let arch = 0; arch < archCount; arch += 1) {
    const leftIndex = Math.floor(arch * (pillarCount - 1) / Math.max(1, archCount));
    const rightIndex = Math.min(pillarCount - 1, leftIndex + 1 + (a.act >= 2 ? arch % 2 : 0));
    const leftX = width * (leftIndex + 1) / (pillarCount + 1);
    const rightX = width * (rightIndex + 1) / (pillarCount + 1);
    const archY = height * (0.24 + (arch % 2) * 0.52);
    const direction = archY < height * 0.5 ? -1 : 1;
    const vault = unit * (0.05 + a.mid * 0.12 + a.progress * 0.055);
    context.strokeStyle = rgba(arch % 3 === 0 ? highlight : arch % 2 ? secondary : primary, alpha * (0.2 + a.mid * 0.42));
    context.lineWidth = Math.max(2, pillarWidth * (0.32 + a.bass * 0.28));
    context.beginPath();
    context.moveTo(leftX, archY);
    context.quadraticCurveTo((leftX + rightX) * 0.5, archY + direction * vault, rightX, archY);
    context.stroke();
  }

  const windowCount = Math.min(16, a.trebleCount);
  for (let pane = 0; pane < windowCount; pane += 1) {
    const side = pane % 2 === 0 ? -1 : 1;
    const x = width * (0.5 + side * (0.12 + (pane % 5) * 0.055));
    const y = height * (0.16 + ((pane * 7) % 11) / 10 * 0.68);
    const size = unit * (0.006 + a.treble * 0.014);
    context.fillStyle = rgba(pane % 3 === 0 ? highlight : pane % 2 ? secondary : primary, alpha * (0.24 + a.treble * 0.48));
    polygon(context, [
      { x, y: y - size },
      { x: x + size, y },
      { x, y: y + size },
      { x: x - size, y },
    ]);
    context.fill();
  }

  if (a.tapestryCount > 0) {
    const roseRadius = unit * (0.052 + a.tapestry * 0.055 + a.progress * 0.025);
    const roseX = width * 0.5;
    const roseY = height * (0.5 + Math.sin(time * 0.11 + a.phrase * Math.PI * 2) * 0.025);
    const spokes = Math.min(18, 6 + a.tapestryCount * 2 + a.trebleCount);
    context.strokeStyle = rgba(highlight, alpha * (0.2 + a.tapestry * 0.46));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.004));
    context.beginPath();
    context.arc(roseX, roseY, roseRadius, 0, Math.PI * 2);
    context.stroke();
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = spoke / spokes * Math.PI * 2 + time * 0.025;
      context.beginPath();
      context.moveTo(roseX + Math.cos(angle) * roseRadius * 0.22, roseY + Math.sin(angle) * roseRadius * 0.22);
      context.lineTo(roseX + Math.cos(angle) * roseRadius, roseY + Math.sin(angle) * roseRadius);
      context.stroke();
    }
  }
  context.restore();
}

function drawFerrofluidField(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const shadow: RadioVisualExpansion30Rgb = [3, 5, 5];
  const magneticWellCount = Math.min(8, 2 + Math.ceil(a.bassCount * 0.5));
  const fieldLineCount = Math.min(14, 2 + a.midCount);
  const liquidSpikeCount = Math.min(24, 4 + a.trebleCount);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";

  for (let well = 0; well < magneticWellCount; well += 1) {
    const fromRight = well % 2 === 1;
    const x = width * (fromRight ? 0.82 - (well % 3) * 0.065 : 0.18 + (well % 3) * 0.065);
    const y = height * (0.14 + ((well * 5) % magneticWellCount) / Math.max(1, magneticWellCount - 1) * 0.72);
    const pulse = 0.86 + Math.sin(time * (0.38 + a.bass * 0.72) + well) * (0.05 + a.bass * 0.08);
    const radius = unit * (0.024 + a.bass * 0.044 + randomUnit(seed, 140_100 + well) * 0.018) * pulse;
    const gradient = context.createRadialGradient(x, y, radius * 0.12, x, y, radius);
    gradient.addColorStop(0, rgba(highlight, alpha * (0.34 + a.treble * 0.24)));
    gradient.addColorStop(0.38, rgba(well % 2 ? secondary : primary, alpha * (0.3 + a.bass * 0.34)));
    gradient.addColorStop(1, rgba(shadow, alpha * 0.08));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let line = 0; line < fieldLineCount; line += 1) {
    const y = height * (line + 0.5) / fieldLineCount;
    const bow = unit * (0.035 + a.mid * 0.11 + a.progress * 0.045) * (line % 2 ? -1 : 1);
    const phase = Math.sin(time * (0.2 + a.mid * 0.36) + line * 0.7) * unit * a.mid * 0.015;
    context.strokeStyle = rgba(line % 4 === 0 ? highlight : line % 2 ? secondary : primary, alpha * (0.12 + a.mid * 0.32));
    context.lineWidth = Math.max(1.5, unit * (0.0013 + a.bass * 0.0035));
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(width * 0.28, y + bow + phase, width * 0.72, y - bow - phase, width, y);
    context.stroke();
  }

  for (let spike = 0; spike < liquidSpikeCount; spike += 1) {
    const edge = spike % 4;
    const along = randomUnit(seed, 140_500 + spike);
    const flutter = Math.sin(time * (0.72 + a.treble * 1.7) + spike * 1.37) * unit * 0.006;
    const length = unit * (0.012 + a.treble * 0.075 + a.progress * a.treble * 0.025);
    const widthBase = unit * (0.004 + a.bass * 0.012);
    let points: Array<{ x: number; y: number }>;
    if (edge < 2) {
      const x = edge === 0 ? 0 : width;
      const direction = edge === 0 ? 1 : -1;
      const y = along * height;
      points = [
        { x, y: y - widthBase },
        { x: x + direction * length, y: y + flutter },
        { x, y: y + widthBase },
      ];
    } else {
      const y = edge === 2 ? 0 : height;
      const direction = edge === 2 ? 1 : -1;
      const x = along * width;
      points = [
        { x: x - widthBase, y },
        { x: x + flutter, y: y + direction * length },
        { x: x + widthBase, y },
      ];
    }
    polygon(context, points);
    context.fillStyle = rgba(spike % 5 === 0 ? highlight : spike % 2 ? secondary : primary, alpha * (0.18 + a.treble * 0.48));
    context.fill();
  }

  if (a.tapestryCount > 0) {
    const crownPoints = Math.min(20, 8 + a.tapestryCount * 2);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const inner = unit * (0.085 + a.bass * 0.035);
    const outer = inner + unit * (0.035 + a.tapestry * 0.08);
    context.fillStyle = rgba(secondary, alpha * (0.1 + a.tapestry * 0.28));
    context.strokeStyle = rgba(highlight, alpha * (0.24 + a.tapestry * 0.46));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.004));
    const points = Array.from({ length: crownPoints * 2 }, (_, index) => {
      const angle = index / (crownPoints * 2) * Math.PI * 2 + time * 0.07;
      const radius = index % 2 === 0 ? inner : outer;
      return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
    });
    polygon(context, points);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawOrbitalRelay(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const orbitalRingCount = Math.min(10, 2 + a.midCount);
  const satelliteCount = Math.min(20, 3 + a.trebleCount);
  const anchorCount = Math.min(8, 2 + a.bassCount);
  const centerX = width * 0.5;
  const centerY = height * 0.48;
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let ring = 0; ring < orbitalRingCount; ring += 1) {
    const depth = (ring + 1) / (orbitalRingCount + 1);
    const radiusX = width * (0.12 + depth * 0.34 + a.bass * 0.025);
    const radiusY = height * (0.055 + depth * 0.28 + a.mid * 0.018);
    const tilt = (ring % 2 ? -1 : 1) * (0.12 + a.progress * 0.42 + ring * 0.018);
    context.strokeStyle = rgba(ring % 4 === 0 ? highlight : ring % 2 ? secondary : primary, alpha * (0.12 + a.mid * 0.3));
    context.lineWidth = Math.max(1.5, unit * (0.0014 + a.bass * 0.0035));
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, tilt, 0, Math.PI * 2);
    context.stroke();
  }

  for (let anchor = 0; anchor < anchorCount; anchor += 1) {
    const angle = anchor / anchorCount * Math.PI * 2 + time * (0.025 + a.mid * 0.04);
    const radiusX = width * (0.24 + (anchor % 3) * 0.075);
    const radiusY = height * (0.16 + (anchor % 2) * 0.13);
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    const radius = unit * (0.008 + a.bass * 0.018 + (anchor % 3) * 0.002);
    context.fillStyle = rgba(anchor % 2 ? secondary : primary, alpha * (0.24 + a.bass * 0.42));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let satellite = 0; satellite < satelliteCount; satellite += 1) {
    const local = randomUnit(seed, 141_100 + satellite);
    const orbit = satellite % Math.max(1, orbitalRingCount);
    const depth = (orbit + 1) / (orbitalRingCount + 1);
    const speed = 0.05 + a.treble * 0.18 + (satellite % 5) * 0.008;
    const angle = local * Math.PI * 2 + time * speed * (satellite % 2 ? -1 : 1) + a.progress * Math.PI * (0.4 + depth);
    const tilt = (orbit % 2 ? -1 : 1) * (0.12 + a.progress * 0.42 + orbit * 0.018);
    const unrotatedX = Math.cos(angle) * width * (0.12 + depth * 0.34);
    const unrotatedY = Math.sin(angle) * height * (0.055 + depth * 0.28);
    const x = centerX + unrotatedX * Math.cos(tilt) - unrotatedY * Math.sin(tilt);
    const y = centerY + unrotatedX * Math.sin(tilt) + unrotatedY * Math.cos(tilt);
    const size = unit * (0.004 + a.treble * 0.01 + (satellite % 4 === 0 ? a.bass * 0.008 : 0));
    context.fillStyle = rgba(satellite % 5 === 0 ? highlight : satellite % 2 ? secondary : primary, alpha * (0.28 + a.treble * 0.46));
    context.fillRect(x - size, y - size, size * 2, size * 2);
    if (a.treble > 0.08) {
      context.strokeStyle = rgba(highlight, alpha * (0.12 + a.treble * 0.3));
      context.lineWidth = Math.max(1, unit * 0.0015);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - Math.cos(angle) * size * (2 + a.treble * 4), y - Math.sin(angle) * size * (2 + a.treble * 4));
      context.stroke();
    }
  }

  if (a.tapestryCount > 0) {
    const relayCount = Math.min(8, 2 + a.tapestryCount + Math.floor(a.midCount * 0.35));
    context.strokeStyle = rgba(highlight, alpha * (0.18 + a.tapestry * 0.4));
    context.lineWidth = Math.max(1.5, unit * (0.0018 + a.bass * 0.003));
    for (let relay = 0; relay < relayCount; relay += 1) {
      const angle = relay / relayCount * Math.PI * 2 + time * 0.04;
      const outerX = centerX + Math.cos(angle) * width * 0.43;
      const outerY = centerY + Math.sin(angle) * height * 0.34;
      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * unit * 0.07, centerY + Math.sin(angle) * unit * 0.07);
      context.quadraticCurveTo(centerX + Math.cos(angle + 0.7) * unit * 0.18, centerY + Math.sin(angle + 0.7) * unit * 0.18, outerX, outerY);
      context.stroke();
    }
  }
  context.restore();
}

function drawDataLoom(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const loomBeamCount = Math.min(6, 2 + Math.ceil(a.bassCount * 0.42));
  const warpThreadCount = Math.min(18, 3 + a.midCount);
  const weftThreadCount = Math.min(16, 2 + Math.ceil(a.midCount * 0.65) + a.tapestryCount);
  const signalShuttleCount = Math.min(18, 2 + a.trebleCount);
  const weaveSkew = (a.progress - 0.5) * unit * 0.12;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineCap = "square";

  for (let beam = 0; beam < loomBeamCount; beam += 1) {
    const side = beam % 4;
    const lane = Math.floor(beam / 4) + 1;
    const thickness = unit * (0.008 + a.bass * 0.022 + lane * 0.002);
    const color = beam % 3 === 0 ? highlight : beam % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + a.bass * 0.36));
    if (side < 2) {
      const y = side === 0 ? height * 0.045 * lane : height - height * 0.045 * lane - thickness;
      context.fillRect(0, y, width, thickness);
    } else {
      const x = side === 2 ? width * 0.035 * lane : width - width * 0.035 * lane - thickness;
      context.fillRect(x, 0, thickness, height);
    }
  }

  for (let thread = 0; thread < warpThreadCount; thread += 1) {
    const x = width * (thread + 1) / (warpThreadCount + 1);
    const bend = Math.sin(time * (0.16 + a.mid * 0.28) + thread * 0.62) * unit * (0.008 + a.mid * 0.026);
    const color = thread % 5 === 0 ? highlight : thread % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.12 + a.mid * 0.34));
    context.lineWidth = Math.max(1.25, unit * (0.0012 + a.bass * 0.0028));
    context.beginPath();
    context.moveTo(x - weaveSkew * 0.35, 0);
    context.bezierCurveTo(x + bend, height * 0.32, x - bend + weaveSkew, height * 0.68, x + weaveSkew * 0.35, height);
    context.stroke();
  }

  for (let thread = 0; thread < weftThreadCount; thread += 1) {
    const y = height * (thread + 1) / (weftThreadCount + 1);
    const segmentCount = 8 + a.act * 2;
    const offset = Math.sin(time * (0.22 + a.mid * 0.36) + thread) * unit * a.mid * 0.008;
    context.strokeStyle = rgba(thread % 4 === 0 ? highlight : thread % 2 ? primary : secondary, alpha * (0.11 + a.mid * 0.3 + a.tapestry * 0.1));
    context.lineWidth = Math.max(1.2, unit * (0.001 + a.bass * 0.0025));
    context.beginPath();
    for (let segment = 0; segment <= segmentCount; segment += 1) {
      const progress = segment / segmentCount;
      const overUnder = (segment + thread) % 2 === 0 ? -1 : 1;
      const x = width * progress;
      const pointY = y + overUnder * unit * (0.002 + a.tapestry * 0.008) + offset;
      if (segment === 0) context.moveTo(x, pointY);
      else context.lineTo(x, pointY);
    }
    context.stroke();
  }

  for (let shuttle = 0; shuttle < signalShuttleCount; shuttle += 1) {
    const horizontal = shuttle % 2 === 0;
    const lane = randomUnit(seed, 142_100 + shuttle);
    const travel = (randomUnit(seed, 142_200 + shuttle) + time * (0.045 + a.treble * 0.22 + (shuttle % 5) * 0.006)) % 1;
    const length = unit * (0.01 + a.treble * 0.04);
    const thickness = Math.max(2, unit * (0.002 + a.bass * 0.004));
    context.fillStyle = rgba(shuttle % 5 === 0 ? highlight : shuttle % 2 ? secondary : primary, alpha * (0.24 + a.treble * 0.48));
    if (horizontal) context.fillRect(travel * width - length * 0.5, lane * height, length, thickness);
    else context.fillRect(lane * width, travel * height - length * 0.5, thickness, length);
  }

  if (a.tapestryCount > 0) {
    const cellCount = Math.min(10, 2 + a.tapestryCount + Math.floor(a.midCount * 0.3));
    for (let cell = 0; cell < cellCount; cell += 1) {
      const x = width * (0.18 + (cell % 4) * 0.21);
      const y = height * (0.22 + Math.floor(cell / 4) * 0.24);
      const sizeX = unit * (0.025 + a.tapestry * 0.04);
      const sizeY = sizeX * (0.7 + a.progress * 0.4);
      polygon(context, [
        { x, y: y - sizeY },
        { x: x + sizeX, y },
        { x, y: y + sizeY },
        { x: x - sizeX, y },
      ]);
      context.fillStyle = rgba(cell % 2 ? secondary : primary, alpha * (0.08 + a.tapestry * 0.2));
      context.fill();
      context.strokeStyle = rgba(highlight, alpha * (0.18 + a.tapestry * 0.38));
      context.lineWidth = Math.max(1.5, unit * 0.002);
      context.stroke();
    }
  }
  context.restore();
}

function drawMonolithArray(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const monolithCount = Math.min(14, 4 + a.bassCount);
  const indexingSeamCount = Math.min(14, 2 + a.midCount);
  const apertureCount = Math.min(18, a.trebleCount);
  const alignment = a.progress * a.progress;
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let monolith = 0; monolith < monolithCount; monolith += 1) {
    const fromRight = monolith % 2 === 1;
    const lane = Math.floor(monolith / 2);
    const laneCount = Math.ceil(monolithCount / 2);
    const along = (lane + 0.5) / laneCount;
    const slabWidth = unit * (0.028 + a.bass * 0.05 + randomUnit(seed, 143_100 + monolith) * 0.025);
    const slabHeight = height * (0.13 + randomUnit(seed, 143_200 + monolith) * 0.28 + a.bass * 0.12);
    const edgeX = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    const depth = unit * (0.025 + alignment * (0.035 + (lane % 3) * 0.018));
    const x = edgeX + direction * depth;
    const y = height * along - slabHeight * 0.5;
    const lean = Math.sin(time * (0.08 + a.mid * 0.12) + monolith * 0.9) * unit * a.mid * 0.012 * (1 - alignment * 0.55);
    polygon(context, [
      { x: x - direction * slabWidth * 0.5, y },
      { x: x + direction * slabWidth, y: y + lean },
      { x: x + direction * slabWidth, y: y + slabHeight + lean },
      { x: x - direction * slabWidth * 0.5, y: y + slabHeight },
    ]);
    const color = monolith % 5 === 0 ? highlight : monolith % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.16 + a.bass * 0.36));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.12 + a.mid * 0.28));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.003));
    context.stroke();
  }

  for (let seam = 0; seam < indexingSeamCount; seam += 1) {
    const horizontal = seam % 2 === 0;
    const along = (seam + 1) / (indexingSeamCount + 1);
    const reach = unit * (0.035 + a.mid * 0.14 + alignment * 0.05);
    const offset = Math.sin(time * (0.17 + a.mid * 0.26) + seam * 1.4) * unit * a.mid * 0.008;
    context.strokeStyle = rgba(seam % 4 === 0 ? highlight : seam % 2 ? secondary : primary, alpha * (0.14 + a.mid * 0.36));
    context.lineWidth = Math.max(1.5, unit * (0.0014 + a.bass * 0.0032));
    context.beginPath();
    if (horizontal) {
      const y = height * along + offset;
      context.moveTo(0, y);
      context.lineTo(reach, y);
      context.moveTo(width, y);
      context.lineTo(width - reach, y);
    } else {
      const x = width * along + offset;
      context.moveTo(x, 0);
      context.lineTo(x, reach);
      context.moveTo(x, height);
      context.lineTo(x, height - reach);
    }
    context.stroke();
  }

  for (let aperture = 0; aperture < apertureCount; aperture += 1) {
    const side = aperture % 2 === 1;
    const x = width * (side ? 0.82 : 0.18) + (randomUnit(seed, 143_700 + aperture) - 0.5) * width * 0.18;
    const y = height * randomUnit(seed, 143_800 + aperture);
    const apertureWidth = unit * (0.006 + a.treble * 0.022);
    const apertureHeight = Math.max(2, unit * (0.0025 + (aperture % 3) * 0.0015));
    context.fillStyle = rgba(aperture % 4 === 0 ? highlight : aperture % 2 ? primary : secondary, alpha * (0.24 + a.treble * 0.5));
    context.fillRect(x - apertureWidth * 0.5, y, apertureWidth, apertureHeight);
  }

  if (a.tapestryCount > 0) {
    const citadelHeight = height * (0.08 + a.tapestry * 0.11 + alignment * 0.06);
    const citadelWidth = width * (0.22 + a.tapestry * 0.18);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    context.strokeStyle = rgba(highlight, alpha * (0.18 + a.tapestry * 0.42));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.004));
    context.strokeRect(centerX - citadelWidth * 0.5, centerY - citadelHeight * 0.5, citadelWidth, citadelHeight);
    context.fillStyle = rgba(secondary, alpha * (0.08 + a.tapestry * 0.2));
    context.fillRect(centerX - unit * 0.012, centerY - citadelHeight * 0.85, unit * 0.024, citadelHeight * 1.7);
  }
  context.restore();
}

function drawPlasmaTendrils(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const plasmaRootCount = Math.min(10, 2 + a.bassCount);
  const filamentCount = Math.min(18, 3 + a.midCount);
  const branchSparkCount = Math.min(24, a.trebleCount);
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.shadowColor = rgba(highlight, alpha * (0.12 + a.treble * 0.32));
  context.shadowBlur = unit * (0.003 + a.treble * 0.014);

  for (let root = 0; root < plasmaRootCount; root += 1) {
    const side = root % 4;
    const along = (Math.floor(root / 4) + 0.5) / Math.ceil(plasmaRootCount / 4);
    const thickness = Math.max(2.5, unit * (0.0025 + a.bass * 0.009));
    const radius = thickness * (1.3 + a.bass * 1.4);
    const x = side === 0 ? 0 : side === 1 ? width : width * along;
    const y = side === 2 ? 0 : side === 3 ? height : height * along;
    context.fillStyle = rgba(root % 3 === 0 ? highlight : root % 2 ? secondary : primary, alpha * (0.28 + a.bass * 0.44));
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let filament = 0; filament < filamentCount; filament += 1) {
    const side = filament % 4;
    const along = randomUnit(seed, 144_100 + filament);
    const reach = unit * (0.13 + a.mid * 0.24 + a.progress * 0.1);
    const sway = Math.sin(time * (0.34 + a.mid * 0.7) + filament * 1.13) * unit * (0.025 + a.mid * 0.045);
    const color = filament % 5 === 0 ? highlight : filament % 2 ? secondary : primary;
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;
    if (side < 2) {
      startX = side === 0 ? 0 : width;
      startY = along * height;
      endX = startX + (side === 0 ? 1 : -1) * reach;
      endY = startY + sway;
    } else {
      startX = along * width;
      startY = side === 2 ? 0 : height;
      endX = startX + sway;
      endY = startY + (side === 2 ? 1 : -1) * reach;
    }
    context.strokeStyle = rgba(color, alpha * (0.16 + a.mid * 0.4 + a.treble * 0.12));
    context.lineWidth = Math.max(1.5, unit * (0.0014 + a.bass * 0.005));
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      startX + (endX - startX) * 0.3 + sway * 0.35,
      startY + (endY - startY) * 0.2 - sway * 0.25,
      startX + (endX - startX) * 0.72 - sway * 0.4,
      startY + (endY - startY) * 0.78 + sway * 0.28,
      endX,
      endY,
    );
    context.stroke();
  }

  context.shadowBlur = 0;
  for (let spark = 0; spark < branchSparkCount; spark += 1) {
    const localSeed = seed + Math.floor(time * (1.4 + a.treble * 7)) * 47 + spark * 19;
    const x = width * randomUnit(localSeed, 144_500 + spark);
    const y = height * randomUnit(localSeed, 144_600 + spark);
    const angle = randomUnit(localSeed, 144_700 + spark) * Math.PI * 2;
    const length = unit * (0.006 + a.treble * 0.025);
    context.strokeStyle = rgba(spark % 4 === 0 ? highlight : spark % 2 ? secondary : primary, alpha * (0.24 + a.treble * 0.5));
    context.lineWidth = Math.max(1, unit * (0.001 + a.treble * 0.002));
    context.beginPath();
    context.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }

  if (a.tapestryCount > 0) {
    const plasmaBraidCount = Math.min(6, 2 + a.tapestryCount);
    context.shadowColor = rgba(highlight, alpha * 0.28);
    context.shadowBlur = unit * (0.006 + a.tapestry * 0.018);
    for (let braid = 0; braid < plasmaBraidCount; braid += 1) {
      const offset = (braid - (plasmaBraidCount - 1) * 0.5) * unit * 0.018;
      context.strokeStyle = rgba(braid % 3 === 0 ? highlight : braid % 2 ? secondary : primary, alpha * (0.14 + a.tapestry * 0.36));
      context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.004));
      context.beginPath();
      context.moveTo(width * 0.08, height * 0.5 + offset);
      context.bezierCurveTo(width * 0.32, height * (0.22 + a.phrase * 0.12), width * 0.68, height * (0.78 - a.phrase * 0.12), width * 0.92, height * 0.5 - offset);
      context.stroke();
    }
  }
  context.restore();
}

function drawSignalBloom(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const coreRingCount = Math.min(8, 2 + Math.ceil(a.bassCount * 0.5));
  const signalPetalCount = Math.min(24, 6 + a.midCount);
  const filamentStamenCount = Math.min(22, a.trebleCount);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const opening = 0.3 + a.progress * 0.7;
  const rotation = time * (0.04 + a.mid * 0.12) + a.phrase * 0.42;
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let ring = 0; ring < coreRingCount; ring += 1) {
    const depth = (ring + 1) / (coreRingCount + 1);
    const radius = unit * (0.035 + depth * 0.09 + a.bass * 0.025);
    context.strokeStyle = rgba(ring % 3 === 0 ? highlight : ring % 2 ? secondary : primary, alpha * (0.14 + a.bass * 0.32) * (1 - depth * 0.35));
    context.lineWidth = Math.max(1.5, unit * (0.0014 + a.bass * 0.0045));
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }

  for (let petal = 0; petal < signalPetalCount; petal += 1) {
    const angle = rotation + petal / signalPetalCount * Math.PI * 2;
    const innerRadius = unit * (0.045 + a.bass * 0.02);
    const outerRadius = unit * (0.14 + opening * 0.2 + a.mid * 0.06 + (petal % 3) * 0.008);
    const halfWidth = 0.12 + (1 - opening) * 0.09 + a.mid * 0.035;
    const innerX = centerX + Math.cos(angle) * innerRadius;
    const innerY = centerY + Math.sin(angle) * innerRadius;
    const tipX = centerX + Math.cos(angle) * outerRadius;
    const tipY = centerY + Math.sin(angle) * outerRadius;
    const controlRadius = innerRadius + (outerRadius - innerRadius) * 0.58;
    const leftAngle = angle - halfWidth;
    const rightAngle = angle + halfWidth;
    context.beginPath();
    context.moveTo(innerX, innerY);
    context.bezierCurveTo(
      centerX + Math.cos(leftAngle) * controlRadius,
      centerY + Math.sin(leftAngle) * controlRadius,
      tipX - Math.cos(angle) * unit * 0.018 + Math.cos(leftAngle) * unit * 0.012,
      tipY - Math.sin(angle) * unit * 0.018 + Math.sin(leftAngle) * unit * 0.012,
      tipX,
      tipY,
    );
    context.bezierCurveTo(
      tipX - Math.cos(angle) * unit * 0.018 + Math.cos(rightAngle) * unit * 0.012,
      tipY - Math.sin(angle) * unit * 0.018 + Math.sin(rightAngle) * unit * 0.012,
      centerX + Math.cos(rightAngle) * controlRadius,
      centerY + Math.sin(rightAngle) * controlRadius,
      innerX,
      innerY,
    );
    context.closePath();
    const color = petal % 5 === 0 ? highlight : petal % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.07 + a.mid * 0.19 + a.tapestry * 0.08));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.18 + a.mid * 0.34));
    context.lineWidth = Math.max(1.2, unit * (0.0012 + a.bass * 0.0028));
    context.stroke();
  }

  for (let stamen = 0; stamen < filamentStamenCount; stamen += 1) {
    const angle = randomUnit(seed, 145_100 + stamen) * Math.PI * 2 + time * (0.08 + a.treble * 0.22);
    const inner = unit * (0.055 + randomUnit(seed, 145_200 + stamen) * 0.08);
    const outer = inner + unit * (0.025 + a.treble * 0.1);
    const x1 = centerX + Math.cos(angle) * inner;
    const y1 = centerY + Math.sin(angle) * inner;
    const x2 = centerX + Math.cos(angle) * outer;
    const y2 = centerY + Math.sin(angle) * outer;
    context.strokeStyle = rgba(stamen % 4 === 0 ? highlight : stamen % 2 ? primary : secondary, alpha * (0.22 + a.treble * 0.48));
    context.lineWidth = Math.max(1, unit * (0.001 + a.treble * 0.0022));
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.fillStyle = rgba(highlight, alpha * (0.24 + a.treble * 0.5));
    context.beginPath();
    context.arc(x2, y2, unit * (0.002 + a.treble * 0.004), 0, Math.PI * 2);
    context.fill();
  }

  if (a.tapestryCount > 0) {
    const rosetteLayerCount = Math.min(6, 1 + a.tapestryCount);
    for (let layer = 0; layer < rosetteLayerCount; layer += 1) {
      const radius = unit * (0.19 + layer * 0.035 + a.tapestry * 0.04);
      const sides = 6 + layer * 2;
      const points = Array.from({ length: sides }, (_, index) => {
        const angle = rotation * (layer % 2 ? -0.6 : 0.6) + index / sides * Math.PI * 2;
        return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
      });
      polygon(context, points);
      context.strokeStyle = rgba(layer % 2 ? secondary : highlight, alpha * (0.12 + a.tapestry * 0.34));
      context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.003));
      context.stroke();
    }
  }
  context.restore();
}

function drawVectorSwarm(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const vectorAgentCount = Math.min(36, 6 + a.midCount + a.trebleCount);
  const swarmLeaderCount = Math.min(8, 2 + Math.ceil(a.bassCount * 0.5));
  const formationCohesion = clampVisualValue(a.progress * 0.76 + a.mid * 0.24);
  const formationMode = a.act;
  const agents: Array<{ x: number; y: number; angle: number; size: number }> = [];
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let agent = 0; agent < vectorAgentCount; agent += 1) {
    const localX = randomUnit(seed, 146_100 + agent);
    const localY = randomUnit(seed, 146_200 + agent);
    const driftAngle = randomUnit(seed, 146_300 + agent) * Math.PI * 2;
    const speed = 0.018 + a.treble * 0.08 + (agent % 5) * 0.003;
    const driftX = (localX + Math.cos(driftAngle) * time * speed) % 1;
    const driftY = (localY + Math.sin(driftAngle) * time * speed * 0.72) % 1;
    const dispersedX = ((driftX + 1) % 1) * width;
    const dispersedY = ((driftY + 1) % 1) * height;
    const lane = (agent + 0.5) / vectorAgentCount;
    const chevronSide = agent % 2 === 0 ? -1 : 1;
    const laneX = width * (0.5 + chevronSide * Math.abs(lane - 0.5) * (0.78 - a.progress * 0.18));
    const laneY = height * (0.08 + lane * 0.84);
    const sigilAngle = agent / vectorAgentCount * Math.PI * 2 + time * (0.04 + a.mid * 0.1);
    const sigilRadius = unit * (0.18 + (agent % 3) * 0.055 + a.bass * 0.03);
    const sigilX = width * 0.5 + Math.cos(sigilAngle) * sigilRadius;
    const sigilY = height * 0.5 + Math.sin(sigilAngle) * sigilRadius * 1.18;
    const targetX = formationMode < 2 ? laneX : sigilX;
    const targetY = formationMode < 2 ? laneY : sigilY;
    const cohesion = formationMode === 0 ? formationCohesion * 0.24 : formationCohesion;
    const x = dispersedX + (targetX - dispersedX) * cohesion;
    const y = dispersedY + (targetY - dispersedY) * cohesion;
    const angle = formationMode < 2
      ? Math.atan2(targetY - dispersedY, targetX - dispersedX)
      : sigilAngle + Math.PI * 0.5;
    const leader = agent < swarmLeaderCount;
    const size = unit * (0.006 + a.treble * 0.01 + (leader ? 0.008 + a.bass * 0.014 : 0));
    agents.push({ x, y, angle, size });
    polygon(context, [
      { x: x + Math.cos(angle) * size * 1.8, y: y + Math.sin(angle) * size * 1.8 },
      { x: x + Math.cos(angle + 2.48) * size, y: y + Math.sin(angle + 2.48) * size },
      { x: x + Math.cos(angle - 2.48) * size, y: y + Math.sin(angle - 2.48) * size },
    ]);
    const color = leader ? highlight : agent % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.18 + a.mid * 0.2 + a.treble * 0.24));
    context.fill();
    context.strokeStyle = rgba(color, alpha * (0.18 + a.treble * 0.34));
    context.lineWidth = Math.max(1, unit * (0.001 + a.bass * 0.0018));
    context.stroke();
    if (a.treble > 0.08) {
      context.strokeStyle = rgba(color, alpha * (0.1 + a.treble * 0.26));
      context.beginPath();
      context.moveTo(x - Math.cos(angle) * size * (1.5 + a.treble * 3), y - Math.sin(angle) * size * (1.5 + a.treble * 3));
      context.lineTo(x - Math.cos(angle) * size * 0.5, y - Math.sin(angle) * size * 0.5);
      context.stroke();
    }
  }

  if (a.tapestryCount > 0) {
    const linkCount = Math.min(vectorAgentCount, 4 + a.tapestryCount * 3);
    context.strokeStyle = rgba(highlight, alpha * (0.1 + a.tapestry * 0.34));
    context.lineWidth = Math.max(1, unit * (0.001 + a.bass * 0.002));
    for (let link = 0; link < linkCount; link += 1) {
      const from = agents[link];
      const to = agents[(link + 3 + formationMode) % agents.length];
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    }
  }
  context.restore();
}

function drawMoireEngine(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const interferenceRingCount = Math.min(18, 4 + a.midCount);
  const phaseTickCount = Math.min(24, 4 + a.trebleCount);
  const diffractionLensCount = Math.min(7, a.tapestryCount);
  const convergence = a.progress * 0.7;
  const focusOffset = width * (0.2 - convergence * 0.14);
  const focusY = height * (0.5 + Math.sin(time * 0.08 + a.phrase * Math.PI * 2) * 0.025);
  context.save();
  context.globalCompositeOperation = "source-over";

  for (let field = 0; field < 2; field += 1) {
    const focusX = width * 0.5 + (field === 0 ? -focusOffset : focusOffset);
    for (let ring = 0; ring < interferenceRingCount; ring += 1) {
      const depth = (ring + 1) / (interferenceRingCount + 1);
      const radiusX = unit * (0.035 + depth * (0.34 + a.mid * 0.08));
      const radiusY = radiusX * (0.62 + a.progress * 0.24 + (ring % 2) * 0.04);
      const phaseShift = Math.sin(time * (0.12 + a.mid * 0.24) + ring * 0.72 + field * Math.PI) * unit * a.mid * 0.008;
      const color = (ring + field) % 5 === 0 ? highlight : (ring + field) % 2 ? secondary : primary;
      context.strokeStyle = rgba(color, alpha * (0.08 + a.mid * 0.24 + a.treble * 0.08));
      context.lineWidth = Math.max(1.5, unit * (0.0014 + a.bass * 0.004));
      context.beginPath();
      context.ellipse(focusX + phaseShift, focusY, radiusX, radiusY, (field ? -1 : 1) * (0.08 + a.progress * 0.18), 0, Math.PI * 2);
      context.stroke();
    }
  }

  for (let tick = 0; tick < phaseTickCount; tick += 1) {
    const angle = tick / phaseTickCount * Math.PI * 2 + time * (0.08 + a.treble * 0.26);
    const radius = unit * (0.24 + (tick % 4) * 0.03 + a.progress * 0.035);
    const length = unit * (0.006 + a.treble * 0.026);
    const x = width * 0.5 + Math.cos(angle) * radius;
    const y = focusY + Math.sin(angle) * radius * 0.9;
    context.strokeStyle = rgba(tick % 4 === 0 ? highlight : tick % 2 ? secondary : primary, alpha * (0.2 + a.treble * 0.46));
    context.lineWidth = Math.max(1, unit * (0.001 + a.bass * 0.002));
    context.beginPath();
    context.moveTo(x - Math.cos(angle) * length, y - Math.sin(angle) * length);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }

  for (let lens = 0; lens < diffractionLensCount; lens += 1) {
    const depth = (lens + 1) / (diffractionLensCount + 1);
    const radiusX = unit * (0.055 + depth * 0.18 + a.tapestry * 0.035);
    const radiusY = radiusX * (0.58 + depth * 0.18);
    const points = Array.from({ length: 8 }, (_, point) => {
      const angle = point / 8 * Math.PI * 2 + time * 0.035 * (lens % 2 ? -1 : 1);
      return { x: width * 0.5 + Math.cos(angle) * radiusX, y: focusY + Math.sin(angle) * radiusY };
    });
    polygon(context, points);
    context.strokeStyle = rgba(lens % 2 ? secondary : highlight, alpha * (0.12 + a.tapestry * 0.34));
    context.lineWidth = Math.max(1.5, unit * (0.0015 + a.bass * 0.0025));
    context.stroke();
  }
  context.restore();
}

function drawEclipseCorona(input: DrawRadioVisualExpansion30Input): void {
  const { context, width, height, time, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const a = activity(input);
  const alpha = familyAlpha(input);
  const shadow: RadioVisualExpansion30Rgb = [2, 2, 5];
  const coronaArcCount = Math.min(14, 3 + a.midCount);
  const solarFlareCount = Math.min(28, 4 + a.trebleCount);
  const centerX = width * 0.5;
  const centerY = height * 0.48;
  const coreRadius = unit * (0.1 + a.bass * 0.055);
  const eclipseAlignment = clampVisualValue(a.progress * 1.18);
  const occluderOffset = coreRadius * (1.15 - eclipseAlignment * 1.08);
  context.save();
  context.globalCompositeOperation = "source-over";

  const halo = context.createRadialGradient(centerX, centerY, coreRadius * 0.7, centerX, centerY, coreRadius * (1.45 + a.treble * 0.55));
  halo.addColorStop(0, rgba(highlight, alpha * (0.24 + a.bass * 0.2)));
  halo.addColorStop(0.42, rgba(primary, alpha * (0.15 + a.mid * 0.22)));
  halo.addColorStop(0.72, rgba(secondary, alpha * (0.08 + a.treble * 0.18)));
  halo.addColorStop(1, rgba(secondary, 0));
  context.fillStyle = halo;
  context.beginPath();
  context.arc(centerX, centerY, coreRadius * (1.45 + a.treble * 0.55), 0, Math.PI * 2);
  context.fill();

  context.fillStyle = rgba(primary, alpha * (0.2 + a.bass * 0.32));
  context.beginPath();
  context.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = rgba(shadow, alpha * (0.5 + a.bass * 0.34));
  context.beginPath();
  context.arc(centerX + occluderOffset, centerY - occluderOffset * 0.12, coreRadius * (0.94 + eclipseAlignment * 0.05), 0, Math.PI * 2);
  context.fill();

  for (let arc = 0; arc < coronaArcCount; arc += 1) {
    const depth = (arc + 1) / (coronaArcCount + 1);
    const radius = coreRadius * (1.05 + depth * (0.8 + a.mid * 0.48));
    const start = time * (0.04 + a.mid * 0.12) + arc * 1.17;
    const span = 0.35 + a.progress * 0.65 + (arc % 3) * 0.12;
    context.strokeStyle = rgba(arc % 4 === 0 ? highlight : arc % 2 ? secondary : primary, alpha * (0.12 + a.mid * 0.32));
    context.lineWidth = Math.max(1.5, unit * (0.0014 + a.bass * 0.004));
    context.beginPath();
    context.arc(centerX, centerY, radius, start, start + span);
    context.stroke();
  }

  for (let flare = 0; flare < solarFlareCount; flare += 1) {
    const angle = randomUnit(seed, 147_100 + flare) * Math.PI * 2 + time * (0.035 + a.treble * 0.12);
    const inner = coreRadius * (1.04 + randomUnit(seed, 147_200 + flare) * 0.18);
    const outer = inner + unit * (0.012 + a.treble * 0.085 + randomUnit(seed, 147_300 + flare) * 0.035);
    const bend = (randomUnit(seed, 147_400 + flare) - 0.5) * 0.5;
    const x1 = centerX + Math.cos(angle) * inner;
    const y1 = centerY + Math.sin(angle) * inner;
    const x2 = centerX + Math.cos(angle + bend) * outer;
    const y2 = centerY + Math.sin(angle + bend) * outer;
    context.strokeStyle = rgba(flare % 5 === 0 ? highlight : flare % 2 ? primary : secondary, alpha * (0.2 + a.treble * 0.5));
    context.lineWidth = Math.max(1, unit * (0.001 + a.treble * 0.0025));
    context.beginPath();
    context.moveTo(x1, y1);
    context.quadraticCurveTo(
      centerX + Math.cos(angle + bend * 0.35) * outer * 1.08,
      centerY + Math.sin(angle + bend * 0.35) * outer * 1.08,
      x2,
      y2,
    );
    context.stroke();
  }

  if (a.tapestryCount > 0) {
    const flareBandAngle = time * 0.07 + a.phrase * Math.PI * 2;
    const bandRadius = coreRadius * (1.8 + a.tapestry * 0.35);
    context.strokeStyle = rgba(highlight, alpha * (0.16 + a.tapestry * 0.4));
    context.lineWidth = Math.max(2, unit * (0.002 + a.bass * 0.004));
    context.beginPath();
    context.ellipse(centerX, centerY, bandRadius, bandRadius * 0.34, flareBandAngle, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function drawRadioVisualMusicExpansion30Scene(
  scene: RadioVisualMusicScene,
  input: DrawRadioVisualExpansion30Input,
): boolean {
  if (input.mix < 0.002) return false;
  if (scene === "spectral_cathedral") drawSpectralCathedral(input);
  else if (scene === "ferrofluid_field") drawFerrofluidField(input);
  else if (scene === "orbital_relay") drawOrbitalRelay(input);
  else if (scene === "data_loom") drawDataLoom(input);
  else if (scene === "monolith_array") drawMonolithArray(input);
  else if (scene === "plasma_tendrils") drawPlasmaTendrils(input);
  else if (scene === "signal_bloom") drawSignalBloom(input);
  else if (scene === "vector_swarm") drawVectorSwarm(input);
  else if (scene === "moire_engine") drawMoireEngine(input);
  else if (scene === "eclipse_corona") drawEclipseCorona(input);
  else return false;
  return true;
}

function perimeterPoint(
  progress: number,
  width: number,
  height: number,
  inset: number,
): { x: number; y: number } {
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

function drawCathedralButtresses(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(16, plan.bassElements + plan.midElements);
  const sideCount = Math.max(2, Math.ceil(count / 2));
  for (let buttress = 0; buttress < count; buttress += 1) {
    const fromRight = buttress % 2 === 1;
    const lane = Math.floor(buttress / 2);
    const y = height * (lane + 0.5) / sideCount;
    const reach = width * plan.reach * (0.38 + plan.midDrive * 0.62);
    const edge = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    const rise = unit * plan.reach * (0.18 + (lane % 3) * 0.09);
    const color = buttress % 5 === 0 ? highlight : buttress % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.36 + plan.midDrive * 0.36));
    context.lineWidth = Math.max(2, unit * plan.thickness * (0.44 + plan.bassDrive * 0.7));
    context.beginPath();
    context.moveTo(edge, y + rise);
    context.lineTo(edge + direction * reach * 0.34, y + rise);
    context.quadraticCurveTo(edge + direction * reach * 0.68, y - rise, edge + direction * reach, y);
    context.stroke();
  }
}

function drawFerrofluidSpikes(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(28, plan.midElements + plan.trebleElements);
  for (let spike = 0; spike < count; spike += 1) {
    const side = spike % 4;
    const along = randomUnit(seed, 149_100 + spike);
    const reach = unit * plan.reach * (0.35 + plan.trebleDrive * 0.65);
    const base = unit * plan.thickness * (0.32 + plan.bassDrive * 0.78);
    const flutter = Math.sin(time * (0.4 + plan.trebleDrive) + spike * 1.3) * unit * 0.004;
    let points: Array<{ x: number; y: number }>;
    if (side < 2) {
      const edge = side === 0 ? 0 : width;
      const direction = side === 0 ? 1 : -1;
      const y = along * height;
      points = [{ x: edge, y: y - base }, { x: edge + direction * reach, y: y + flutter }, { x: edge, y: y + base }];
    } else {
      const edge = side === 2 ? 0 : height;
      const direction = side === 2 ? 1 : -1;
      const x = along * width;
      points = [{ x: x - base, y: edge }, { x: x + flutter, y: edge + direction * reach }, { x: x + base, y: edge }];
    }
    polygon(context, points);
    context.fillStyle = rgba(spike % 5 === 0 ? highlight : spike % 2 ? secondary : primary, alpha * (0.32 + plan.trebleDrive * 0.42));
    context.fill();
  }
}

function drawOrbitalTicks(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const ringCount = Math.min(8, Math.max(3, Math.ceil(plan.midElements * 0.58)));
  for (let ring = 0; ring < ringCount; ring += 1) {
    const inset = unit * (0.012 + ring * 0.016);
    const radiusX = Math.max(unit * 0.08, width * 0.5 - inset);
    const radiusY = Math.max(unit * 0.08, height * 0.5 - inset * 1.15);
    context.strokeStyle = rgba(ring % 4 === 0 ? highlight : ring % 2 ? secondary : primary, alpha * (0.26 + plan.midDrive * 0.34));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.28 + plan.bassDrive * 0.5));
    context.beginPath();
    context.ellipse(width * 0.5, height * 0.5, radiusX, radiusY, (ring % 2 ? -1 : 1) * 0.08, 0, Math.PI * 2);
    context.stroke();
  }
  const tickCount = Math.min(24, plan.trebleElements);
  for (let tick = 0; tick < tickCount; tick += 1) {
    const angle = tick / Math.max(1, tickCount) * Math.PI * 2 + time * (0.04 + plan.trebleDrive * 0.16);
    const x = width * 0.5 + Math.cos(angle) * (width * 0.5 - unit * 0.018);
    const y = height * 0.5 + Math.sin(angle) * (height * 0.5 - unit * 0.018);
    const size = unit * (0.003 + plan.trebleDrive * 0.009);
    context.fillStyle = rgba(tick % 4 === 0 ? highlight : tick % 2 ? secondary : primary, alpha * (0.42 + plan.trebleDrive * 0.4));
    context.fillRect(x - size, y - size, size * 2, size * 2);
  }
}

function drawLoomShuttles(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const threadCount = Math.min(18, plan.midElements + plan.trebleElements);
  for (let thread = 0; thread < threadCount; thread += 1) {
    const horizontal = thread % 2 === 0;
    const lane = (Math.floor(thread / 2) + 0.5) / Math.ceil(threadCount / 2);
    const edge = horizontal ? (thread % 4 === 0 ? 0 : height) : (thread % 4 === 1 ? 0 : width);
    const direction = edge === 0 ? 1 : -1;
    const reach = unit * plan.reach * (0.42 + plan.midDrive * 0.58);
    const color = thread % 5 === 0 ? highlight : thread % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.3 + plan.midDrive * 0.34));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.28 + plan.bassDrive * 0.48));
    context.beginPath();
    if (horizontal) {
      const x = width * lane;
      context.moveTo(x, edge);
      context.lineTo(x, edge + direction * reach);
    } else {
      const y = height * lane;
      context.moveTo(edge, y);
      context.lineTo(edge + direction * reach, y);
    }
    context.stroke();
    const travel = (time * (0.04 + plan.trebleDrive * 0.18) + lane) % 1;
    context.fillStyle = rgba(highlight, alpha * (0.4 + plan.trebleDrive * 0.42));
    if (horizontal) context.fillRect(width * lane - unit * 0.009, edge + direction * reach * travel, unit * 0.018, Math.max(2, unit * 0.004));
    else context.fillRect(edge + direction * reach * travel, height * lane - unit * 0.009, Math.max(2, unit * 0.004), unit * 0.018);
  }
}

function drawMonolithSlabs(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(18, plan.bassElements + plan.midElements);
  for (let slab = 0; slab < count; slab += 1) {
    const side = slab % 4;
    const along = randomUnit(seed, 150_100 + slab);
    const reach = unit * plan.reach * (0.38 + plan.bassDrive * 0.62);
    const span = unit * (0.018 + randomUnit(seed, 150_200 + slab) * 0.045 + plan.bassDrive * 0.018);
    const color = slab % 5 === 0 ? highlight : slab % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.3 + plan.bassDrive * 0.36));
    if (side === 0) context.fillRect(0, along * height, reach, span);
    else if (side === 1) context.fillRect(width - reach, along * height, reach, span);
    else if (side === 2) context.fillRect(along * width, 0, span, reach);
    else context.fillRect(along * width, height - reach, span, reach);
    context.strokeStyle = rgba(highlight, alpha * (0.24 + plan.trebleDrive * 0.36));
    context.lineWidth = Math.max(1, unit * plan.thickness * 0.24);
    if (side < 2) context.strokeRect(side === 0 ? 0 : width - reach, along * height, reach, span);
    else context.strokeRect(along * width, side === 2 ? 0 : height - reach, span, reach);
  }
}

function drawPlasmaFilaments(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(20, plan.midElements + plan.trebleElements);
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  for (let filament = 0; filament < count; filament += 1) {
    const fromRight = filament % 2 === 1;
    const y = height * randomUnit(seed, 150_500 + filament);
    const edge = fromRight ? width : 0;
    const direction = fromRight ? -1 : 1;
    const reach = width * plan.reach * (0.42 + plan.midDrive * 0.58);
    const sway = Math.sin(time * (0.32 + plan.trebleDrive * 0.8) + filament) * unit * 0.018;
    const color = filament % 5 === 0 ? highlight : filament % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.32 + plan.trebleDrive * 0.4));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.25 + plan.bassDrive * 0.5));
    context.beginPath();
    context.moveTo(edge, y);
    context.bezierCurveTo(edge + direction * reach * 0.32, y + sway, edge + direction * reach * 0.72, y - sway, edge + direction * reach, y + sway * 0.3);
    context.stroke();
  }
}

function drawBloomPetals(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const count = Math.min(24, plan.midElements + plan.trebleElements);
  for (let petal = 0; petal < count; petal += 1) {
    const base = perimeterPoint((petal + 0.5) / count + time * 0.002, width, height, 0);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const distance = Math.max(1, Math.hypot(centerX - base.x, centerY - base.y));
    const reach = unit * plan.reach * (0.36 + plan.midDrive * 0.64);
    const directionX = (centerX - base.x) / distance;
    const directionY = (centerY - base.y) / distance;
    const tangentX = -directionY;
    const tangentY = directionX;
    const widthBase = unit * (0.006 + plan.bassDrive * 0.015);
    polygon(context, [
      { x: base.x + tangentX * widthBase, y: base.y + tangentY * widthBase },
      { x: base.x + directionX * reach, y: base.y + directionY * reach },
      { x: base.x - tangentX * widthBase, y: base.y - tangentY * widthBase },
    ]);
    const color = petal % 5 === 0 ? highlight : petal % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.24 + plan.midDrive * 0.28));
    context.fill();
    context.strokeStyle = rgba(highlight, alpha * (0.24 + plan.trebleDrive * 0.36));
    context.lineWidth = Math.max(1, unit * plan.thickness * 0.22);
    context.stroke();
  }
}

function drawSwarmVectors(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(30, plan.midElements + plan.trebleElements);
  for (let vector = 0; vector < count; vector += 1) {
    const progress = (randomUnit(seed, 151_100 + vector) + time * (0.012 + plan.trebleDrive * 0.05)) % 1;
    const base = perimeterPoint(progress, width, height, unit * 0.012);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const angle = Math.atan2(centerY - base.y, centerX - base.x) + (vector % 2 ? 0.18 : -0.18);
    const size = unit * (0.006 + plan.trebleDrive * 0.012 + (vector % 5 === 0 ? plan.bassDrive * 0.01 : 0));
    polygon(context, [
      { x: base.x + Math.cos(angle) * size * 1.8, y: base.y + Math.sin(angle) * size * 1.8 },
      { x: base.x + Math.cos(angle + 2.5) * size, y: base.y + Math.sin(angle + 2.5) * size },
      { x: base.x + Math.cos(angle - 2.5) * size, y: base.y + Math.sin(angle - 2.5) * size },
    ]);
    const color = vector % 5 === 0 ? highlight : vector % 2 ? secondary : primary;
    context.fillStyle = rgba(color, alpha * (0.34 + plan.trebleDrive * 0.38));
    context.fill();
  }
}

function drawMoireRings(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight } = input;
  const unit = Math.min(width, height);
  const ringCount = Math.min(10, Math.max(3, Math.ceil(plan.midElements * 0.65)));
  const corners = [[0, 0], [width, 0], [0, height], [width, height]] as const;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const radius = unit * plan.reach * (0.3 + (ring + 1) / ringCount * 0.82);
    const color = ring % 5 === 0 ? highlight : ring % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.24 + plan.midDrive * 0.34));
    context.lineWidth = Math.max(1.5, unit * plan.thickness * (0.25 + plan.bassDrive * 0.48));
    for (const [x, y] of corners) {
      context.beginPath();
      context.arc(x, y, radius + Math.sin(time * 0.14 + ring) * unit * 0.004, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

function drawCoronaFlares(input: DrawRadioVisualExpansion30PerimeterInput, alpha: number): void {
  const { context, width, height, time, plan, primary, secondary, highlight, seed } = input;
  const unit = Math.min(width, height);
  const count = Math.min(30, plan.midElements + plan.trebleElements);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  for (let flare = 0; flare < count; flare += 1) {
    const base = perimeterPoint((flare + 0.5) / count, width, height, 0);
    const distance = Math.max(1, Math.hypot(centerX - base.x, centerY - base.y));
    const directionX = (centerX - base.x) / distance;
    const directionY = (centerY - base.y) / distance;
    const reach = unit * plan.reach * (0.34 + plan.trebleDrive * 0.66) * (0.7 + randomUnit(seed, 151_700 + flare) * 0.3);
    const bend = Math.sin(time * (0.18 + plan.trebleDrive * 0.42) + flare) * unit * 0.008;
    const color = flare % 5 === 0 ? highlight : flare % 2 ? secondary : primary;
    context.strokeStyle = rgba(color, alpha * (0.32 + plan.trebleDrive * 0.4));
    context.lineWidth = Math.max(1.25, unit * plan.thickness * (0.22 + plan.bassDrive * 0.44));
    context.beginPath();
    context.moveTo(base.x, base.y);
    context.quadraticCurveTo(base.x + directionX * reach * 0.58 - directionY * bend, base.y + directionY * reach * 0.58 + directionX * bend, base.x + directionX * reach, base.y + directionY * reach);
    context.stroke();
  }
}

export function drawRadioVisualMusicExpansion30Perimeter(
  input: DrawRadioVisualExpansion30PerimeterInput,
): boolean {
  const { context, mix, drives, plan } = input;
  const alpha = clampVisualValue(mix * (0.82 + drives.presence * 0.16) * plan.strength * 1.14, 0, 0.94);
  context.save();
  context.globalCompositeOperation = "source-over";
  if (plan.motif === "cathedral_buttresses") drawCathedralButtresses(input, alpha);
  else if (plan.motif === "ferrofluid_spikes") drawFerrofluidSpikes(input, alpha);
  else if (plan.motif === "orbital_ticks") drawOrbitalTicks(input, alpha);
  else if (plan.motif === "loom_shuttles") drawLoomShuttles(input, alpha);
  else if (plan.motif === "monolith_slabs") drawMonolithSlabs(input, alpha);
  else if (plan.motif === "plasma_filaments") drawPlasmaFilaments(input, alpha);
  else if (plan.motif === "bloom_petals") drawBloomPetals(input, alpha);
  else if (plan.motif === "swarm_vectors") drawSwarmVectors(input, alpha);
  else if (plan.motif === "moire_rings") drawMoireRings(input, alpha);
  else if (plan.motif === "corona_flares") drawCoronaFlares(input, alpha);
  else {
    context.restore();
    return false;
  }
  context.restore();
  return true;
}
