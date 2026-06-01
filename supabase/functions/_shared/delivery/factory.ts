// Factory: resolve adapter por nome do provider.
import type { DeliveryAdapter } from './types.ts';
import { mockAdapter } from './mockAdapter.ts';
import { lalamoveAdapter, lalamoveMeta } from './lalamoveAdapter.ts';
import { uberDirectAdapter, uberDirectMeta } from './uberDirectAdapter.ts';

export type ProviderName = 'mock' | 'lalamove' | 'uber_direct';

export function getAdapter(provider: ProviderName): DeliveryAdapter {
  switch (provider) {
    case 'lalamove':
      return lalamoveAdapter;
    case 'uber_direct':
      return uberDirectAdapter;
    case 'mock':
    default:
      return mockAdapter;
  }
}

export function isProviderConfigured(provider: ProviderName): boolean {
  if (provider === 'lalamove') return lalamoveMeta.configured;
  if (provider === 'uber_direct') return uberDirectMeta.configured;
  return true; // mock sempre disponível
}
