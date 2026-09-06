/**
 * 计算书视图：完整计算过程（每步算式与结果），支持打印 / 导出 PDF。
 */
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui'
import { buildCalculationBook, type CalculationBook } from '../kernel/calcbook'
import type { DesignResult } from '../kernel/pipeline'

function BookBody({ book }: { book: CalculationBook }) {
  let eq = 0
  return (
    <div className="space-y-5">
      {book.sections.map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-2 text-[14px] font-semibold tracking-tight">{sec.title}</h3>
          {sec.steps.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">（按部位展开见 7.1~7.4）</p>
          ) : (
            <ol className="space-y-2">
              {sec.steps.map((st) => (
                <li key={sec.title + st.label} className="grid gap-0.5 border-b border-border/60 pb-2 last:border-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium">{st.label}</span>
                    {st.note && <span className="flex-none text-[11px] text-muted-foreground">{st.note}</span>}
                  </div>
                  <div className="whitespace-pre-line font-tabular text-[12.5px] leading-relaxed text-foreground/90">
                    {st.formula}
                    <span className="ml-2 text-muted-foreground">（{String(++eq).padStart(2, '0')}）</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}

/** 屏幕视图（"计算书"页签） */
export function CalculationBookPanel({ result }: { result: DesignResult }) {
  if (!result.ok) {
    return <p className="py-14 text-center text-sm text-muted-foreground">当前参数未通过校验，无法生成计算书</p>
  }
  const book = buildCalculationBook(result.input, result.calc, result.opt, result.designNumber)
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>设计计算书</CardTitle>
            <CardDescription>
              设计编号 #{book.meta.designNumber} · 生成于 {book.meta.generatedAt} · 打印后另存为 PDF 即为正式计算书
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => window.print()}>打印 / 导出 PDF</Button>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          水工钢筋混凝土肋形楼盖辅助设计系统 · 设计计算书
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          设计编号 #{book.meta.designNumber} ｜ 依据 SL 191-2008 / GB 50010-2010 ｜ 生成时间 {book.meta.generatedAt}
        </p>
        <BookBody book={book} />
        <div className="mt-5 rounded-lg border p-3.5">
          <div className="text-[13.5px] font-medium">九、结论</div>
          <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{book.conclusion}</div>
        </div>
      </CardContent>
    </Card>
  )
}

/** 打印视图（屏幕隐藏，打印时仅输出计算书） */
export function CalculationBookPrintView({ result }: { result: DesignResult | null }) {
  if (!result || !result.ok) return null
  const book = buildCalculationBook(result.input, result.calc, result.opt, result.designNumber)
  return (
    <div className="hidden print:block" aria-hidden>
      <div className="calc-book-print px-8 py-6 text-[12px] leading-relaxed text-black">
        <h1 className="text-center text-[18px] font-bold">水工钢筋混凝土肋形楼盖辅助设计系统 · 设计计算书</h1>
        <p className="mt-1 text-center text-[11px] text-gray-600">
          设计编号 #{book.meta.designNumber} ｜ 依据 SL 191-2008 / GB 50010-2010 ｜ 生成时间 {book.meta.generatedAt}
        </p>
        <BookBody book={book} />
        <div className="mt-4">
          <h3 className="mb-1 text-[14px] font-semibold">九、结论</h3>
          <p>{book.conclusion}</p>
        </div>
        <p className="mt-6 text-[10.5px] text-gray-500">
          本计算书由水工钢筋混凝土肋形楼盖辅助设计系统 V1.0 生成，供设计参考；用于工程前须经注册结构工程师复核。
        </p>
      </div>
    </div>
  )
}
