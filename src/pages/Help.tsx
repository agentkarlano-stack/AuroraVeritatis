import { Link } from 'react-router';
import { PageHeader, Panel } from '../components/ui';

/**
 * Help & Guides: the one place for how-to explanations, so the product screens stay free of permanent instructional
 * text. Contextual hints remain only where they are needed (first use, empty states, actionable errors).
 */
const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: 'radar',
    title: 'Global Radar',
    body: (
      <>
        <p>The arrival map shows current hazard signals (USGS earthquakes from magnitude 4.5, GDACS disaster alerts) and grouped news stories. Click a country to open its dossier and its own developments; click an event to focus it. Esc steps back: from an event to its country, then to the overview.</p>
        <p>Times are when the source published. Simulated material is never shown on Radar.</p>
      </>
    ),
  },
  {
    id: 'briefing',
    title: 'Operations Briefing',
    body: (
      <>
        <p>One shared narrated edition a day covering the preceding 24 hours: the Commander leads, the Analyst explains each development and the Security Officer adds operational and security notes. The voices are generated presentation roles; the lines are built only from the cited sources.</p>
        <p>The briefing fills the screen and plays without controls. Keyboard: Space pauses or resumes, ← and → move between stories, Esc closes. At the end you can replay it or close it; the summary with sources and the full transcript then appears in Radar.</p>
        <p>Before the day's edition is published, Play shows a preview built from the current feeds, labelled as a preview. Signed-in users hear the presenter voices; guests hear their browser's own voice.</p>
      </>
    ),
  },
  {
    id: 'archive',
    title: 'Briefing archive',
    body: <p>Published editions stay available for 30 days under Briefing archive in Radar. Each plays exactly as published: later news never changes an archived edition, and corrections appear as a new revision.</p>,
  },
  {
    id: 'report',
    title: 'Situation Report',
    body: <p>The written counterpart to the briefing for the last 24 hours, built from the latest validated information each time you open it. The conversation appears as captions timed to reading speed, with the same map movements.</p>,
  },
  {
    id: 'comfort',
    title: 'Comfort Mode',
    body: <p>A silent, continuous presentation of current developments with the same map movements and captions, without narration. Start it from Radar, or let it start after five minutes without activity (switch it off in Account or in HQ › Preferences). Any click, tap or key returns you to exactly where you were.</p>,
  },
  {
    id: 'map',
    title: 'Map close-ups and imagery',
    body: <p>Briefing close-ups turn from the grayscale intelligence map to natural-colour satellite imagery. The imagery is a composite or archive image, not a live view; provider credits stay visible in the corner of the map.</p>,
  },
  {
    id: 'layers',
    title: 'Layers (Map Explorer)',
    body: <p>Layers opens in one click. Search with everyday words (airports, ships, floods, NATO), turn layers on and off, adjust opacity, pin favourites and reset to the default set. Layers that are not available yet are listed with what they still need.</p>,
  },
  {
    id: 'hq',
    title: 'HQ',
    body: <p>Your workspace: continue where you left off, follow countries and regions to see what changed since your last visit, and keep saved items in collections with notes. Customise lets you reorder, resize and hide widgets.</p>,
  },
  {
    id: 'sources',
    title: 'Sources and evidence',
    body: (
      <p>
        Every item links to its source in the event panels, the briefing summary and the transcript. Providers, licences and attribution are listed on{' '}
        <Link to="/legal/sources" className="text-gold hover:underline">
          Data sources
        </Link>
        ; how automation and generated voices are used is explained in{' '}
        <Link to="/legal/ai" className="text-gold hover:underline">
          AI transparency
        </Link>
        .
      </p>
    ),
  },
];

export default function Help() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader eyebrow="Help" title="Help & Guides">
        How the main parts of Aurora Veritatis work.
      </PageHeader>
      <nav aria-label="Topics" className="mb-6 flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="chip text-xs">
            {s.title}
          </a>
        ))}
      </nav>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-20">
            <Panel title={s.title}>
              <div className="space-y-2 text-sm leading-relaxed text-mist">{s.body}</div>
            </Panel>
          </section>
        ))}
      </div>
    </div>
  );
}
