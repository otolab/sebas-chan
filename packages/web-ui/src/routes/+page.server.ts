import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';

export const load: PageServerLoad = async () => {
  const api = new ServerAPIClient();
  
  try {
    const [inputs, issues] = await Promise.all([
      api.getInputs(),
      api.getIssues()
    ]);
    
    return {
      inputs,
      issues,
      stats: {
        inputCount: inputs.length,
        issueCount: issues.length,
        openIssues: issues.filter(i => i.status === 'open').length
      }
    };
  } catch (error) {
    console.error('Failed to load dashboard data:', error);
    return {
      inputs: [],
      issues: [],
      stats: { inputCount: 0, issueCount: 0, openIssues: 0 }
    };
  }
};