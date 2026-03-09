/**
 * Benchmark harness.
 *
 * Each test runs RUNS times; we report mean ± stddev in ms.
 * A forced layout (getBoundingClientRect) before timing ends ensures
 * the browser has flushed style/layout — same method used by js-framework-benchmark.
 */

export interface BenchResult {
  name: string
  mean: number     // ms
  stddev: number   // ms
  runs: number
}

export interface BenchSuite {
  framework: string
  container: HTMLElement
  results: BenchResult[]
}

const RUNS = 5

export async function bench(
  name: string,
  suite: BenchSuite,
  fn: () => void | Promise<void>,
): Promise<BenchResult> {
  const samples: number[] = []

  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now()
    await fn()
    // Force layout flush so DOM work is included in the measurement
    suite.container.getBoundingClientRect()
    samples.push(performance.now() - t0)
    // Yield to browser between runs
    await tick()
  }

  const mean = samples.reduce((a, b) => a + b, 0) / RUNS
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / RUNS
  const stddev = Math.sqrt(variance)

  const result: BenchResult = { name, mean, stddev, runs: RUNS }
  suite.results.push(result)
  return result
}

export function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

/** Build a row data array of N items */
export interface Row {
  id: number
  label: string
}

let _nextId = 1
const ADJECTIVES = ["pretty","large","big","small","tall","short","long","handsome","plain","quaint","clean","elegant","easy","angry","crazy","helpful","mushy","odd","unsightly","adorable","important","inexpensive","cheap","expensive","fancy"]
const COLOURS = ["red","yellow","blue","green","pink","brown","purple","brown","white","black","orange"]
const NOUNS = ["table","chair","house","bbq","desk","car","pony","cookie","sandwich","burger","pizza","mouse","keyboard"]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

export function buildRows(count: number): Row[] {
  return Array.from({ length: count }, () => ({
    id: _nextId++,
    label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
  }))
}

/**
 * Build `count` items using the shared ID counter, calling `factory(id, label)`
 * for each row. Avoids allocating an intermediate Row[] when the caller needs
 * a different shape (e.g. reactive rows with signals).
 */
export function buildRowsWith<T>(count: number, factory: (id: number, label: string) => T): T[] {
  const rows = new Array<T>(count)
  for (let i = 0; i < count; i++) {
    rows[i] = factory(_nextId++, `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`) as T
  }
  return rows
}
