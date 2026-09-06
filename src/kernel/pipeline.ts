/**
 * 设计流水线：参数校验 -> FC01 协议帧组装 -> FEM 分析 -> 配筋优化 ->
 * 结果载荷封装 -> 设计记录归档（localStorage）。与嵌入式版共用同一算法。
 */

import {
  buildResultPayload, buildSlabParamFrame, bytesToHex,
  DEVICE_ADDR_MIN, DEVICE_ADDR_SELF, FC_RESULT_PACKAGE, buildFrame,
} from './protocol'
import { queryConcrete, REG } from './concrete'
import { analyze, type FemResult, type SlabParam } from './fem'
import { makeOptimize, type OptResult } from './optimizer'

/** 参数合法性校验错误码（与 C++ ParameterErrorCode 对应） */
export type ValidationError =
  | { code: 0x00; message: 'OK' }
  | { code: 0x08; message: string } // 强度等级越界
  | { code: 0x09; message: string } // 配筋率越限
  | { code: 0x07; message: string } // 尺寸非法
  | { code: 0x0F; message: string } // 板厚越限
  | { code: 0x0E; message: string } // 荷载越限
  | { code: 0x0A; message: string } // 长宽比冲突

export function validate(input: DesignInput): ValidationError {
  const aspect = input.spanM / input.widthM
  const thicknessM = input.thicknessMm / 1000
  if (!queryConcrete(input.grade) || input.grade < 20 || input.grade > 80)
    return { code: 0x08, message: '混凝土强度等级不在 C20~C80 规范序列内' }
  if (input.ratio < REG.minRebarRatio)
    return { code: 0x09, message: '配筋率低于最小限值' }
  if (input.ratio > REG.maxRebarRatio)
    return { code: 0x09, message: '配筋率超出最大限值（超筋）' }
  if (input.spanM <= 0 || input.widthM <= 0)
    return { code: 0x07, message: '楼盖尺寸（跨度、宽度）必须为正数' }
  if (input.spanM < REG.minSpanM || input.spanM > REG.maxSpanM ||
      input.widthM < REG.minSpanM || input.widthM > REG.maxSpanM)
    return { code: 0x07, message: '楼盖跨度/宽度超出 0.5m~12.0m 适用范围' }
  if (thicknessM < REG.minThicknessM || thicknessM > REG.maxThicknessM)
    return { code: 0x0f, message: '板厚超出规范最小/最大厚度要求' }
  if (input.deadKPa < REG.deadMin || input.deadKPa > REG.deadMax ||
      input.liveKPa < REG.liveMin || input.liveKPa > REG.liveMax)
    return { code: 0x0e, message: '荷载值超出规范取值范围' }
  if (input.slabType === 1 && aspect > REG.twoWayAspectMax)
    return { code: 0x0a, message: '长宽比大于 3.0 应按单向板计算，与双向板声明冲突' }
  if (input.slabType === 0 && aspect < REG.oneWayAspectMin)
    return { code: 0x0a, message: '长宽比小于 2.0 应按双向板计算，与单向板声明冲突' }
  return { code: 0x00, message: 'OK' }
}

export interface DesignInput {
  grade: number
  slabType: 0 | 1
  spanM: number
  widthM: number
  thicknessMm: number
  ratio: number
  deadKPa: number
  liveKPa: number
  duration: number
}

export interface DesignResult {
  ok: boolean
  errorCode: number
  errorMessage: string
  designNumber: number
  elapsedMs: number
  input: {
    grade: number; fc: number; ft: number
    spanM: number; widthM: number; thicknessMm: number
    ratio: number; slabType: 0 | 1
    deadKPa: number; liveKPa: number; aspectRatio: number
  }
  calc: {
    meshNx: number; meshNy: number; totalDofs: number
    midX: number; supX: number; midY: number; supY: number; shear: number
    deflShort: number; deflLong: number; deflFactor: number; deflAllow: number; deflPassed: boolean
    crackMax: number; crackAllow: number; crackPassed: boolean
  }
  opt: OptResult
  frameHex: string
  paramFrameHex: string
}

const DESIGN_COUNTER_KEY = 'rfds-web-design-counter'

function nextDesignNumber(): number {
  let n = 1000
  try {
    n = parseInt(localStorage.getItem(DESIGN_COUNTER_KEY) ?? '1000', 10) || 1000
    localStorage.setItem(DESIGN_COUNTER_KEY, String(n + 1))
  } catch { /* 无 localStorage 时退化为内存计数 */ }
  return n
}

