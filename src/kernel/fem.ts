/**
 * 结构计算内核：ACM 四节点矩形薄板弯曲单元有限元。
 * 每节点 3 自由度（w, ∂w/∂x, ∂w/∂y）；形函数由 12 项多项式基
 * 在节点插值条件下数值求逆得到；2×2 高斯积分组装；Cholesky 求解。
 * 与 C++ src/struct_calc.cpp 同一算法，单位 SI（N, m, Pa）。
 */

import { DEFLECTION_INCREASE_FACTOR, REG, queryConcrete, type StripContext, crackWidth } from './concrete'

/* -------------------- ACM 12 项多项式基（自然坐标） -------------------- */
/* 项序：0:1 1:ξ 2:η 3:ξ² 4:ξη 5:η² 6:ξ³ 7:ξ²η 8:ξη² 9:η³ 10:ξ³η 11:ξη³ */

function basisValue(t: number, xi: number, eta: number): number {
  switch (t) {
    case 0: return 1
    case 1: return xi
    case 2: return eta
    case 3: return xi * xi
    case 4: return xi * eta
    case 5: return eta * eta
    case 6: return xi * xi * xi
    case 7: return xi * xi * eta
    case 8: return xi * eta * eta
    case 9: return eta * eta * eta
    case 10: return xi * xi * xi * eta
    case 11: return xi * eta * eta * eta
    default: return 0
  }
}
function basisDxi(t: number, xi: number, eta: number): number {
  switch (t) {
    case 1: return 1
    case 3: return 2 * xi
    case 4: return eta
    case 6: return 3 * xi * xi
    case 7: return 2 * xi * eta
    case 8: return eta * eta
    case 10: return 3 * xi * xi * eta
    case 11: return eta * eta * eta
    default: return 0
  }
}
function basisDeta(t: number, xi: number, eta: number): number {
  switch (t) {
    case 2: return 1
    case 4: return xi
    case 5: return 2 * eta
    case 7: return xi * xi
    case 8: return 2 * xi * eta
    case 9: return 3 * eta * eta
    case 10: return xi * xi * xi
    case 11: return 3 * xi * eta * eta
    default: return 0
  }
}
function basisDxixi(t: number, xi: number, _eta: number): number {
  switch (t) {
    case 3: return 2
    case 6: return 6 * xi
    case 7: return 2 * _eta
    case 10: return 6 * xi * _eta
    default: return 0
  }
}
function basisDetaeta(t: number, xi: number, eta: number): number {
  switch (t) {
    case 5: return 2
    case 8: return 2 * xi
    case 9: return 6 * eta
    case 11: return 6 * xi * eta
    default: return 0
  }
}
function basisDxieta(t: number, xi: number, eta: number): number {
  switch (t) {
    case 4: return 1
    case 7: return 2 * xi
    case 8: return 2 * eta
    case 10: return 3 * xi * xi
    case 11: return 3 * eta * eta
    default: return 0
  }
}

