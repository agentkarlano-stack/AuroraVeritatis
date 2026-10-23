import { useMemo } from 'react';
import type { MacroResponse } from '../../../shared/macro';
import { useApi } from '../../lib/api';
import type { CommodityData } from '../../lib/commodities';
import { commodityDataset, demoDataset, ecbDataset, isCommoditySymbol, remotePath, type Dataset } from '../../lib/chart/sources';

/** Price history for a chart symbol: simulated instruments are generated locally; ECB rates come from the API and World Bank commodity averages from a static data file. */
export function useDataset(symbol: string): { dataset: Dataset | null; loading: boolean; error: string | null } {
  const path = remotePath(symbol);
  const res = useApi<MacroResponse | CommodityData>(path);
  return useMemo(() => {
    if (!path) return { dataset: demoDataset(symbol), loading: false, error: null };
    if (res.status === 'loading') return { dataset: null, loading: true, error: null };
    if (isCommoditySymbol(symbol)) {
      if (res.status === 'error') return { dataset: null, loading: false, error: 'The commodity price file could not be loaded. Try again later.' };
      const c = commodityDataset(symbol, res.data as CommodityData);
      return { dataset: c, loading: false, error: c ? null : 'No observations for this commodity.' };
    }
    if (res.status === 'error') return { dataset: null, loading: false, error: 'The ECB data service is not responding. Try again later.' };
    const d = ecbDataset(symbol, res.data as MacroResponse);
    return { dataset: d, loading: false, error: d ? null : 'The ECB returned no observations for this series.' };
  }, [path, symbol, res]);
}
