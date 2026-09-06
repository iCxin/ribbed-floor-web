/**
 * 通信协议层：帧格式、CRC 校验、参数/结果载荷编解码。
 * 与嵌入式版（C++ src/protocol.cpp、src/result_pack.cpp）逐字节一致。
 */

export const FRAME_HEADER = [0xaa, 0x55]
export const FRAME_TAIL = [0x55, 0xaa]

export const FC_CONCRETE_SLAB_PARAM = 0x01
export const FC_RESULT_PACKAGE = 0x81
export const FC_NACK_RESPONSE = 0x8f
export const FC_ACK_RESPONSE = 0x90

export const DEVICE_ADDR_SELF = 0x01
export const DEVICE_ADDR_MIN = 0x02
export const DEVICE_ADDR_MAX = 0xff

/** 参数载荷 FC 0x01：28 字节 */
export const SLAB_PARAM_PAYLOAD_SIZE = 28
/** 结果载荷 FC 0x81：40 字节（帧总长 50，<= 128 上限） */
export const RESULT_PAYLOAD_SIZE = 40
export const MAX_OUTPUT_FRAME_SIZE = 128

/* ------------------------------ CRC ------------------------------ */

/** CRC16-XMODEM：多项式 0x1021，初始值 0xFFFF（"123456789" -> 0x29B1） */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8
    for (let k = 0; k < 8; k++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc
}

const crc32Table = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

/** CRC32-IEEE 802.3（"123456789" -> 0xCBF43926） */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/* --------------------------- 字节序辅助 --------------------------- */

export function putU16Le(buf: number[], v: number): void {
  buf.push(v & 0xff, (v >> 8) & 0xff)
}

export function putU32Le(buf: number[], v: number): void {
  buf.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff)
}

export function putF32Le(buf: number[], v: number): void {
  const dv = new DataView(new ArrayBuffer(4))
  dv.setFloat32(0, v, true)
  for (let i = 0; i < 4; i++) buf.push(dv.getUint8(i))
}

export function getU16Le(p: Uint8Array, off: number): number {
  return p[off] | (p[off + 1] << 8)
}

export function getU32Le(p: Uint8Array, off: number): number {
  return (p[off] | (p[off + 1] << 8) | (p[off + 2] << 16) | p[off + 3] * 0x1000000) >>> 0
}

export function getF32Le(p: Uint8Array, off: number): number {
  const dv = new DataView(p.buffer, p.byteOffset + off, 4)
  return dv.getFloat32(0, true)
}

/* ------------------------------ 组帧 ------------------------------ */

/** 组帧：[AA 55][ADDR][FC][LEN(2)][DATA][CRC16(2)][55 AA] */
export function buildFrame(deviceAddress: number, functionCode: number, payload: number[]): Uint8Array {
  const frame: number[] = [...FRAME_HEADER, deviceAddress, functionCode]
  putU16Le(frame, payload.length)
  frame.push(...payload)
  const crc = crc16(new Uint8Array(frame.slice(FRAME_HEADER.length)))
  putU16Le(frame, crc)
  frame.push(...FRAME_TAIL)
  return new Uint8Array(frame)
}

export interface RawFrame {
  deviceAddress: number
  functionCode: number
  payload: Uint8Array
}

export type FrameError =
  | 'OK'
  | 'FRAME_LOSS'
  | 'CRC_ERROR'
  | 'INVALID_PROTOCOL_FORMAT'

/** 帧同步 + CRC 校验 + 载荷提取（对应 C++ synchronize_frame / extract_and_validate_packet） */
export function parseFrame(buffer: Uint8Array): { frame: RawFrame; error: FrameError } {
  const n = buffer.length
  const minSize = 2 + 4 + 2 + 2
  let start = -1
  let end = -1
  for (let i = 0; i + 2 <= n; i++) {
    if (buffer[i] === FRAME_HEADER[0] && buffer[i + 1] === FRAME_HEADER[1]) {
      let found = false
      for (let j = i + 2; j + 2 <= n; j++) {
        if (buffer[j] === FRAME_TAIL[0] && buffer[j + 1] === FRAME_TAIL[1]) {
          start = i
          end = j + 2
          found = true
          break
        }
      }
      if (!found) return { frame: null!, error: 'FRAME_LOSS' }
      break
    }
  }
  if (start < 0 || end < 0 || end - start < minSize)
    return { frame: null!, error: 'FRAME_LOSS' }

  const inner = end - start - 4 // 去帧头帧尾
  const crcPos = start + 2 + inner - 2
  if (inner < 4 + 2) return { frame: null!, error: 'INVALID_PROTOCOL_FORMAT' }

  const received = getU16Le(buffer, crcPos)
  const covered = buffer.slice(start + 2, crcPos)
  if (crc16(covered) !== received) return { frame: null!, error: 'CRC_ERROR' }

  const addr = buffer[start + 2]
  const fc = buffer[start + 3]
  const len = getU16Le(buffer, start + 4)
  const actual = inner - 4 - 2
  if (len !== actual) return { frame: null!, error: 'INVALID_PROTOCOL_FORMAT' }

  return {
    frame: {
      deviceAddress: addr,
      functionCode: fc,
      payload: buffer.slice(start + 6, start + 6 + len),
    },
    error: 'OK',
  }
}

