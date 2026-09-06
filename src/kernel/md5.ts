/**
 * MD5（RFC 1321 精简实现），用于设计记录哈希索引。
 * 黄金向量："abc" -> 900150983cd24fb0d6963f7d28e17f72
 */

const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
])

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0

function md5Block(state: Uint32Array, block: Uint8Array, off: number): void {
  const m = new Uint32Array(16)
  for (let i = 0; i < 16; i++) {
    m[i] =
      block[off + i * 4] |
      (block[off + i * 4 + 1] << 8) |
      (block[off + i * 4 + 2] << 16) |
      (block[off + i * 4 + 3] << 24)
  }
  let [a, b, c, d] = state
  for (let i = 0; i < 64; i++) {
    let f: number
    let g: number
    if (i < 16) { f = (b & c) | (~b & d); g = i }
    else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
    else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
    else { f = c ^ (b | ~d); g = (7 * i) % 16 }
    f = (f + a + K[i] + m[g]) >>> 0
    a = d
    d = c
    c = b
    b = (b + rotl(f, S[i])) >>> 0
  }
  state[0] = (state[0] + a) >>> 0
  state[1] = (state[1] + b) >>> 0
  state[2] = (state[2] + c) >>> 0
  state[3] = (state[3] + d) >>> 0
}

/** 返回 16 字节摘要 */
export function md5(data: Uint8Array): Uint8Array {
  const state = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476])
  const totalLen = data.length

  // 填充：数据 + 0x80 + 0x00... + 64bit 长度（小端）
  const paddedLen = (((totalLen + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[totalLen] = 0x80
  const bits = totalLen * 8
  // 注意：JS 移位计数按 32 取模，bits>>>32 会错误回绕到低位，
  // 这里必须用除法提取长度的高 32 位
  for (let i = 0; i < 8; i++) padded[paddedLen - 8 + i] = Math.floor(bits / 2 ** (8 * i)) & 0xff

  for (let off = 0; off < paddedLen; off += 64) md5Block(state, padded, off)

  const out = new Uint8Array(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) out[i * 4 + j] = (state[i] >>> (8 * j)) & 0xff
  }
  return out
}

export function md5Hex(data: Uint8Array): string {
  return Array.from(md5(data), (b) => b.toString(16).padStart(2, '0')).join('')
}
