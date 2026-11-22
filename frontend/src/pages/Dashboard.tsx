// YMS dashboard: the latest ingested batch from GET /api/dashboard, as draggable widgets.
// Widget styling follows the draggable-widget-grid demo; all numbers come from the backend.
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import DraggableWidgetGrid, { type WidgetItem } from '@/components/ui/draggable-widget-grid'

// API shape

type Tone = 'ok' | 'warn' | 'err' | 'idle'
interface Named {
	name: string
	count: number
}

export interface DashboardData {
	batch: { id: number; file_name: string; row_count: number; uploaded_at: string } | null
	range: { from: string | null; to: string | null }
	arrivals: { total: number; grid: number[][] }
	yard: { in_yard: number; gated_out: number; stages: Named[] }
	weight: { total_t: number; weeks: { week: string; t: number }[] }
	delivery: { on_time: number; delayed: number; full: number; not_full: number }
	trucks: {
		median_minutes: number | null
		recent: { plate: string | null; partner: string | null; gate_out: string; minutes: number | null; tone: Tone }[]
	}
	quality: { approved: number; rejected: number; avg_art: number | null }
	partners: { name: string; visits: number; t: number }[]
	materials: { total: number; items: Named[] }
	defects: { samples: number; items: { name: string; pct: number }[] }
	pines: { sizes: Named[]; median_per_sample: number | null }
}

type Kind =
	| 'arrivals'
	| 'yard'
	| 'delivery'
	| 'quality'
	| 'trucks'
	| 'pines'
	| 'weight'
	| 'partners'
	| 'materials'
	| 'defects'

interface Widget extends WidgetItem {
	kind: Kind
}

const WIDGETS: Widget[] = [
	{ id: 'arrivals', kind: 'arrivals', size: 'wide', label: 'Truck arrivals' },
	{ id: 'yard', kind: 'yard', size: 'sm', label: 'In yard' },
	{ id: 'delivery', kind: 'delivery', size: 'sm', label: 'On-time delivery' },
	{ id: 'quality', kind: 'quality', size: 'sm', label: 'Quality' },
	{ id: 'trucks', kind: 'trucks', size: 'wide', label: 'Latest gate-outs' },
	{ id: 'pines', kind: 'pines', size: 'sm', label: 'Piña sampling' },
	{ id: 'weight', kind: 'weight', size: 'wide', label: 'Net weight received' },
	{ id: 'partners', kind: 'partners', size: 'wide', label: 'Top suppliers' },
	{ id: 'materials', kind: 'materials', size: 'wide', label: 'Material mix' },
	{ id: 'defects', kind: 'defects', size: 'wide', label: 'Piña defects' },
]

// Formatting and palette

const fmt = (v: number) => v.toLocaleString('en-US')
const share = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0)
const pct = (v: number, digits = 0) => `${v.toFixed(digits)}%`

function duration(minutes: number | null) {
	if (minutes == null) return '–'
	if (minutes < 60) return `${Math.round(minutes)}m`
	return `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`
}

const shortDate = (iso: string, year = false) =>
	new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(year ? { year: 'numeric' } : {}),
	})

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

const DOT: Record<Tone, string> = {
	ok: 'bg-emerald-500',
	warn: 'bg-amber-500',
	err: 'bg-rose-500',
	idle: 'bg-muted-foreground/60',
}

const TEXT: Record<Tone, string> = {
	ok: 'text-emerald-600 dark:text-emerald-400',
	warn: 'text-amber-600 dark:text-amber-300',
	err: 'text-rose-600 dark:text-rose-400',
	idle: 'text-muted-foreground',
}

const ACCENT = 'bg-blue-500 dark:bg-blue-400'
const SWATCHES = [ACCENT, 'bg-blue-500/55 dark:bg-blue-400/55', 'bg-blue-500/30 dark:bg-blue-400/30', 'bg-foreground/20']
const HEAT = [
	'bg-foreground/[0.06]',
	'bg-blue-500/20',
	'bg-blue-500/35',
	'bg-blue-500/55',
	'bg-blue-500/85 dark:bg-blue-400/85',
]

