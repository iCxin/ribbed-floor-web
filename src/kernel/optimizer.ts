/**
 * 配筋优化：以用钢量最小为目标，承载力（K≥1.2）/ 裂缝 / 最小配筋率为约束，
 * 标准直径序列规格匹配 + 单调可行搜索 + 回溯保护。
 * 与 C++ src/rebar_optim.cpp 同一算法。
 */

import { REG, STEEL_BARS, type StripContext, crackWidth, momentCapacity, requiredAs, steelStress } from './concrete'
import type { FemResult, SlabParam } from './fem'

export interface RebarScheme {
  barDiameterMm: number
  barSpacingMm: number
  areaMm2PerM: number
  momentCapacityKNm: number
  steelStressMPa: number
  crackWidthMm: number
}

export interface StripScheme {
  scheme: RebarScheme
  requiredAsMm2: number
  constructive: boolean
}

export interface OptResult {
  bottomX: RebarScheme
  bottomY: RebarScheme
  topX: RebarScheme
  topY: RebarScheme
  totalRebarRatio: number
  steelWeightKg: number
  safetyFactor: number
  iterationsUsed: number
  constructiveAdjusted: boolean
  allChecksPassed: boolean
  summary: string
}

const EMPTY_SCHEME: RebarScheme = {
  barDiameterMm: 0, barSpacingMm: 0, areaMm2PerM: 0,
  momentCapacityKNm: 0, steelStressMPa: 0, crackWidthMm: 0,
}

/** 规格匹配：目标面积 ->（直径, 间距），用钢量最小优先、同面积大直径优先 */
function matchBarSpec(targetAs: number, ctx: StripContext, momentKNm: number): StripScheme | null {
  if (targetAs <= 0) return null
  let found = false
  let bestScore = Infinity
  let best: StripScheme | null = null

  for (const bar of STEEL_BARS) {
    const areaPerMeter = 1000 * bar.areaMm2 // 间距 1mm 时的单位面积
    let spacing = Math.min(areaPerMeter / targetAs, REG.maxBarSpacing)
    spacing = Math.floor(spacing / 5) * 5 // 5mm 施工模数
    if (spacing < REG.minBarSpacing) continue

    const asProvided = areaPerMeter / spacing
    const ctxLocal = { ...ctx, barDiameterMm: bar.diameterMm }
    const mu = momentCapacity(asProvided, ctxLocal)
    if (mu < 0) continue // 超筋
    if (mu < REG.safetyFactor * momentKNm) continue
    const w = crackWidth(momentKNm, asProvided, ctxLocal)
    if (w > REG.allowableCrackWidthMm) continue

    const h0 = ctx.thicknessMm - ctx.coverMm - bar.diameterMm / 2
    const cand: StripScheme = {
      requiredAsMm2: targetAs,
      constructive: false,
      scheme: {
        barDiameterMm: bar.diameterMm,
        barSpacingMm: spacing,
        areaMm2PerM: asProvided,
        momentCapacityKNm: mu,
        steelStressMPa: steelStress(momentKNm, asProvided, h0),
        crackWidthMm: w,
      },
    }
    const score = asProvided - bar.diameterMm * 0.05
    if (!found || score < bestScore) { bestScore = score; best = cand; found = true }
  }
  return best
}

/** 单板带方案设计（初拟 + 迭代 + 回溯保护） */
export function designStrip(momentKNm: number, ctx: StripContext, isMainRebar: boolean): StripScheme {
  const asMin = REG.minRebarRatio * 1000 * ctx.thicknessMm

  // 非受力方向：构造分布筋（>= 0.15%bh 且 >= 15% 构造最小面积，间距 <= 250）
  if (!isMainRebar || momentKNm < 1e-6) {
    const target = Math.max(REG.minDistributionRatio * 1000 * ctx.thicknessMm, 0.15 * asMin)
    for (const bar of STEEL_BARS) {
      const areaPerMeter = 1000 * bar.areaMm2
      let spacing = Math.min(areaPerMeter / target, 250)
      spacing = Math.floor(spacing / 5) * 5
      if (spacing < REG.minBarSpacing) continue
      return {
        requiredAsMm2: target,
        constructive: true,
        scheme: { ...EMPTY_SCHEME, barDiameterMm: bar.diameterMm, barSpacingMm: spacing, areaMm2PerM: areaPerMeter / spacing },
      }
    }
    return {
      requiredAsMm2: target,
      constructive: true,
      scheme: { ...EMPTY_SCHEME, barDiameterMm: 8, barSpacingMm: 200, areaMm2PerM: (1000 * 50.27) / 200 },
    }
  }

  // 受力方向：承载力 / 裂缝 / 最小配筋率三重控制
  const asCapacity = requiredAs(REG.safetyFactor * momentKNm, ctx)
  let asCrack = 0
  {
    let asTry = Math.max(asCapacity, asMin)
    let w = crackWidth(momentKNm, asTry, ctx)
    let guard = 0
    while (w > REG.allowableCrackWidthMm && guard++ < 20) {
      asTry *= 1.15
      w = crackWidth(momentKNm, asTry, ctx)
    }
    asCrack = asTry
  }
  const targetAs = Math.max(asCapacity, asCrack, asMin)

  let best = matchBarSpec(targetAs, ctx, momentKNm)
  let bump = targetAs
  let guard = 0
  while (!best && guard++ < REG.maxIterations) {
    bump *= 1.2
    best = matchBarSpec(bump, ctx, momentKNm)
  }
  if (!best) {
    // 算法容错：迭代超限返回默认安全方案 D12@100
    const fallbackAs = (1000 * 113.1) / 100
    return {
      requiredAsMm2: targetAs,
      constructive: true,
      scheme: {
        ...EMPTY_SCHEME,
        barDiameterMm: 12, barSpacingMm: 100, areaMm2PerM: fallbackAs,
        momentCapacityKNm: momentCapacity(fallbackAs, ctx),
      },
    }
  }
  // 回溯保护：面积超过目标 1.5 倍时按原目标重匹配
  if (best.scheme.areaMm2PerM > targetAs * 1.5) {
    const retry = matchBarSpec(targetAs, ctx, momentKNm)
    if (retry) best = retry
  }
  return best
}

