/**
 * 简易结构图（SVG）：楼盖平面图（网格剖分 + 四边支座符号 + 尺寸标注）
 * 与剖面示意，随设计参数实时更新。
 */
import type { ReactNode } from 'react'
import { fmt } from '../lib/utils'

export interface SlabDiagramProps {
  spanM: number
  widthM: number
  meshNx: number
  meshNy: number
  slabType: 0 | 1
  thicknessMm: number
}

const VIEW_W = 460
const VIEW_H = 340
const MARGIN = { left: 62, right: 26, top: 40, bottom: 62 }

export function SlabDiagram({ spanM, widthM, meshNx, meshNy, slabType, thicknessMm }: SlabDiagramProps) {
  const slabW = VIEW_W - MARGIN.left - MARGIN.right
  const slabH = VIEW_H - MARGIN.top - MARGIN.bottom
  const x0 = MARGIN.left
  const y0 = MARGIN.top

  // 网格线
  const vLines = Array.from({ length: meshNx - 1 }, (_, i) => x0 + (slabW * (i + 1)) / meshNx)
  const hLines = Array.from({ length: meshNy - 1 }, (_, j) => y0 + (slabH * (j + 1)) / meshNy)

  // 四边简支支座符号（三角形，边外）
  const triSize = 7
  const supports: ReactNode[] = []
  const nSupX = Math.max(6, Math.min(14, Math.round(slabW / 34)))
  const nSupY = Math.max(4, Math.min(10, Math.round(slabH / 34)))

  // 上边 / 下边
  for (let i = 0; i <= nSupX; i++) {
    const cx = x0 + (slabW * i) / nSupX
    supports.push(<path key={`st${i}`} d={`M ${cx - triSize / 2} ${y0} L ${cx} ${y0 - triSize} L ${cx + triSize / 2} ${y0} Z`} className="fill-none stroke-current" strokeWidth="1" />)
    supports.push(<path key={`sb${i}`} d={`M ${cx - triSize / 2} ${y0 + slabH} L ${cx} ${y0 + slabH + triSize} L ${cx + triSize / 2} ${y0 + slabH} Z`} className="fill-none stroke-current" strokeWidth="1" />)
  }
  // 左边 / 右边
  for (let j = 0; j <= nSupY; j++) {
    const cy = y0 + (slabH * j) / nSupY
    supports.push(<path key={`sl${j}`} d={`M ${x0} ${cy - triSize / 2} L ${x0 - triSize} ${cy} L ${x0} ${cy + triSize / 2} Z`} className="fill-none stroke-current" strokeWidth="1" />)
    supports.push(<path key={`sr${j}`} d={`M ${x0 + slabW} ${cy - triSize / 2} L ${x0 + slabW + triSize} ${cy} L ${x0 + slabW} ${cy + triSize / 2} Z`} className="fill-none stroke-current" strokeWidth="1" />)
  }

  // 尺寸线
  const dimY = y0 + slabH + 26
  const dimX = x0 - 26

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label="楼盖结构简图">
        {/* 网格 */}
        {vLines.map((x, i) => (
          <line key={`v${i}`} x1={x} y1={y0} x2={x} y2={y0 + slabH} className="stroke-border" strokeWidth="0.8" strokeDasharray="3 3" />
        ))}
        {hLines.map((y, i) => (
          <line key={`h${i}`} x1={x0} y1={y} x2={x0 + slabW} y2={y} className="stroke-border" strokeWidth="0.8" strokeDasharray="3 3" />
        ))}
        {/* 板轮廓 */}
        <rect x={x0} y={y0} width={slabW} height={slabH} className="fill-muted/40 stroke-foreground" strokeWidth="1.6" />
        {supports}
        {/* 主受力方向箭头 */}
        {slabType === 0 ? (
          <g className="stroke-foreground" fill="none" strokeWidth="1.4">
            <line x1={x0 + slabW / 2} y1={y0 + slabH / 2 - 26} x2={x0 + slabW / 2} y2={y0 + slabH / 2 + 26} markerEnd="url(#arrow)" markerStart="url(#arrowR)" />
            <text x={x0 + slabW / 2 + 10} y={y0 + slabH / 2 + 6} className="fill-foreground stroke-none" fontSize="11">
              短边受力（Y 向）
            </text>
          </g>
        ) : (
          <g className="stroke-foreground" fill="none" strokeWidth="1.4">
            <line x1={x0 + slabW / 2 - 40} y1={y0 + slabH / 2} x2={x0 + slabW / 2 + 40} y2={y0 + slabH / 2} markerEnd="url(#arrow)" markerStart="url(#arrowR)" />
            <line x1={x0 + slabW / 2} y1={y0 + slabH / 2 - 26} x2={x0 + slabW / 2} y2={y0 + slabH / 2 + 26} markerEnd="url(#arrow)" markerStart="url(#arrowR)" />
            <text x={x0 + slabW / 2 + 48} y={y0 + slabH / 2 + 4} className="fill-foreground stroke-none" fontSize="11">
              双向受力
            </text>
          </g>
        )}
        {/* 尺寸标注：跨度 X（下） */}
        <g className="stroke-muted-foreground" strokeWidth="1">
          <line x1={x0} y1={dimY} x2={x0 + slabW} y2={dimY} markerEnd="url(#arrowG)" markerStart="url(#arrowGR)" />
          <line x1={x0} y1={y0 + slabH} x2={x0} y2={dimY + 4} />
          <line x1={x0 + slabW} y1={y0 + slabH} x2={x0 + slabW} y2={dimY + 4} />
        </g>
        <text x={x0 + slabW / 2} y={dimY + 16} textAnchor="middle" className="fill-foreground" fontSize="12" fontFamily="ui-monospace,Consolas,monospace">
          Lx = {fmt(spanM)} m
        </text>
        {/* 尺寸标注：宽度 Y（左） */}
        <g className="stroke-muted-foreground" strokeWidth="1">
          <line x1={dimX} y1={y0} x2={dimX} y2={y0 + slabH} markerEnd="url(#arrowG)" markerStart="url(#arrowGR)" />
          <line x1={x0} y1={y0} x2={dimX - 4} y2={y0} />
          <line x1={x0} y1={y0 + slabH} x2={dimX - 4} y2={y0 + slabH} />
        </g>
        <text x={dimX - 8} y={y0 + slabH / 2} textAnchor="middle" className="fill-foreground" fontSize="12" fontFamily="ui-monospace,Consolas,monospace" transform={`rotate(-90 ${dimX - 8} ${y0 + slabH / 2})`}>
          Ly = {fmt(widthM)} m
        </text>
        {/* 网格标注 */}
        <text x={x0 + slabW} y={y0 - 10} textAnchor="end" className="fill-muted-foreground" fontSize="10.5" fontFamily="ui-monospace,Consolas,monospace">
          网格 {meshNx} × {meshNy}
        </text>
        {/* 剖面示意 1-1 */}
        <g transform={`translate(${x0 + slabW + 40}, ${y0 + 40})`}>
          <text x={20} y={-10} className="fill-muted-foreground" fontSize="10.5" textAnchor="middle">剖面 1-1</text>
          <rect x={0} y={0} width={110} height={Math.max(10, thicknessMm / 12)} className="fill-muted/60 stroke-foreground" strokeWidth="1.2" />
          <text x={55} y={Math.max(10, thicknessMm / 12) + 14} textAnchor="middle" className="fill-foreground" fontSize="11" fontFamily="ui-monospace,Consolas,monospace">
            h = {fmt(thicknessMm, 0)} mm
          </text>
          {/* 支座 */}
          {[18, 55, 92].map((cx) => (
            <path key={cx} d={`M ${cx - 5} ${Math.max(10, thicknessMm / 12)} L ${cx} ${Math.max(10, thicknessMm / 12) + 6} L ${cx + 5} ${Math.max(10, thicknessMm / 12)} Z`} className="fill-none stroke-foreground" strokeWidth="1" />
          ))}
        </g>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground stroke-none" />
          </marker>
          <marker id="arrowR" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground stroke-none" />
          </marker>
          <marker id="arrowG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground stroke-none" />
          </marker>
          <marker id="arrowGR" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground stroke-none" />
          </marker>
        </defs>
      </svg>
      <figcaption className="mt-1 text-[11px] text-muted-foreground">
        四边简支（支承于肋梁），斜线阴影为网格剖分；{slabType === 0 ? '单向板沿短边（Y 向）取 1m 板带设计' : '双向板按 X / Y 两方向板带分别设计'}。
      </figcaption>
    </figure>
  )
}