// Building blocks

function Shell({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
	return (
		<section className="@container flex h-full flex-col gap-4 p-4 sm:p-[22px]">
			<header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[14px] leading-none">
				<h3 className="truncate text-[12px] tracking-[0.1em] text-muted-foreground uppercase">{title}</h3>
				{meta && <span className="shrink-0 text-[13px] text-muted-foreground">{meta}</span>}
			</header>
			<div className="flex min-h-0 flex-1 flex-col">{children}</div>
		</section>
	)
}

function Big({ children, unit }: { children: ReactNode; unit?: string }) {
	return (
		<p className="truncate text-[28px] leading-none font-normal tracking-tight text-foreground tabular-nums @[240px]:text-[30px]">
			{children}
			{unit && (
				<span className="text-[13px] tracking-normal text-muted-foreground">
					{' '}
					{unit}
				</span>
			)}
		</p>
	)
}

function Dot({ tone }: { tone: Tone }) {
	return <span aria-hidden="true" className={`inline-flex size-2 shrink-0 rounded-full ${DOT[tone]}`} />
}

function Row({ children, value }: { children: ReactNode; value: ReactNode }) {
	return (
		<div className="flex items-center gap-2 text-[13px]">
			<dt className="flex min-w-0 items-center gap-2 truncate text-foreground">{children}</dt>
			<dd className="ml-auto text-muted-foreground tabular-nums">{value}</dd>
		</div>
	)
}

/** Name, a bar scaled to the largest value, and the value. Short tiles keep the top rows. */
function BarTable({ caption, rows }: { caption: string; rows: { name: string; value: number; label: string }[] }) {
	const max = Math.max(...rows.map((r) => r.value), 0) || 1
	return (
		<table className="mt-auto w-full table-fixed text-left text-[13px]">
			<caption className="sr-only">{caption}</caption>
			<tbody>
				{rows.map((r, i) => (
					<tr key={r.name} className={i >= 4 ? 'hidden @[520px]:table-row' : i === 3 ? 'hidden @[360px]:table-row' : ''}>
						<th
							scope="row"
							title={r.name}
							className={`w-[45%] truncate py-[5px] pr-3 font-normal ${i === 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
							{r.name}
						</th>
						<td className="py-[5px]">
							<span aria-hidden="true" className="block h-[3px] rounded-full bg-foreground/10">
								<span
									className={`block h-full rounded-full ${i === 0 ? ACCENT : 'bg-foreground/25'}`}
									style={{ width: `${(r.value / max) * 100}%` }}
								/>
							</span>
						</td>
						<td className="w-[72px] py-[5px] text-right text-muted-foreground tabular-nums">{r.label}</td>
					</tr>
				))}
			</tbody>
		</table>
	)
}

// Widgets

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = ['12AM', '6AM', '12PM', '6PM']

function Arrivals({ d }: { d: DashboardData }) {
	const { grid, total } = d.arrivals
	const peak = Math.max(...grid.flat(), 1)
	let busy = { day: 0, hour: 0, n: -1 }
	grid.forEach((row, day) => row.forEach((n, hour) => n > busy.n && (busy = { day, hour, n })))
	const busiest = `${WEEKDAYS[busy.day]} ${String(busy.hour).padStart(2, '0')}:00`
	return (
		<Shell title="Truck arrivals" meta={`busiest ${busiest}`}>
			<Big unit="gate-ins">{fmt(total)}</Big>
			<div
				role="img"
				aria-label={`Gate-ins by weekday and hour. ${fmt(total)} in total, busiest on ${busiest}.`}
				className="mt-auto grid grid-cols-1 items-center gap-x-3 gap-y-[3px] @[480px]:grid-cols-[auto_minmax(0,1fr)]">
				{grid.map((row, day) => (
					<Fragment key={day}>
						<span aria-hidden="true" className="hidden text-[11px] leading-none text-muted-foreground @[480px]:block">
							{WEEKDAYS[day]}
						</span>
						<span className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
							{row.map((n, hour) => (
								<span
									key={hour}
									title={`${WEEKDAYS[day]} ${String(hour).padStart(2, '0')}:00 · ${n} trucks`}
									className={`h-[7px] rounded-[2px] ${n ? HEAT[Math.max(1, Math.ceil((n / peak) * 4))] : HEAT[0]}`}
								/>
							))}
						</span>
					</Fragment>
				))}
				<span aria-hidden="true" className="hidden @[480px]:block" />
				<span aria-hidden="true" className="mt-1.5 hidden grid-cols-4 text-[11px] text-muted-foreground @[480px]:grid">
					{HOURS.map((h) => (
						<span key={h}>{h}</span>
					))}
				</span>
			</div>
		</Shell>
	)
}

function Yard({ d }: { d: DashboardData }) {
	const { in_yard, gated_out, stages } = d.yard
	return (
		<Shell title="In yard" meta={`${fmt(gated_out)} out`}>
			<Big unit="trucks">{fmt(in_yard)}</Big>
			<dl className="mt-auto space-y-2">
				{stages.map((s, i) => (
					<Row key={s.name} value={fmt(s.count)}>
						<Dot tone={i === 0 ? 'warn' : 'idle'} />
						<span className="truncate">{s.name.replace(/-/g, ' ')}</span>
					</Row>
				))}
			</dl>
		</Shell>
	)
}

function Delivery({ d }: { d: DashboardData }) {
	const { on_time, delayed, full, not_full } = d.delivery
	const rate = share(on_time, on_time + delayed)
	const tone: Tone = rate >= 80 ? 'ok' : rate >= 50 ? 'warn' : 'err'
	return (
		<Shell title="On-time">
			<Big unit="of trucks">
				<span className={TEXT[tone]}>{pct(rate)}</span>
			</Big>
			<dl className="mt-auto space-y-2">
				<Row value={fmt(on_time)}>
					<Dot tone="ok" />
					On time
				</Row>
				<Row value={fmt(delayed)}>
					<Dot tone="err" />
					Delayed
				</Row>
				<Row value={pct(share(full, full + not_full))}>
					<Dot tone="idle" />
					In full
				</Row>
			</dl>
		</Shell>
	)
}

function Quality({ d }: { d: DashboardData }) {
	const { approved, rejected, avg_art } = d.quality
	return (
		<Shell title="Quality">
			<Big unit="QA pass">{pct(share(approved, approved + rejected), 1)}</Big>
			<dl className="mt-auto space-y-2">
				<Row value={fmt(approved)}>
					<Dot tone="ok" />
					Approved
				</Row>
				<Row value={fmt(rejected)}>
					<Dot tone={rejected ? 'err' : 'idle'} />
					Rejected
				</Row>
				<Row value={avg_art == null ? '–' : pct(avg_art, 1)}>
					<Dot tone="idle" />
					Avg ART
				</Row>
			</dl>
		</Shell>
	)
}

function Trucks({ d }: { d: DashboardData }) {
	const { median_minutes, recent } = d.trucks
	const longest = Math.max(...recent.map((r) => r.minutes ?? 0), median_minutes ?? 0, 1)
	return (
		<Shell title="Latest gate-outs" meta="gate in → out">
			<Big unit="median">{duration(median_minutes)}</Big>
			<ol aria-label="Most recent trucks to leave the yard" className="mt-auto space-y-2 text-[13px]">
				{recent.slice(0, 4).map((r, i) => (
					<li
						key={`${r.plate}-${r.gate_out}`}
						className={`grid-cols-[6px_minmax(0,1fr)_60px] items-center gap-3 @[440px]:grid-cols-[6px_84px_minmax(0,1fr)_22%_60px] ${
							i === 0 ? 'text-foreground' : 'text-muted-foreground'
						} ${i >= 3 ? 'hidden @[520px]:grid' : i === 2 ? 'hidden @[360px]:grid' : 'grid'}`}>
						<Dot tone={r.tone} />
						<span className="truncate">{r.plate ?? '—'}</span>
						<span className="hidden truncate @[440px]:block" title={r.partner ?? ''}>
							{r.partner ? title(r.partner) : '—'}
						</span>
						<span aria-hidden="true" className="hidden h-[3px] rounded-full bg-foreground/10 @[440px]:block">
							<span
								className={`block h-full rounded-full ${i === 0 ? ACCENT : 'bg-foreground/25'}`}
								style={{ width: `${((r.minutes ?? 0) / longest) * 100}%` }}
							/>
						</span>
						<span className="text-right tabular-nums">{duration(r.minutes)}</span>
					</li>
				))}
			</ol>
		</Shell>
	)
}

function Pines({ d }: { d: DashboardData }) {
	const { sizes, median_per_sample } = d.pines
	const total = sizes.reduce((a, s) => a + s.count, 0)
	return (
		<Shell title="Sampling">
			<Big unit="piñas / sample">{median_per_sample == null ? '–' : fmt(median_per_sample)}</Big>
			<dl className="mt-auto space-y-2">
				{sizes.map((s, i) => (
					<Row key={s.name} value={pct(share(s.count, total))}>
						<span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${SWATCHES[i]}`} />
						{s.name}
					</Row>
				))}
			</dl>
		</Shell>
	)
}

function Weight({ d }: { d: DashboardData }) {
	const { total_t, weeks } = d.weight
	const max = Math.max(...weeks.map((w) => w.t), 1)
	return (
		<Shell title="Net weight received" meta="weekly · last 12 wks">
			<Big unit="t total">{fmt(Math.round(total_t))}</Big>
			<div
				role="img"
				aria-label={`Net tonnes received per week, last ${weeks.length} weeks: ${weeks.map((w) => `${shortDate(w.week)} ${w.t} t`).join(', ')}.`}
				className="mt-auto flex h-14 items-end gap-[6px]">
				{weeks.map((w, i) => (
					<span
						key={w.week}
						title={`Week of ${shortDate(w.week)} · ${fmt(w.t)} t`}
						className={`flex-1 rounded-[3px] ${i === weeks.length - 1 ? ACCENT : 'bg-foreground/15'}`}
						style={{ height: `${Math.max(4, (w.t / max) * 100)}%` }}
					/>
				))}
			</div>
			{weeks.length > 0 && (
				<p aria-hidden="true" className="mt-2 flex justify-between text-[11px] text-muted-foreground">
					<span>{shortDate(weeks[0].week)}</span>
					<span>{shortDate(weeks[weeks.length - 1].week)}</span>
				</p>
			)}
		</Shell>
	)
}

function Partners({ d }: { d: DashboardData }) {
	const all = d.weight.total_t
	const top = d.partners[0]
	return (
		<Shell title="Top suppliers" meta="by net tonnes">
			<Big unit={top ? `from ${title(top.name).split(' ').slice(0, 2).join(' ')}` : undefined}>
				{top ? pct(share(top.t, all)) : '–'}
			</Big>
			<BarTable
				caption="Suppliers by net tonnes received"
				rows={d.partners.map((p) => ({ name: title(p.name), value: p.t, label: `${fmt(Math.round(p.t))} t` }))}
			/>
		</Shell>
	)
}

function Materials({ d }: { d: DashboardData }) {
	const { total, items } = d.materials
	return (
		<Shell title="Material mix" meta="by visits">
			<Big unit="visits">{fmt(total)}</Big>
			<dl className="mt-auto grid grid-cols-1 gap-x-6 gap-y-2 @[400px]:grid-cols-2">
				{items.map((m, i) => (
					<Row key={m.name} value={pct(share(m.count, total))}>
						<span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${SWATCHES[i]}`} />
						<span className="truncate" title={m.name}>
							{m.name}
						</span>
					</Row>
				))}
			</dl>
			<div
				role="img"
				aria-label={`Share of visits: ${items.map((m) => `${m.name} ${pct(share(m.count, total))}`).join(', ')}.`}
				className="mt-4 flex h-[3px] gap-[3px]">
				{items.map((m, i) => (
					<span key={m.name} className={`h-full rounded-full ${SWATCHES[i]}`} style={{ width: `${share(m.count, total)}%` }} />
				))}
			</div>
		</Shell>
	)
}

function Defects({ d }: { d: DashboardData }) {
	const { samples, items } = d.defects
	const worst = items[0]
	return (
		<Shell title="Piña defects" meta={`avg % · ${fmt(samples)} samples`}>
			<Big unit={worst ? worst.name.toLowerCase() : undefined}>{worst ? pct(worst.pct, 1) : '–'}</Big>
			<BarTable
				caption="Average share of sampled piñas with each defect"
				rows={items.map((x) => ({ name: x.name, value: x.pct, label: pct(x.pct, 1) }))}
			/>
		</Shell>
	)
}

const VIEWS: Record<Kind, (p: { d: DashboardData }) => ReactNode> = {
	arrivals: Arrivals,
	yard: Yard,
	delivery: Delivery,
	quality: Quality,
	trucks: Trucks,
	pines: Pines,
	weight: Weight,
	partners: Partners,
	materials: Materials,
	defects: Defects,
}

// Page

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: DashboardData }

export default function Dashboard({ onUploadClick }: { onUploadClick: () => void }) {
	const [load, setLoad] = useState<Load>({ state: 'loading' })

	useEffect(() => {
		let cancelled = false
		fetch('/api/dashboard')
			.then((res) => {
				if (!res.ok) throw new Error(`Server responded with ${res.status}`)
				return res.json() as Promise<DashboardData>
			})
			.then((data) => !cancelled && setLoad({ state: 'ready', data }))
			.catch((err: Error) => !cancelled && setLoad({ state: 'error', message: err.message }))
		return () => {
			cancelled = true
		}
	}, [])

	const uploadButton = (
		<button
			type="button"
			onClick={onUploadClick}
			className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[13px] text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none">
			<Upload className="size-4" aria-hidden="true" />
			Upload file
		</button>
	)

	let body: ReactNode
	if (load.state === 'loading') {
		body = <p className="py-24 text-center text-[14px] text-muted-foreground">Loading dashboard…</p>
	} else if (load.state === 'error') {
		body = (
			<p role="alert" className="py-24 text-center text-[14px] text-rose-600 dark:text-rose-400">
				Could not load the dashboard: {load.message}. Is the backend running on port 8000?
			</p>
		)
	} else if (!load.data.batch) {
		body = (
			<div className="flex flex-col items-center gap-4 rounded-3xl py-24 text-center ring-1 ring-border">
				<p className="text-[15px] text-foreground">No data yet</p>
				<p className="max-w-sm text-[13px] text-muted-foreground">Upload an NxGen YMS export to see the yard dashboard.</p>
				{uploadButton}
			</div>
		)
	} else {
		const { data } = load
		const { batch, range } = data
		body = (
			<>
				<div className="mb-5 flex flex-wrap items-end justify-between gap-4">
					<div className="min-w-0">
						<h1 className="text-[20px] font-medium tracking-tight text-foreground">Yard overview</h1>
						<p className="mt-1 truncate text-[13px] text-muted-foreground">
							{batch!.file_name} · {fmt(batch!.row_count)} rows
							{range.from && range.to && ` · ${shortDate(range.from)} – ${shortDate(range.to, true)}`}
						</p>
					</div>
					{uploadButton}
				</div>
				<p className="mb-3 text-[13px] text-muted-foreground">
					<span className="[@media(pointer:coarse)]:hidden">Drag widgets to rearrange the layout.</span>
					<span className="hidden [@media(pointer:coarse)]:inline">Press and hold a widget, then drag to rearrange.</span>
				</p>
				<section aria-label="Yard metrics">
					<DraggableWidgetGrid
						items={WIDGETS}
						renderItem={(item) => {
							const View = VIEWS[(item as Widget).kind]
							return <View d={data} />
						}}
					/>
				</section>
			</>
		)
	}

	return (
		<main
			className="min-h-screen w-full bg-background px-4 py-8 text-foreground antialiased sm:py-12"
			style={{ fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
			<div className="mx-auto w-full max-w-[1180px]">{body}</div>
		</main>
	)
}