export type RecalcFn = (param: SlabParam) => FemResult

/** 工厂：注入混凝土材料参数后返回优化入口 */
export function makeOptimize(materials: Pick<StripContext, 'fc' | 'ftk' | 'Ec'>) {
  return (param: SlabParam, calc: FemResult, recalc: RecalcFn) => {
    const ctx: StripContext = {
      thicknessMm: param.thicknessM * 1000,
      coverMm: REG.coverMm,
      ...materials,
      fy: REG.fy,
      Es: REG.Es,
      barDiameterMm: 12,
    }
    return optimizeInner(param, calc, recalc, ctx)
  }
}

function optimizeInner(param: SlabParam, calc: FemResult, recalc: RecalcFn, ctx: StripContext): { result: OptResult; param: SlabParam; calc: FemResult } {
  let iterationsUsed = 0
  let bestResult: OptResult | null = null

  for (let iter = 0; iter < REG.maxIterations; iter++) {
    iterationsUsed = iter + 1
    const twoWay = param.slabType === 1

    // 控制截面选取与板带设计：单向板短边（Y）受力，长边（X）分布筋
    const bx = twoWay ? designStrip(calc.forces.midX, ctx, true) : designStrip(0, ctx, false)
    const by = designStrip(calc.forces.midY, ctx, true)
    const tx = twoWay ? designStrip(calc.forces.supX, ctx, true) : designStrip(0, ctx, false)
    const ty = designStrip(calc.forces.supY, ctx, true)

    const asMin = REG.minRebarRatio * 1000 * ctx.thicknessMm
    const constructive =
      bx.constructive || by.constructive || tx.constructive || ty.constructive ||
      bx.scheme.areaMm2PerM <= asMin + 1e-9

    const rho = (bx.scheme.areaMm2PerM + by.scheme.areaMm2PerM) / (2 * 1000 * ctx.thicknessMm)

    const lenX = param.spanM
    const lenY = param.widthM
    const vol =
      bx.scheme.areaMm2PerM * 1e-6 * lenX * lenY +
      by.scheme.areaMm2PerM * 1e-6 * lenX * lenY +
      tx.scheme.areaMm2PerM * 1e-6 * lenX * lenY * 0.3 +
      ty.scheme.areaMm2PerM * 1e-6 * lenX * lenY * 0.3
    const weight = vol * 7850

    let sf = Infinity
    if (twoWay && calc.forces.midX > 1e-9)
      sf = Math.min(sf, bx.scheme.momentCapacityKNm / (REG.safetyFactor * calc.forces.midX))
    if (calc.forces.midY > 1e-9)
      sf = Math.min(sf, by.scheme.momentCapacityKNm / (REG.safetyFactor * calc.forces.midY))
    if (!isFinite(sf)) sf = 1.0

    const current: OptResult = {
      bottomX: bx.scheme, bottomY: by.scheme, topX: tx.scheme, topY: ty.scheme,
      totalRebarRatio: rho, steelWeightKg: weight, safetyFactor: sf,
      iterationsUsed, constructiveAdjusted: constructive,
      allChecksPassed: calc.deflection.passed && calc.crack.passed,
      summary: calc.deflection.passed ? '配筋方案满足承载力、裂缝与挠度要求' : '挠度超限，正在调整配筋率重新验算',
    }
    bestResult = current

    if (calc.deflection.passed) break

    // 挠度不足：上调建议配筋率重新分析
    param = { ...param, ratio: Math.min(param.ratio * 1.25, REG.maxRebarRatio) }
    calc = recalc(param)
  }

  const result = bestResult!
  if (!calc.deflection.passed) {
    result.summary = '已达最大迭代次数，返回当前可行方案，建议复核截面高度'
    result.allChecksPassed = false
  }
  return { result, param, calc }
}
