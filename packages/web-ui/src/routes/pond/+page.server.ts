import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';

export const load: PageServerLoad = async ({ url }) => {
  const api = new ServerAPIClient();

  try {
    // URLクエリパラメータから検索条件を取得
    const q = url.searchParams.get('q') || '';
    const source = url.searchParams.get('source') || '';
    const dateFrom = url.searchParams.get('dateFrom') || '';
    const dateTo = url.searchParams.get('dateTo') || '';
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Pondデータとソース一覧を並行取得
    const [pondResult, sources] = await Promise.all([
      api.getPond({
        q,
        source,
        dateFrom,
        dateTo,
        limit,
        offset,
      }),
      api.getPondSources(),
    ]);

    return {
      pond: pondResult.data,
      meta: pondResult.meta,
      sources,
      filters: {
        q,
        source,
        dateFrom,
        dateTo,
        limit,
        offset,
      },
    };
  } catch (error) {
    console.error('Failed to load pond data:', error);
    return {
      pond: [],
      meta: { total: 0, limit: 20, offset: 0, hasMore: false },
      sources: [],
      filters: {
        q: '',
        source: '',
        dateFrom: '',
        dateTo: '',
        limit: 20,
        offset: 0,
      },
    };
  }
};
