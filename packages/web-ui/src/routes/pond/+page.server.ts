import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';

export const load: PageServerLoad = async () => {
  const api = new ServerAPIClient();

  try {
    const pond = await api.getPond();
    return {
      pond,
    };
  } catch (error) {
    console.error('Failed to load pond data:', error);
    return {
      pond: [],
    };
  }
};
