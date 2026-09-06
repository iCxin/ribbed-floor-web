/**
 * 混凝土材料库与 1m 宽板带截面设计公式。
 * 取值依据 SL 191-2008 / GB 50010-2010；与 C++ struct_calc.cpp 一致。
 */

export interface ConcreteGrade { grade: number; fc: number; ft: number; ftk: number; Ec: number } // Ec: MPa

const GRADE_TABLE: ConcreteGrade[] = [
  { grade: 20, fc: 11.9, ft: 1.03, ftk: 1.54, Ec: 2.55e4 },
  { grade: 25, fc: 14.3, ft: 1.24, ftk: 1.78, Ec: 2.8e4 },
  { grade: 30, fc: 16.7, ft: 1.45, ftk: 2.01, Ec: 3.0e4 },
  { grade: 35, fc: 19.1, ft: 1.66, ftk: 2.2, Ec: 3.15e4 },
  { grade: 40, fc: 21.5, ft: 1.87, ftk: 2.39, Ec: 3.25e4 },
  { grade: 45, fc: 23.9, ft: 2.08, ftk: 2.51, Ec: 3.35e4 },
  { grade: 50, fc: 26.3, ft: 2.29, ftk: 2.64, Ec: 3.45e4 },
  { grade: 55, fc: 28.7, ft: 2.5, ftk: 2.74, Ec: 3.55e4 },
  { grade: 60, fc: 31.1, ft: 2.71, ftk: 2.85, Ec: 3.6e4 },
  { grade: 65, fc: 33.5, ft: 2.92, ftk: 2.93, Ec: 3.65e4 },
  { grade: 70, fc: 35.9, ft: 3.13, ftk: 3.0, Ec: 3.7e4 },
  { grade: 75, fc: 38.3, ft: 3.34, ftk: 3.05, Ec: 3.75e4 },
  { grade: 80, fc: 40.7, ft: 3.55, ftk: 3.11, Ec: 3.8e4 },
]

export function queryConcrete(grade: number): ConcreteGrade {
  return GRADE_TABLE.find((g) => g.grade === grade) ?? GRADE_TABLE[2] // 兜底 C30
}

export interface SteelBarSpec {
  id: number
  diameterMm: number
  areaMm2: number
  weightKgPerM: number
}

/** 标准钢筋规格库 D8~D25 */
export const STEEL_BARS: SteelBarSpec[] = [
  { id: 1, diameterMm: 8, areaMm2: 50.27, weightKgPerM: 0.395 },
  { id: 2, diameterMm: 10, areaMm2: 78.54, weightKgPerM: 0.617 },
  { id: 3, diameterMm: 12, areaMm2: 113.1, weightKgPerM: 0.888 },
  { id: 4, diameterMm: 14, areaMm2: 153.94, weightKgPerM: 1.208 },
  { id: 5, diameterMm: 16, areaMm2: 201.06, weightKgPerM: 1.578 },
  { id: 6, diameterMm: 18, areaMm2: 254.47, weightKgPerM: 2.0 },
  { id: 7, diameterMm: 20, areaMm2: 314.16, weightKgPerM: 2.466 },
  { id: 8, diameterMm: 22, areaMm2: 380.13, weightKgPerM: 2.985 },
  { id: 9, diameterMm: 25, areaMm2: 490.87, weightKgPerM: 3.854 },
]

/** 荷载长期作用下的挠度增大系数 [持续时间分级][配筋率分级] */
export const DEFLECTION_INCREASE_FACTOR: readonly number[][] = [
  [1.4, 1.6, 1.8, 2.0, 2.2],
  [1.3, 1.5, 1.7, 1.9, 2.1],
  [1.2, 1.4, 1.6, 1.8, 2.0],
  [1.1, 1.3, 1.5, 1.7, 1.9],
  [1.0, 1.2, 1.4, 1.6, 1.8],
]

/** 规范限值常量 */
export const REG = {
  minRebarRatio: 0.002,
  maxRebarRatio: 0.025,
  minThicknessM: 0.08,
  maxThicknessM: 0.6,
  minSpanM: 0.5,
  maxSpanM: 12.0,
  twoWayAspectMax: 3.0,
  oneWayAspectMin: 2.0,
  deadMin: 0.5,
  deadMax: 25.0,
  liveMin: 0.0,
  liveMax: 30.0,
  allowableDeflectionRatio: 1 / 250,
  allowableCrackWidthMm: 0.3,
  safetyFactor: 1.2, // SL 191-2008 结构安全系数
  maxIterations: 10,
  coverMm: 25.0,
  fy: 360.0, // HRB400
  Es: 200000.0,
  maxBarSpacing: 200.0,
  minBarSpacing: 50.0,
  minDistributionRatio: 0.0015,
} as const

/** 1m 宽板带设计截面参数 */
export interface StripContext {
  thicknessMm: number
  coverMm: number
  fc: number
  ftk: number
  Ec: number
  fy: number
  Es: number
  barDiameterMm: number
}

export function effectiveDepthMm(ctx: StripContext): number {
  return ctx.thicknessMm - ctx.coverMm - ctx.barDiameterMm / 2
}

/** 钢筋应力 σs = M / (0.87 h0 As)，M: kN·m/m，As: mm²/m -> MPa */
export function steelStress(momentKNm: number, asMm2: number, h0Mm: number): number {
  if (asMm2 <= 0 || h0Mm <= 0) return 0
  return (momentKNm * 1e6) / (0.87 * h0Mm * asMm2)
}

/** 最大裂缝宽度 wmax（粘结滑移公式，αcr=1.9 受弯构件），mm */
export function crackWidth(momentKNm: number, asMm2: number, ctx: StripContext): number {
  if (asMm2 <= 0 || momentKNm <= 0) return 0
  const h0 = effectiveDepthMm(ctx)
  const sigmaS = steelStress(momentKNm, asMm2, h0)
  let rhoTe = asMm2 / (0.5 * 1000 * ctx.thicknessMm)
  if (rhoTe < 0.01) rhoTe = 0.01
  let psi = 1.1 - (0.65 * ctx.ftk) / (rhoTe * sigmaS)
  psi = Math.max(0.2, Math.min(1.0, psi))
  const alphaCr = 1.9
  return alphaCr * psi * (sigmaS / ctx.Es) * (1.9 * ctx.coverMm + (0.08 * ctx.barDiameterMm) / rhoTe)
}

/** 单筋矩形截面抗弯承载力 Mu（kN·m/m）；超筋返回 -1 */
export function momentCapacity(asMm2: number, ctx: StripContext): number {
  if (asMm2 <= 0) return 0
  const h0 = effectiveDepthMm(ctx)
  const x = (ctx.fy * asMm2) / (1.0 * ctx.fc * 1000)
  if (x / h0 > 0.518) return -1
  return (ctx.fy * asMm2 * (h0 - x / 2)) / 1e6
}

/** 满足弯矩 M 所需钢筋面积（mm²/m）；超筋返回 -1 */
export function requiredAs(momentKNm: number, ctx: StripContext): number {
  if (momentKNm <= 0) return 0
  const h0 = effectiveDepthMm(ctx)
  const alphaS = (momentKNm * 1e6) / (1.0 * ctx.fc * 1000 * h0 * h0)
  if (alphaS > 0.399) return -1
  const xi = 1 - Math.sqrt(1 - 2 * alphaS)
  return (1.0 * ctx.fc * 1000 * xi * h0) / ctx.fy
}