/** 12×12 矩阵求逆（LU 部分主元）；奇异返回 null */
function invert12x12(A: Float64Array): Float64Array | null {
  const lu = A.slice()
  const perm = new Int32Array(12)
  for (let k = 0; k < 12; k++) {
    let p = k
    let best = Math.abs(lu[k * 12 + k])
    for (let i = k + 1; i < 12; i++) {
      const v = Math.abs(lu[i * 12 + k])
      if (v > best) { best = v; p = i }
    }
    if (best < 1e-14) return null
    perm[k] = p
    if (p !== k) for (let j = 0; j < 12; j++) { const t = lu[p * 12 + j]; lu[p * 12 + j] = lu[k * 12 + j]; lu[k * 12 + j] = t }
    for (let i = k + 1; i < 12; i++) {
      lu[i * 12 + k] /= lu[k * 12 + k]
      const lik = lu[i * 12 + k]
      for (let j = k + 1; j < 12; j++) lu[i * 12 + j] -= lik * lu[k * 12 + j]
    }
  }
  const inv = new Float64Array(144)
  const x = new Float64Array(12)
  const b = new Float64Array(12)
  for (let col = 0; col < 12; col++) {
    b.fill(0)
    b[col] = 1
    for (let k = 0; k < 12; k++) if (perm[k] !== k) { const t = b[k]; b[k] = b[perm[k]]; b[perm[k]] = t }
    for (let i = 0; i < 12; i++) {
      let s = b[i]
      for (let j = 0; j < i; j++) s -= lu[i * 12 + j] * x[j]
      x[i] = s
    }
    for (let i = 11; i >= 0; i--) {
      let s = x[i]
      for (let j = i + 1; j < 12; j++) s -= lu[i * 12 + j] * x[j]
      x[i] = s / lu[i * 12 + i]
    }
    for (let r = 0; r < 12; r++) inv[r * 12 + col] = x[r]
  }
  return inv
}

/** 对称正定矩阵 Cholesky（LL^T）求解；非正定返回 null */
function solveCholesky(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const L = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j]
      for (let k = 0; k < j; k++) sum -= L[i * n + k] * L[j * n + k]
      if (i === j) {
        if (sum <= 1e-12) return null // 非正定：几何矛盾或约束不足
        L[i * n + i] = Math.sqrt(sum)
      } else {
        L[i * n + j] = sum / L[j * n + j]
      }
    }
  }
  const x = b
  for (let i = 0; i < n; i++) {
    let s = x[i]
    for (let k = 0; k < i; k++) s -= L[i * n + k] * x[k]
    x[i] = s / L[i * n + i]
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]
    x[i] = s / L[i * n + i]
  }
  return x
}

/* ------------------------------ 输入输出 ------------------------------ */

export type EdgeSupport = 'simply-supported' | 'fixed' | 'free'

export interface SlabParam {
  grade: number
  spanM: number // 长边 X
  widthM: number // 短边 Y
  thicknessM: number
  ratio: number
  slabType: 0 | 1
  deadKPa: number
  liveKPa: number
  duration: number // 0~4
}

export interface FemResult {
  meshNx: number
  meshNy: number
  totalDofs: number
  maxDisplacementM: number
  forces: {
    midX: number; supX: number; midY: number; supY: number; shear: number
  } // kN·m/m, kN/m
  deflection: {
    shortM: number; longM: number; factor: number; allowM: number; passed: boolean
  }
  crack: { maxMm: number; allowMm: number; passed: boolean }
}

