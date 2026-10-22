export interface RecommenderOptions {
  locale?: string;
  endpoint?: string;
  orderUrl?: string;
}

export interface AdminOptions {
  endpoint?: string;
}

export type Cleanup = () => void;

export function mountRecommender(root: HTMLElement, options?: RecommenderOptions): Cleanup;
export function mountAdmin(root: HTMLElement, options?: AdminOptions): Cleanup;
export function mountSelection(root: HTMLElement, options?: RecommenderOptions): Cleanup;
