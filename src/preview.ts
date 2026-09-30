// Phone build: the config as written. (Browser builds — preview.web.ts.)
import type { SiteConfig } from './site.config.ts';

export const isDemo = false;
export const withPreview = (base: SiteConfig): SiteConfig => base;
