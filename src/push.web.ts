// Browser preview: no push.
import type { SiteConfig } from './site.config.ts';

export function listenForTaps(_onUrl: (url: string) => void): () => void {
  return () => {};
}

export async function registerPush(_cfg: SiteConfig): Promise<void> {}
