import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Badge, Select, Separator, Table, Tabs, Td, Th } from './components/ui'
import { fmt } from './lib/utils'
import { design, type DesignInput, type DesignResult } from './kernel/pipeline'
import { runSelfTest, type SelfTestItem } from './kernel/selftest'
import { appendHistory, clearHistory, loadHistory, type HistoryEntry } from './kernel/history'
import { hexToBytes, parseFrame, bytesToHex, buildSlabParamFrame } from './kernel/protocol'
import { SlabDiagram } from './components/SlabDiagram'
import { CalculationBookPanel, CalculationBookPrintView } from './components/CalculationBookView'
import { COPYRIGHT, CopyrightDialog } from './components/CopyrightDialog'

const GITHUB_REPO = 'https://github.com/iCxin/ribbed-floor-web'

/* ------------------------------ 主题切换 ------------------------------ */

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('rfds-theme', next ? 'dark' : 'light')
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} title="切换主题" aria-label="切换主题">
      {dark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
      )}
    </Button>
  )
}

/* ------------------------------ 默认参数 ------------------------------ */

const DEFAULT_INPUT: DesignInput = {
  grade: 30, slabType: 1, spanM: 6, widthM: 4.5, thicknessMm: 120,
  ratio: 0.004, deadKPa: 3, liveKPa: 2.5, duration: 3,
}

type RightTab = 'report' | 'book' | 'selftest' | 'history' | 'frame'

