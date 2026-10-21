import { Network } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { BrainNode } from '../lib/brain';
import { addToActiveGraph, type AddResult } from '../lib/brainEntities';
import { brainLimits, useTier } from '../lib/entitlements';

/** Adds an Aurora entity to the user's active Brain graph (local to this browser). */
export function AddToBrain({ entity, className = '' }: { entity: Omit<BrainNode, 'id' | 'x' | 'y' | 'sources'> & { sources?: BrainNode['sources'] }; className?: string }) {
  const limits = brainLimits(useTier());
  const [result, setResult] = useState<AddResult | { status: 'error'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    addToActiveGraph(entity, limits)
      .then(setResult)
      .catch((e: Error) => setResult({ status: 'error', message: e.message }))
      .finally(() => setBusy(false));
  };
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <button className="btn-ghost text-xs" onClick={run} disabled={busy}>
        <Network className="h-3.5 w-3.5" aria-hidden /> Add to Brain
      </button>
      {result && (
        <span className="text-xs text-slate-dim" role="status">
          {result.status === 'added' && (
            <>
              Added to <Link className="text-gold hover:underline" to="/brain">{result.graphName}</Link>
            </>
          )}
          {result.status === 'exists' && (
            <>
              Already in <Link className="text-gold hover:underline" to="/brain">{result.graphName}</Link>
            </>
          )}
          {(result.status === 'limit' || result.status === 'error') && <span className="text-down">{result.message}</span>}
        </span>
      )}
    </span>
  );
}