/** 全流水线：校验 -> 组帧 -> 分析 -> 优化 -> 封装 */
export function design(input: DesignInput): DesignResult {
  const t0 = performance.now()
  const err = validate(input)
  if (err.code !== 0x00) {
    return {
      ok: false, errorCode: err.code, errorMessage: err.message,
      designNumber: 0, elapsedMs: performance.now() - t0,
      input: {
        grade: input.grade, fc: 0, ft: 0,
        spanM: input.spanM, widthM: input.widthM, thicknessMm: input.thicknessMm,
        ratio: input.ratio, slabType: input.slabType,
        deadKPa: input.deadKPa, liveKPa: input.liveKPa,
        aspectRatio: input.spanM / input.widthM,
      },
      opt: null!, calc: null!, frameHex: '', paramFrameHex: '',
    }
  }

  // FC01 协议帧（与硬件接口逐字节一致）
  const paramFrame = buildSlabParamFrame({
    grade: input.grade,
    spanMm: input.spanM * 1000,
    widthMm: input.widthM * 1000,
    thicknessMm: input.thicknessMm,
    ratio: input.ratio,
    slabType: input.slabType,
    deadKPa: input.deadKPa,
    liveKPa: input.liveKPa,
    duration: input.duration,
  }, DEVICE_ADDR_MIN)

  const param: SlabParam = {
    grade: input.grade,
    spanM: input.spanM,
    widthM: input.widthM,
    thicknessM: input.thicknessMm / 1000,
    ratio: input.ratio,
    slabType: input.slabType,
    deadKPa: input.deadKPa,
    liveKPa: input.liveKPa,
    duration: input.duration,
  }

  const concrete = queryConcrete(input.grade)
  const stripMaterials = {
    fc: concrete.fc, ftk: concrete.ftk, Ec: concrete.Ec,
    coverMm: REG.coverMm, fy: REG.fy, Es: REG.Es,
  }

  const analyzeWith = (p: SlabParam): FemResult => analyze(p, stripMaterials)
  const doOptimize = makeOptimize(stripMaterials)

  let calc = analyzeWith(param)
  const optimized = doOptimize(param, calc, analyzeWith)
  calc = optimized.calc
  const opt = optimized.result

  const designNumber = nextDesignNumber()
  const timestamp = Math.floor(Date.now() / 1000)

  const payload = buildResultPayload({
    statusCode: opt.allChecksPassed ? 0x00 : 0x01,
    designNumber,
    timestamp,
    spanMm: input.spanM * 1000,
    widthMm: input.widthM * 1000,
    deflectionMm: calc.deflection.longM * 1000,
    allowDeflectionMm: calc.deflection.allowM * 1000,
    crackMm: calc.crack.maxMm,
    weightKg: opt.steelWeightKg,
    deflPass: calc.deflection.passed,
    crackPass: calc.crack.passed,
    capacityPass: opt.safetyFactor >= 1.0,
    bottomX: [opt.bottomX.barDiameterMm, opt.bottomX.barSpacingMm],
    bottomY: [opt.bottomY.barDiameterMm, opt.bottomY.barSpacingMm],
    topX: [opt.topX.barDiameterMm, opt.topX.barSpacingMm],
    topY: [opt.topY.barDiameterMm, opt.topY.barSpacingMm],
    ratio: opt.totalRebarRatio,
    safety: opt.safetyFactor,
    iterations: opt.iterationsUsed,
    constructive: opt.constructiveAdjusted,
    grade: input.grade,
    slabType: input.slabType,
  })
  const outFrame = buildFrame(DEVICE_ADDR_SELF, FC_RESULT_PACKAGE, Array.from(payload))

  return {
    ok: true,
    errorCode: 0,
    errorMessage: 'OK',
    designNumber,
    elapsedMs: performance.now() - t0,
    input: {
      grade: input.grade, fc: concrete.fc, ft: concrete.ft,
      spanM: input.spanM, widthM: input.widthM, thicknessMm: input.thicknessMm,
      ratio: input.ratio, slabType: input.slabType,
      deadKPa: input.deadKPa, liveKPa: input.liveKPa,
      aspectRatio: input.spanM / input.widthM,
    },
    calc: {
      meshNx: calc.meshNx, meshNy: calc.meshNy, totalDofs: calc.totalDofs,
      midX: calc.forces.midX, supX: calc.forces.supX,
      midY: calc.forces.midY, supY: calc.forces.supY, shear: calc.forces.shear,
      deflShort: calc.deflection.shortM * 1000, deflLong: calc.deflection.longM * 1000,
      deflFactor: calc.deflection.factor, deflAllow: calc.deflection.allowM * 1000,
      deflPassed: calc.deflection.passed,
      crackMax: calc.crack.maxMm, crackAllow: calc.crack.allowMm, crackPassed: calc.crack.passed,
    },
    opt,
    frameHex: bytesToHex(outFrame),
    paramFrameHex: bytesToHex(paramFrame),
  }
}
