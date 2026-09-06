/**
 * 内核自检：校验算法黄金向量、协议帧自反性、FEM 与 Timoshenko 薄板
 * 解析解对比、截面公式往返、优化器约束、全流水线端到端。
 * 与嵌入式版 --selftest 的核心断言一致。
 */

import { crc16, crc32, buildSlabParamFrame, parseFrame, hexToBytes, decodeBarDiameter } from './protocol'
import { md5Hex } from './md5'
import { momentCapacity, requiredAs, crackWidth, type StripContext } from './concrete'
import { design, type DesignInput } from './pipeline'

export interface SelfTestItem {
  name: string
  ok: boolean
  detail: string
}

const c30Ctx: StripContext = {
  thicknessMm: 120, coverMm: 25, fc: 16.7, ftk: 2.01, Ec: 3.0e4,
  fy: 360, Es: 200000, barDiameterMm: 12,
}

function textToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function feMCheck(): { ok: boolean; detail: string } {
  // 四边简支方板 a=4m, h=150mm, C30, q=10kPa 与 Timoshenko 解析解对比
  const input: DesignInput = {
    grade: 30, slabType: 1, spanM: 4, widthM: 4, thicknessMm: 150,
    ratio: 0.005, deadKPa: 6, liveKPa: 4, duration: 3,
  }
  const r = design(input)
  if (!r.ok) return { ok: false, detail: 'FEM 求解失败' }
  const E = 3.0e10, nu = 0.2, h = 0.15, q = 10e3, a = 4
  const D = (E * h ** 3) / (12 * (1 - nu * nu))
  const wAnalytic = (0.00406 * q * a ** 4) / D
  const wFem = r.calc.deflShort / 1000
  const deflErr = Math.abs(wFem - wAnalytic) / wAnalytic
  const mAnalytic = (0.0479 * q * a * a) / 1000
  const mFem = r.calc.midX
  const mErr = Math.abs(mFem - mAnalytic) / mAnalytic
  return {
    ok: deflErr < 0.08 && mErr < 0.15,
    detail: `挠度 解析=${(wAnalytic * 1000).toFixed(3)}mm FEM=${(wFem * 1000).toFixed(3)}mm（${(deflErr * 100).toFixed(1)}%）· 弯矩 解析=${mAnalytic.toFixed(2)} FEM=${mFem.toFixed(2)}（${(mErr * 100).toFixed(1)}%）`,
  }
}

