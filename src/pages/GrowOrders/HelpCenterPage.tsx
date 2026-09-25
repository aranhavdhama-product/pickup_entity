/**
 * Help Center — `/grow/orders/help`. The live `/faq/` was NOT reachable during
 * the capture (research doc §11); the Dashboard links it as "Learn more about
 * delivering better orders · See all articles". So this is a clean FAQ layout of
 * our own: search · category chips · one Accordion per question, grouped by
 * category. Content = `helpArticles.ts`, labelled as sample content.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Accordion, EmptyState, Panel } from '../../nueva/components'
import { Chip, ChipRow, SearchBox } from '../../local/chrome'
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpCategory } from './helpArticles'

export default function GrowHelpPage() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<HelpCategory | null>(null)
  const needle = q.trim().toLowerCase()
  const hits = useMemo(() => HELP_ARTICLES.filter((a) =>
    (!cat || a.category === cat) && (!needle || `${a.q} ${a.a.join(' ')}`.toLowerCase().includes(needle))), [cat, needle])
  const count = (c: HelpCategory) => HELP_ARTICLES.filter((a) => a.category === c && (!needle || `${a.q} ${a.a.join(' ')}`.toLowerCase().includes(needle))).length

  return (
    <div className="flex max-w-[960px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">Learn more about delivering better orders.</p>
        <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[11px] font-bold text-ink-2" title="Written for this prototype — the live Help Center was not captured">
          Sample content
        </span>
      </div>
      <div className="flex [&_.pfp-search]:ml-0 [&_.pfp-search]:w-[320px]">
        <SearchBox value={q} onChange={setQ} placeholder="Search articles" />
      </div>
      <ChipRow>
        <Chip active={!cat} count={needle ? hits.length : HELP_ARTICLES.length} onClick={() => setCat(null)}>All</Chip>
        {HELP_CATEGORIES.map((c) => <Chip key={c} active={cat === c} count={count(c)} onClick={() => setCat(cat === c ? null : c)}>{c}</Chip>)}
      </ChipRow>

      {hits.length === 0 ? (
        <Panel><EmptyState icon={<BookOpen size={36} />} title="No articles match" hint="Try another word, or clear the category." /></Panel>
      ) : (
        HELP_CATEGORIES.filter((c) => hits.some((a) => a.category === c)).map((c) => (
          <section key={c} className="flex flex-col gap-2">
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{c}</p>
            {hits.filter((a) => a.category === c).map((a) => (
              <Accordion key={a.id} title={a.q} defaultOpen={!!needle && hits.length <= 3}>
                <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
                  {a.a.map((p, i) => <p key={i}>{p}</p>)}
                  {a.link && (
                    <Link to={a.link.to} className="inline-flex items-center gap-0.5 self-start text-[13px] font-bold text-brand-500 hover:underline">
                      {a.link.label}<ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              </Accordion>
            ))}
          </section>
        ))
      )}
    </div>
  )
}
