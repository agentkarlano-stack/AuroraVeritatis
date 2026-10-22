import { useMemo } from 'react';
import type { MacroResponse } from '../../../shared/macro';
import { useApi } from '../../lib/api';
import { demoDataset, ecbDataset, remotePath, type Dataset } from '../../lib/chart/sources';

/** Price history for a chart symbol: simulated instruments are generated locally, official series come from the API. */
export function useDataset(symbol: string): { dataset: Dataset | null; loading: boolean; error: string | null } {
  const path = remotePath(symbol);
  const res = useApi<MacroResponse>(path);
  return useMemo(() => {
    if (!path) return { dataset: demoDataset(symbol), loading: false, error: null };
    if (res.status === 'loading') return { dataset: null, loading: true, error: null };
    if (res.status === 'error') return { dataset: null, loading: false, error: 'The ECB data service is not responding. Try again later.' };
    const d = ecbDataset(symbol, res.data);
    return { dataset: d, loading: false, error: d ? null : 'The ECB returned no observations for this series.' };
  }, [path, symbol, res]);
}