export function runSelfTest(): SelfTestItem[] {
  const items: SelfTestItem[] = []
  const add = (name: string, ok: boolean, detail = '') => items.push({ name, ok, detail })

  // 1. 校验算法黄金向量
  const c16 = crc16(textToBytes('123456789'))
  add('CRC16-XMODEM 黄金向量', c16 === 0x29b1, `"123456789" -> 0x${c16.toString(16).toUpperCase().padStart(4, '0')}`)
  const c32 = crc32(textToBytes('123456789'))
  add('CRC32-IEEE 黄金向量', c32 === 0xcbf43926, `"123456789" -> 0x${c32.toString(16).toUpperCase()}`)
  const md5abc = md5Hex(textToBytes('abc'))
  add('MD5 黄金向量（RFC 1321）', md5abc === '900150983cd24fb0d6963f7d28e17f72', `"abc" -> ${md5abc.slice(0, 16)}…`)

  // 2. 协议帧自反性 + 畸变检测
  const frame = buildSlabParamFrame({
    grade: 30, spanMm: 6000, widthMm: 4500, thicknessMm: 120,
    ratio: 0.004, slabType: 1, deadKPa: 3, liveKPa: 2.5, duration: 3,
  })
  const parsed = parseFrame(frame)
  add('帧同步与载荷提取', parsed.error === 'OK' && parsed.frame.payload.length === 28, `载荷 ${parsed.frame?.payload.length ?? 0} 字节`)
  const corrupted = frame.slice()
  corrupted[8] ^= 0x01
  add('数据畸变检测（CRC16）', parseFrame(corrupted).error === 'CRC_ERROR')

  // 3. FEM 与解析解对比
  const fem = feMCheck()
  add('FEM vs Timoshenko 解析解', fem.ok, fem.detail)

  // 4. 截面公式往返：requiredAs(M) -> capacity(As) ≈ M
  const M = 12.5
  const as = requiredAs(M, c30Ctx)
  const mu = as > 0 ? momentCapacity(as, c30Ctx) : -1
  add('承载力公式往返一致性', as > 0 && Math.abs(mu - M) < 1e-6, `As=${as.toFixed(1)}mm²/m -> Mu=${mu.toFixed(3)} kN·m/m`)
  const w = crackWidth(M, 400, c30Ctx)
  add('裂缝宽度计算', w > 0 && w < 1.0, `M=12.5, As=400 -> w=${w.toFixed(3)}mm`)

  // 5. 全流水线：双向板端到端
  const demo: DesignInput = {
    grade: 30, slabType: 1, spanM: 6, widthM: 4.5, thicknessMm: 120,
    ratio: 0.004, deadKPa: 3, liveKPa: 2.5, duration: 3,
  }
  const r = design(demo)
  add('全流水线端到端', r.ok && r.opt.allChecksPassed, `#${r.designNumber} · ${r.frameHex.length / 2} 字节结果帧`)
  add('输出帧长度合规（<=128B）', r.frameHex.length / 2 <= 128 && r.frameHex.length / 2 >= 48, `${r.frameHex.length / 2} 字节`)
  add('输出帧 CRC 自反校验', parseFrame(hexToBytes(r.frameHex)).error === 'OK')
  add('钢筋直径 4bit 编码表', decodeBarDiameter(encodeCheck()) === 16 && decodeBarDiameter(0) === 0)
  function encodeCheck(): number {
    // 编码表：D8..D25 -> 1..9
    const table = [8, 10, 12, 14, 16, 18, 20, 22, 25]
    return table.indexOf(16) + 1
  }
  add('受力筋构造合规', r.opt.bottomX.barSpacingMm >= 50 && r.opt.bottomX.barSpacingMm <= 200 && r.opt.bottomX.barDiameterMm >= 8,
    `板底 X：D${r.opt.bottomX.barDiameterMm}@${r.opt.bottomX.barSpacingMm}`)
  add('承载力安全储备 >= 1', r.opt.safetyFactor >= 1.0, `Mu/(K·M) = ${r.opt.safetyFactor.toFixed(2)}`)

  // 6. 非法参数拒绝（C15）
  const bad = design({ ...demo, grade: 15 })
  add('强度等级越界拒绝', !bad.ok && bad.errorCode === 0x08, `0x${bad.errorCode.toString(16).padStart(2, '0')} ${bad.errorMessage}`)
  // 7. 长宽比逻辑冲突
  const badRatio = design({ ...demo, widthM: 1.5 })
  add('双向板长宽比冲突拒绝', !badRatio.ok && badRatio.errorCode === 0x0a, `0x${badRatio.errorCode.toString(16).padStart(2, '0')} ${badRatio.errorMessage}`)

  // 8. 单向板路径
  const oneWay = design({ grade: 30, slabType: 0, spanM: 6, widthM: 1.8, thicknessMm: 110, ratio: 0.006, deadKPa: 3.5, liveKPa: 2.5, duration: 3 })
  add('单向板短边受力方向', oneWay.ok && oneWay.opt.bottomY.barDiameterMm >= 8 && oneWay.opt.bottomY.areaMm2PerM >= oneWay.opt.bottomX.areaMm2PerM,
    `主筋 Y：D${oneWay.opt.bottomY.barDiameterMm}@${oneWay.opt.bottomY.barSpacingMm}`)

  return items
}
