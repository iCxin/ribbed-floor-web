/**
 * 设计记录归档（localStorage）：对应嵌入式版的数据存储模块，
 * 以浏览器本地存储替代 NOR Flash，保留"唯一设计编号 + 可追溯"语义。
 */

import type { DesignInput } from './pipeline'

export interface HistoryEntry {
  designNumber: number
  timestamp: number
  input: DesignInput
  summary: string
  allPassed: boolean
  weightKg: number
}

const KEY = 'rfds-web-history'
const MAX_ENTRIES = 50

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function appendHistory(entry: HistoryEntry): void {
  try {
    const list = loadHistory()
    list.unshift(entry)
    // 循环覆盖：仅保留最近 MAX_ENTRIES 条（对应嵌入式循环覆盖算法）
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch { /* 隐私模式等场景下静默降级 */ }
}

export function clearHistory(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
