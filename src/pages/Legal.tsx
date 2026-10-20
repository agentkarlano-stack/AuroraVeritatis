import { Link, useParams } from 'react-router';
import { DemoNotice } from '../components/ui';
import { LEGAL } from '../data/legal';
import NotFound from './NotFound';

export default function Legal() {
  const { doc = '' } = useParams();
  const d = Object.hasOwn(LEGAL, doc) ? LEGAL[doc] : undefined;
  if (!d) return <NotFound />;
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <div className="eyebrow mb-2">Legal · Draft</div>
      <h1 className="text-3xl font-semibold">{d.title}</h1>
      <div className="mt-4">
        <DemoNotice>
          <strong>Draft for review.</strong> This document is incomplete, requires the operator's legal details and must be
          reviewed by a qualified lawyer before commercial publication.
        </DemoNotice>
      </div>
      <div className="mt-6 space-y-6">
        {d.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-base font-semibold text-platinum">{s.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist">{s.body}</p>
          </section>
        ))}
      </div>
      <nav className="mt-10 flex flex-wrap gap-2 border-t border-line pt-4 text-xs">
        {Object.entries(LEGAL).map(([k, v]) => (
          <Link key={k} to={`/legal/${k}`} className={`chip ${k === doc ? 'text-gold-soft' : ''}`}>
            {v.title}
          </Link>
        ))}
      </nav>
    </article>
  );
}