function App() {
  const [input, setInput] = useState<DesignInput>(DEFAULT_INPUT)
  const [result, setResult] = useState<DesignResult | null>(null)
  const [running, setRunning] = useState(false)
  const [tab, setTab] = useState<RightTab>('report')
  const [selfTest, setSelfTest] = useState<SelfTestItem[] | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [frameText, setFrameText] = useState('')
  const [frameResult, setFrameResult] = useState<string | null>(null)
  const [frameError, setFrameError] = useState<string | null>(null)
  const [copyrightOpen, setCopyrightOpen] = useState(false)

  const set = <K extends keyof DesignInput>(key: K, value: DesignInput[K]) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  const runDesign = useCallback((data: DesignInput) => {
    setRunning(true)
    // 让按钮态先渲染，再执行同步计算
    setTimeout(() => {
      const r = design(data)
      setResult(r)
      setRunning(false)
      if (r.ok) {
        const entry: HistoryEntry = {
          designNumber: r.designNumber,
          timestamp: Math.floor(Date.now() / 1000),
          input: data,
          summary: r.opt.summary,
          allPassed: r.opt.allChecksPassed,
          weightKg: r.opt.steelWeightKg,
        }
        appendHistory(entry)
        setHistory(loadHistory())
      }
      setTab('report')
    }, 30)
  }, [])

  const runSelfTestCb = useCallback(() => {
    setRunning(true)
    setTimeout(() => {
      setSelfTest(runSelfTest())
      setRunning(false)
      setTab('selftest')
    }, 30)
  }, [])

  const handleFrame = useCallback(() => {
    setFrameError(null)
    setFrameResult(null)
    const bytes = hexToBytes(frameText)
    if (bytes.length === 0) { setFrameError('请输入有效的十六进制帧'); return }
    const { frame, error } = parseFrame(bytes)
    if (error !== 'OK') { setFrameError(`帧解析失败：${error}`); return }
    if (frame.functionCode !== 0x01 || frame.payload.length < 28) {
      setFrameError('仅支持 FC 0x01 楼盖参数帧（载荷 >= 28 字节）'); return
    }
    // 从载荷还原参数（与 C++ decode_and_map_parameters 一致）
    const dv = new DataView(frame.payload.buffer, frame.payload.byteOffset)
    const inputFromFrame: DesignInput = {
      grade: frame.payload[0],
      spanM: dv.getFloat32(1, true) / 1000,
      widthM: dv.getFloat32(5, true) / 1000,
      thicknessMm: dv.getFloat32(9, true),
      ratio: dv.getFloat32(13, true),
      slabType: frame.payload[17] === 0 ? 0 : 1,
      deadKPa: dv.getFloat32(18, true),
      liveKPa: dv.getFloat32(22, true),
      duration: Math.min(frame.payload[26], 4),
    }
    const r = design(inputFromFrame)
    setFrameResult(r.ok ? r.frameHex : `NACK 0x${r.errorCode.toString(16).padStart(2, '0').toUpperCase()} ${r.errorMessage}`)
    if (r.ok) setResult(r)
  }, [frameText])

  // 演示：默认先算一次，页面不空
  useEffect(() => { runDesign(DEFAULT_INPUT) }, [runDesign])

  const passCount = useMemo(() => selfTest?.filter((t) => t.ok).length ?? 0, [selfTest])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur print:hidden">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-3 px-4 sm:px-6">
          <svg className="h-[26px] w-[26px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 11h.01M15 11h.01" />
          </svg>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">水工钢筋混凝土肋形楼盖辅助设计系统</h1>
            <p className="text-[11px] text-muted-foreground">Hydraulic Ribbed-Floor Slab Auxiliary Design System · SL 191-2008 / GB 50010-2010</p>
          </div>
          <button
            onClick={() => setCopyrightOpen(true)}
            className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            title="查看软件著作权登记证书"
          >
            © {new Date().getFullYear()} {COPYRIGHT.owner} · 软著 {COPYRIGHT.registrationNo}
          </button>
          <Badge variant="secondary" className="font-tabular">v1.0</Badge>
          <Badge>纯前端</Badge>
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" title="GitHub 开源仓库" aria-label="GitHub 开源仓库"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.04.77 2.1 0 1.52-.01 2.74-.01 3.11 0 .3.2.67.8.55A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 print:hidden">
        <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
          {/* -------------- 参数输入 -------------- */}
          <Card>
            <CardHeader>
              <CardTitle>设计参数</CardTitle>
              <CardDescription>全部计算在浏览器本地完成，参数经 0xAA55 协议帧送入计算内核。</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Label htmlFor="grade" className="mb-2">混凝土强度等级</Label>
              <Select id="grade" value={input.grade} onChange={(e) => set('grade', +e.target.value)}>
                {[20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80].map((g) => (
                  <option key={g} value={g}>C{g}</option>
                ))}
              </Select>

              <Label className="mb-2 mt-4">楼盖类型</Label>
              <Tabs
                className="grid w-full grid-cols-2"
                items={[
                  { value: 'two', label: '双向板' },
                  { value: 'one', label: '单向板' },
                ]}
                value={input.slabType === 1 ? 'two' : 'one'}
                onValueChange={(v) => set('slabType', v === 'two' ? 1 : 0)}
              />

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="span" className="mb-2">跨度 X（m）</Label>
                  <Input id="span" type="number" step="0.1" min={0.5} max={12} value={input.spanM}
                    onChange={(e) => set('spanM', +e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="width" className="mb-2">宽度 Y（m）</Label>
                  <Input id="width" type="number" step="0.1" min={0.5} max={12} value={input.widthM}
                    onChange={(e) => set('widthM', +e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="thick" className="mb-2">板厚（mm）</Label>
                  <Input id="thick" type="number" step="10" min={80} max={600} value={input.thicknessMm}
                    onChange={(e) => set('thicknessMm', +e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="ratio" className="mb-2">建议配筋率</Label>
                  <Input id="ratio" type="number" step="0.0005" min={0.002} max={0.025} value={input.ratio}
                    onChange={(e) => set('ratio', +e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="dead" className="mb-2">恒荷载（kPa）</Label>
                  <Input id="dead" type="number" step="0.5" min={0.5} max={25} value={input.deadKPa}
                    onChange={(e) => set('deadKPa', +e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="live" className="mb-2">活荷载（kPa）</Label>
                  <Input id="live" type="number" step="0.5" min={0} max={30} value={input.liveKPa}
                    onChange={(e) => set('liveKPa', +e.target.value)} />
                </div>
              </div>

              <Label htmlFor="dur" className="mb-2 mt-4">荷载持续时间</Label>
              <Select id="dur" value={input.duration} onChange={(e) => set('duration', +e.target.value)}>
                <option value={0}>小于 1 小时</option>
                <option value={1}>1 小时 ~ 1 天</option>
                <option value={2}>1 天 ~ 1 周</option>
                <option value={3}>1 周 ~ 1 个月</option>
                <option value={4}>大于 1 个月</option>
              </Select>

              <Button className="mt-5 h-10 w-full tracking-widest" disabled={running}
                onClick={() => runDesign(input)}>
                开始设计计算
              </Button>
              <p className="mt-3 rounded-md bg-muted p-3 text-[11.5px] leading-relaxed text-muted-foreground">
                支座条件默认四边简支（典型肋形楼盖布置）。计算流程与嵌入式硬件版本一致：
                参数解析 → 结构计算 → 配筋优化 → 结果封装 → 本地存档。
              </p>
            </CardContent>
          </Card>

          {/* -------------- 右侧面板 -------------- */}
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs
                items={[
                  { value: 'report', label: '计算报告' },
                  { value: 'book', label: '计算书' },
                  { value: 'selftest', label: '内核自检' },
                  { value: 'history', label: '设计记录' },
                  { value: 'frame', label: '协议帧工具' },
                ]}
                value={tab}
                onValueChange={setTab}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={running} onClick={runSelfTestCb}>运行自检</Button>
              </div>
            </div>

            {/* ---------- 计算报告 ---------- */}
            {tab === 'report' && (              <Card className="animate-in">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>计算报告</CardTitle>
                    {result?.ok && <Badge className="font-tabular">#{result.designNumber}</Badge>}
                  </div>
                  <CardDescription>内力分析、规范验算与配筋方案（弯矩单位 kN·m/m）。</CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {!result && <p className="py-16 text-center text-sm text-muted-foreground">输入参数并开始计算</p>}
                  {result && !result.ok && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
                      <b>参数被拒绝（NACK）</b>　错误码 0x{result.errorCode.toString(16).padStart(2, '0').toUpperCase()}　{result.errorMessage}
                      <div className="mt-1 text-xs text-muted-foreground">
                        规范取值范围：双向板长宽比 ≤ 3.0 · 单向板 ≥ 2.0 · 混凝土 C20~C80 · 板厚 80~600 mm · 配筋率 0.2%~2.5%
                      </div>
                    </div>
                  )}
                  {result?.ok && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        <Stat label="混凝土强度等级" value={`C${result.input.grade}`} />
                        <Stat label="几何尺寸" value={`${fmt(result.input.spanM)} × ${fmt(result.input.widthM)}`} unit="m" />
                        <Stat label="板厚 / 类型" value={`${fmt(result.input.thicknessMm, 0)}`} unit={`mm ${result.input.slabType ? '双向板' : '单向板'}`} />
                        <Stat label="跨中弯矩 X / Y" value={`${fmt(result.calc.midX)} / ${fmt(result.calc.midY)}`} />
                        <Stat label="支座弯矩 X / Y" value={`${fmt(result.calc.supX)} / ${fmt(result.calc.supY)}`} />
                        <Stat label="支座剪力" value={fmt(result.calc.shear)} unit="kN/m" />
                      </div>

                      <div>
                        <SectionTitle title="结构简图" tag="STRUCTURE DIAGRAM" />
                        <div className="rounded-lg border bg-card p-3">
                          <SlabDiagram
                            spanM={result.input.spanM}
                            widthM={result.input.widthM}
                            meshNx={result.calc.meshNx}
                            meshNy={result.calc.meshNy}
                            slabType={result.input.slabType}
                            thicknessMm={result.input.thicknessMm}
                          />
                        </div>
                      </div>

                      <div>
                        <SectionTitle title="规范验算" tag="CODE VERIFICATION" />
                        <div className="space-y-2.5">
                          <AlertRow
                            title="挠度验算（长期）"
                            desc={`短期 ${fmt(result.calc.deflShort)} mm × 长期系数 ${fmt(result.calc.deflFactor)} = ${fmt(result.calc.deflLong)} mm ｜ 允许 ${fmt(result.calc.deflAllow)} mm（l₀/250）`}
                            passed={result.calc.deflPassed}
                          />
                          <AlertRow
                            title="裂缝宽度验算"
                            desc={`最大裂缝宽度 ${fmt(result.calc.crackMax, 3)} mm ｜ 允许 ${fmt(result.calc.crackAllow)} mm（耐久性）`}
                            passed={result.calc.crackPassed}
                          />
                        </div>
                      </div>

                      <div>
                        <SectionTitle title="配筋方案" tag={`REINFORCEMENT · ${result.opt.iterationsUsed} ITERATION${result.opt.iterationsUsed > 1 ? 'S' : ''}${result.opt.constructiveAdjusted ? ' · CONSTRUCTIVE ADJUSTED' : ''}`} />
                        <Table>
                          <thead>
                            <tr>
                              <Th className="pl-0">部位</Th><Th>配筋</Th><Th>As (mm²/m)</Th>
                              <Th>Mu (kN·m/m)</Th><Th>σs (MPa)</Th><Th className="pr-0">w (mm)</Th>
                            </tr>
                          </thead>
                          <tbody>
                            <SchemeRow label="板底 X 向（跨中）" s={result.opt.bottomX} />
                            <SchemeRow label="板底 Y 向（跨中）" s={result.opt.bottomY} />
                            <SchemeRow label="支座 X 向顶筋" s={result.opt.topX} />
                            <SchemeRow label="支座 Y 向顶筋" s={result.opt.topY} />
                          </tbody>
                        </Table>
                      </div>

                      <div>
                        <SectionTitle title="汇总" tag="SUMMARY" />
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          <Stat label="全截面配筋率" value={fmt(result.opt.totalRebarRatio * 100, 3)} unit="%" />
                          <Stat label="钢筋总用量" value={fmt(result.opt.steelWeightKg, 1)} unit="kg" />
                          <Stat label="安全储备 Mu/(K·M)" value={fmt(result.opt.safetyFactor)} />
                        </div>
                        <div className="mt-2.5">
                          <AlertRow title="总体结论" desc={result.opt.summary} passed={result.opt.allChecksPassed} okText="全部通过" badText="需复核" />
                        </div>
                      </div>

                      <div>
                        <SectionTitle title="输出数据帧" tag={`${result.frameHex.length / 2} BYTES · FC 0x81 · 参数帧 ${result.paramFrameHex.length / 2} BYTES · FC 0x01`} />
                        <HexBlock label="参数帧（上行）" hex={result.paramFrameHex} />
                        <div className="h-2" />
                        <HexBlock label="结果帧（下行）" hex={result.frameHex} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------- 计算书 ---------- */}
            {tab === 'book' && result && (
              <CalculationBookPanel result={result} />
            )}

            {/* ---------- 内核自检 ---------- */}
            {tab === 'selftest' && (
              <Card className="animate-in">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>内核自检</CardTitle>
                    {selfTest && (
                      <Badge variant={passCount === selfTest.length ? 'success' : 'danger'} dot>
                        {passCount}/{selfTest.length} 通过
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    校验算法黄金向量、帧协议自反性、FEM 与 Timoshenko 解析解对比、截面公式往返与端到端流水线。
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {!selfTest && (
                    <div className="py-14 text-center">
                      <p className="mb-4 text-sm text-muted-foreground">点击下方按钮运行内核自检</p>
                      <Button onClick={runSelfTestCb} disabled={running}>运行自检</Button>
                    </div>
                  )}
                  {selfTest && (
                    <div className="space-y-2">
                      {selfTest.map((t) => (
                        <div key={t.name} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium">{t.name}</div>
                            {t.detail && <div className="mt-0.5 break-all font-tabular text-[11.5px] text-muted-foreground">{t.detail}</div>}
                          </div>
                          <Badge variant={t.ok ? 'success' : 'danger'} dot>{t.ok ? '通过' : '失败'}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------- 设计记录 ---------- */}
            {tab === 'history' && (
              <Card className="animate-in">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>设计记录</CardTitle>
                    {history.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => { clearHistory(); setHistory([]) }}>清空</Button>
                    )}
                  </div>
                  <CardDescription>
                    设计记录保存在浏览器 localStorage（仅保留最近 50 条，循环覆盖），对应嵌入式版的数据存储模块。
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {history.length === 0 && <p className="py-14 text-center text-sm text-muted-foreground">暂无设计记录</p>}
                  {history.length > 0 && (
                    <Table>
                      <thead>
                        <tr>
                          <Th className="pl-0">设计编号</Th><Th>时间</Th><Th>几何（m）</Th>
                          <Th>类型</Th><Th>用钢量 (kg)</Th><Th className="pr-0">结论</Th><Th />
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h.designNumber} className="hover:bg-muted/50">
                            <Td className="pl-0 font-medium">#{h.designNumber}</Td>
                            <Td>{new Date(h.timestamp * 1000).toLocaleString('zh-CN', { hour12: false })}</Td>
                            <Td>{fmt(h.input.spanM)} × {fmt(h.input.widthM)}</Td>
                            <Td>{h.input.slabType ? '双向板' : '单向板'}</Td>
                            <Td>{fmt(h.weightKg, 1)}</Td>
                            <Td className="pr-0">
                              <Badge variant={h.allPassed ? 'success' : 'danger'} dot>{h.allPassed ? '通过' : '需复核'}</Badge>
                            </Td>
                            <Td className="pr-0 text-right">
                              <Button variant="ghost" size="sm" onClick={() => { setInput(h.input); runDesign(h.input) }}>载入</Button>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ---------- 协议帧工具 ---------- */}
            {tab === 'frame' && (
              <Card className="animate-in">
                <CardHeader>
                  <CardTitle>协议帧工具</CardTitle>
                  <CardDescription>
                    粘贴 FC 0x01 楼盖参数帧（十六进制，与硬件接口格式一致），直接走解析 → 计算 → 封装流水线。
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <textarea
                    className="font-tabular flex min-h-[90px] w-full rounded-md border border-input bg-transparent p-3 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="AA5502011C001E 0000B406 ..."
                    value={frameText}
                    onChange={(e) => setFrameText(e.target.value)}
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" onClick={handleFrame}>解析并计算</Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setFrameText(bytesToHex(buildSlabParamFrame({
                        grade: 30, spanMm: 6000, widthMm: 4500, thicknessMm: 120,
                        ratio: 0.004, slabType: 1, deadKPa: 3, liveKPa: 2.5, duration: 3,
                      })))
                    }}>生成示例帧</Button>
                  </div>
                  {frameError && (
                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{frameError}</div>
                  )}
                  {frameResult && (
                    <div className="mt-3">
                      <HexBlock label="结果帧" hex={frameResult} />
                    </div>
                  )}
                  <Separator className="my-4" />
                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    帧格式：AA 55 ｜ ADDR ｜ FC ｜ LEN(2) ｜ DATA ｜ CRC16(2) ｜ 55 AA。
                    CRC16 覆盖 ADDR 至 DATA 末字节（XMODEM poly 0x1021，初值 0xFFFF）。协议细节见主仓库 docs/PROTOCOL.md。
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-2 text-center text-[11.5px] text-muted-foreground sm:px-6 print:hidden">
        <div className="space-y-1">
          <p>
            本地计算内核<span className="mx-2 opacity-50">·</span>
            计算结果须经注册结构工程师复核后方可用于施工
          </p>
          <p>
            © {new Date().getFullYear()} {COPYRIGHT.owner} ｜{' '}
            <button onClick={() => setCopyrightOpen(true)} className="underline decoration-dotted underline-offset-2 hover:text-foreground">
              计算机软件著作权登记证书（{COPYRIGHT.registrationNo}）
            </button>{' '}
            ｜{' '}
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
              GitHub 开源
            </a>
          </p>
        </div>
      </footer>

      <CopyrightDialog open={copyrightOpen} onClose={() => setCopyrightOpen(false)} />
      {/* 打印时仅输出计算书 */}
      <CalculationBookPrintView result={result} />
    </div>
  )
}

/* ------------------------------ 子组件 ------------------------------ */

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="font-tabular text-[17px] font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

function SectionTitle({ title, tag }: { title: string; tag?: string }) {
  return (
    <div className="mb-2.5 mt-5 flex items-baseline gap-2.5 first:mt-0">
      <h4 className="text-[13.5px] font-semibold tracking-tight">{title}</h4>
      {tag && <span className="font-tabular text-[10.5px] text-muted-foreground">{tag}</span>}
    </div>
  )
}

function AlertRow({ title, desc, passed, okText = '满足', badText = '超限' }: {
  title: string; desc: string; passed: boolean; okText?: string; badText?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
      </div>
      <Badge variant={passed ? 'success' : 'danger'} dot className="flex-none">{passed ? okText : badText}</Badge>
    </div>
  )
}

function SchemeRow({ label, s }: { label: string; s: DesignResult['opt']['bottomX'] }) {
  return (
    <tr className="hover:bg-muted/50">
      <Td className="pl-0 font-sans">{label}</Td>
      <Td>{s.barDiameterMm ? `D${s.barDiameterMm} @ ${fmt(s.barSpacingMm, 0)} mm` : '—'}</Td>
      <Td>{fmt(s.areaMm2PerM, 0)}</Td>
      <Td>{fmt(s.momentCapacityKNm)}</Td>
      <Td>{fmt(s.steelStressMPa, 1)}</Td>
      <Td className="pr-0">{fmt(s.crackWidthMm, 3)}</Td>
    </tr>
  )
}

function HexBlock({ label, hex }: { label: string; hex: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <div className="font-tabular break-all rounded-lg bg-muted p-3.5 text-[12px] leading-[1.9]">
        {hex.replace(/(..)/g, '$1 ').trim()}
      </div>
    </div>
  )
}

export default App