/** FEM 主分析（对应 C++ StructuralCalculator::perform_structural_analysis） */
export function analyze(param: SlabParam, stripCtx: Omit<StripContext, 'thicknessMm' | 'barDiameterMm'>): FemResult {
  const { spanM: spanX, widthM: spanY, thicknessM: thick } = param
  const nu = 0.2
  const EcPa = queryConcrete(param.grade).Ec * 1e6
  const dFlex = (EcPa * thick ** 3) / (12 * (1 - nu * nu))

  // 网格：4×4 基准；沿弯曲主方向加密至 8
  let nx = 4
  let ny = 4
  if (param.slabType === 0) { nx = 4; ny = 8 } else if (spanX / spanY > 2) { nx = 8; ny = 4 }

  const numNodesX = nx + 1
  const numNodesY = ny + 1
  const totalNodes = numNodesX * numNodesY
  const dofsPerNode = 3
  const totalDofs = totalNodes * dofsPerNode
  const lx = spanX / nx
  const ly = spanY / ny

  const qK = (param.deadKPa + param.liveKPa) * 1000 // Pa，标准组合

  // ---- 形函数推导（与单元尺寸相关，一次求逆） ----
  const A = new Float64Array(144)
  const signs: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  for (let n = 0; n < 4; n++) {
    const [xiS, etaS] = signs[n]
    for (let j = 0; j < 12; j++) {
      A[(3 * n + 0) * 12 + j] = basisValue(j, xiS, etaS)
      A[(3 * n + 1) * 12 + j] = (2 / lx) * basisDxi(j, xiS, etaS)
      A[(3 * n + 2) * 12 + j] = (2 / ly) * basisDeta(j, xiS, etaS)
    }
  }
  const Ainv = invert12x12(A)
  if (!Ainv) throw new Error('单元形函数推导失败')
  const S = new Float64Array(144)
  for (let k = 0; k < 12; k++) for (let j = 0; j < 12; j++) S[k * 12 + j] = Ainv[j * 12 + k]

  // ---- 单元刚度矩阵与一致节点荷载（2×2 高斯积分） ----
  const gp = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)]
  const jac = (lx / 2) * (ly / 2)
  const D: number[][] = [
    [dFlex, dFlex * nu, 0],
    [dFlex * nu, dFlex, 0],
    [0, 0, (dFlex * (1 - nu)) / 2],
  ]

  const Ke = new Float64Array(144)
  const Fe = new Float64Array(12)
  for (const xi of gp) {
    for (const eta of gp) {
      const Bv = [new Float64Array(12), new Float64Array(12), new Float64Array(12)]
      for (let k = 0; k < 12; k++) {
        let dxx = 0, dyy = 0, dxy = 0
        for (let j = 0; j < 12; j++) {
          const c = S[k * 12 + j]
          if (c === 0) continue
          dxx += c * ((4 / (lx * lx)) * basisDxixi(j, xi, eta))
          dyy += c * ((4 / (ly * ly)) * basisDetaeta(j, xi, eta))
          dxy += c * ((4 / (lx * ly)) * basisDxieta(j, xi, eta))
        }
        Bv[0][k] = dxx
        Bv[1][k] = dyy
        Bv[2][k] = 2 * dxy
      }
      for (let a = 0; a < 12; a++) {
        for (let b = 0; b < 12; b++) {
          let s = 0
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) s += Bv[r][a] * D[r][c] * Bv[c][b]
          Ke[a * 12 + b] += jac * s
        }
      }
      for (let k = 0; k < 12; k++) {
        let Nk = 0
        for (let j = 0; j < 12; j++) Nk += S[k * 12 + j] * basisValue(j, xi, eta)
        Fe[k] += jac * qK * Nk
      }
    }
  }

  // ---- 整体组装 ----
  const nodeId = (i: number, j: number) => i + j * numNodesX
  const K = new Float64Array(totalDofs * totalDofs)
  const F = new Float64Array(totalDofs)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const nodes = [nodeId(i, j), nodeId(i + 1, j), nodeId(i + 1, j + 1), nodeId(i, j + 1)]
      for (let a = 0; a < 12; a++) {
        const ga = nodes[(a / 3) | 0] * dofsPerNode + (a % 3)
        for (let b = 0; b < 12; b++) {
          const gb = nodes[(b / 3) | 0] * dofsPerNode + (b % 3)
          K[ga * totalDofs + gb] += Ke[a * 12 + b]
        }
      }
      for (let a = 0; a < 12; a++) F[nodes[(a / 3) | 0] * dofsPerNode + (a % 3)] += Fe[a]
    }
  }

  // ---- 边界条件（四边简支为默认，约束消元） ----
  const edges: Array<[EdgeSupport, (i: number, j: number) => boolean]> = [
    ['simply-supported', (i) => i === 0],
    ['simply-supported', (i) => i === numNodesX - 1],
    ['simply-supported', (_i, j) => j === 0],
    ['simply-supported', (_i, j) => j === numNodesY - 1],
  ]
  const constrain = (dof: number) => {
    for (let r = 0; r < totalDofs; r++) {
      K[dof * totalDofs + r] = 0
      K[r * totalDofs + dof] = 0
    }
    K[dof * totalDofs + dof] = 1
    F[dof] = 0
  }
  for (const [sup, on] of edges) {
    if (sup === 'free') continue
    for (let i = 0; i < numNodesX; i++) {
      for (let j = 0; j < numNodesY; j++) {
        if (!on(i, j)) continue
        const node = nodeId(i, j) * dofsPerNode
        constrain(node)
        if (sup === 'fixed') { constrain(node + 1); constrain(node + 2) }
      }
    }
  }

  // ---- 求解 ----
  const u = solveCholesky(K, F, totalDofs)
  if (!u) throw new Error('刚度矩阵非正定（几何参数矛盾或约束不足），求解发散')

  // ---- 挠度验算 ----
  let maxW = 0
  for (let n = 0; n < totalNodes; n++) maxW = Math.max(maxW, Math.abs(u[n * dofsPerNode]))
  let rebarLevel: number
  if (param.ratio < 0.002) rebarLevel = 0
  else if (param.ratio < 0.004) rebarLevel = 1
  else if (param.ratio < 0.006) rebarLevel = 2
  else if (param.ratio < 0.008) rebarLevel = 3
  else rebarLevel = 4
  const dur = Math.min(Math.max(param.duration, 0), 4)
  const factor = DEFLECTION_INCREASE_FACTOR[dur][rebarLevel]
  const longM = maxW * factor
  const allowM = spanY * REG.allowableDeflectionRatio

  // ---- 内力包络（3×3 采样点曲率恢复） ----
  const sg = Math.sqrt(0.6)
  const sp = [-sg, 0, sg]
  let midX = 0, supX = 0, midY = 0, supY = 0
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const nodes = [nodeId(i, j), nodeId(i + 1, j), nodeId(i + 1, j + 1), nodeId(i, j + 1)]
      const uel = new Float64Array(12)
      for (let a = 0; a < 12; a++) uel[a] = u[nodes[(a / 3) | 0] * dofsPerNode + (a % 3)]
      for (const xi of sp) {
        for (const eta of sp) {
          let kx = 0, ky = 0
          for (let k = 0; k < 12; k++) {
            let dxx = 0, dyy = 0
            for (let jj = 0; jj < 12; jj++) {
              const c = S[k * 12 + jj]
              if (c === 0) continue
              dxx += c * ((4 / (lx * lx)) * basisDxixi(jj, xi, eta))
              dyy += c * ((4 / (ly * ly)) * basisDetaeta(jj, xi, eta))
            }
            kx += dxx * uel[k]
            ky += dyy * uel[k]
          }
          const Mx = -(D[0][0] * kx + D[0][1] * ky)
          const My = -(D[1][1] * ky + D[1][0] * kx)
          midX = Math.max(midX, Mx)
          midY = Math.max(midY, My)
          supX = Math.max(supX, -Mx)
          supY = Math.max(supY, -My)
        }
      }
    }
  }

  // 支座剪力：长边两缘各承担约一半板面荷载（工程近似）
  const shear = ((qK * spanX * spanY * 0.5) / spanY) / 1000

  // 初步裂缝验算（按输入配筋率）
  const ctx: StripContext = { ...stripCtx, thicknessMm: thick * 1000, barDiameterMm: 12 }
  const h0Mm = ctx.thicknessMm - REG.coverMm - 6
  const asInput = param.ratio * 1000 * h0Mm
  const wInput = crackWidth(Math.max(midX, midY) / 1000, asInput, ctx)

  return {
    meshNx: nx,
    meshNy: ny,
    totalDofs,
    maxDisplacementM: maxW,
    forces: { midX: midX / 1000, supX: supX / 1000, midY: midY / 1000, supY: supY / 1000, shear },
    deflection: { shortM: maxW, longM, factor, allowM, passed: longM <= allowM },
    crack: { maxMm: wInput, allowMm: REG.allowableCrackWidthMm, passed: wInput <= REG.allowableCrackWidthMm },
  }
}