/** 十六进制字符串 -> 字节（容忍空格/换行） */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  const out = new Uint8Array(clean.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/* ------------------------ FC01 参数载荷 ------------------------ */

export interface SlabFrameInput {
  grade: number
  spanMm: number
  widthMm: number
  thicknessMm: number
  ratio: number
  slabType: number // 0 单向 1 双向
  deadKPa: number
  liveKPa: number
  duration: number
}

/** 组装 FC01 楼盖参数帧（28 字节载荷，与硬件接口一致） */
export function buildSlabParamFrame(input: SlabFrameInput, sourceAddr = DEVICE_ADDR_MIN): Uint8Array {
  const p: number[] = []
  p.push(input.grade)
  putF32Le(p, input.spanMm)
  putF32Le(p, input.widthMm)
  putF32Le(p, input.thicknessMm)
  putF32Le(p, input.ratio)
  p.push(input.slabType)
  putF32Le(p, input.deadKPa)
  putF32Le(p, input.liveKPa)
  p.push(Math.min(input.duration, 4))
  p.push(0)
  return buildFrame(sourceAddr, FC_CONCRETE_SLAB_PARAM, p)
}

/* ------------------------ FC81 结果载荷 ------------------------ */

/** 钢筋直径 4bit 编码：0=无，1~9 -> D8~D25 */
export function encodeBarDiameter(d: number): number {
  const table = [8, 10, 12, 14, 16, 18, 20, 22, 25]
  const idx = table.indexOf(d)
  return idx < 0 ? 0 : idx + 1
}

export function decodeBarDiameter(code: number): number {
  const table = [8, 10, 12, 14, 16, 18, 20, 22, 25]
  return code >= 1 && code <= 9 ? table[code - 1] : 0
}

function saturateU16(v: number): number {
  if (v <= 0) return 0
  return v >= 65535 ? 65535 : Math.round(v)
}

function packBarByte(d: number, spacing: number): number {
  const dia = encodeBarDiameter(d)
  const sp = dia ? Math.min(15, Math.round(spacing / 10)) : 0
  return ((dia << 4) | sp) & 0xff
}

export interface ResultPayloadInput {
  statusCode: number
  designNumber: number
  timestamp: number
  spanMm: number
  widthMm: number
  deflectionMm: number
  allowDeflectionMm: number
  crackMm: number
  weightKg: number
  deflPass: boolean
  crackPass: boolean
  capacityPass: boolean
  bottomX: [number, number] // [直径, 间距]
  bottomY: [number, number]
  topX: [number, number]
  topY: [number, number]
  ratio: number
  safety: number
  iterations: number
  constructive: boolean
  grade: number
  slabType: number
}

/** 结果载荷 40 字节（与 C++ ResultPackager::build_result_payload 布局一致） */
export function buildResultPayload(r: ResultPayloadInput): Uint8Array {
  const b: number[] = []
  b.push(r.statusCode)
  putU32Le(b, r.designNumber)
  putU32Le(b, r.timestamp)
  putU16Le(b, saturateU16(r.spanMm))
  putU16Le(b, saturateU16(r.widthMm))
  putU16Le(b, saturateU16(r.deflectionMm * 100))
  putU16Le(b, saturateU16(r.allowDeflectionMm * 100))
  putU16Le(b, saturateU16(r.crackMm * 1000))
  putU16Le(b, saturateU16(r.weightKg * 10))
  let flags = 0
  if (r.deflPass) flags |= 0x01
  if (r.crackPass) flags |= 0x02
  if (r.capacityPass) flags |= 0x04
  b.push(flags)
  b.push(packBarByte(r.bottomX[0], r.bottomX[1]))
  b.push(packBarByte(r.bottomY[0], r.bottomY[1]))
  b.push(packBarByte(r.topX[0], r.topX[1]))
  b.push(packBarByte(r.topY[0], r.topY[1]))
  putU16Le(b, saturateU16(r.ratio * 1e5))
  putU16Le(b, saturateU16(r.safety * 100))
  b.push(Math.min(255, r.iterations))
  b.push(r.constructive ? 1 : 0)
  b.push(r.grade & 0xff)
  b.push(r.slabType & 0xff)
  b.push(0x01) // 载荷版本
  b.push(0x00) // 保留
  putU32Le(b, crc32(new Uint8Array(b)))
  return new Uint8Array(b)
}
