<script lang="ts">
  import type { PageData } from './$types';
  
  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <h1 class="text-2xl font-bold mb-6">Dashboard</h1>
  
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Inputs</h2>
      <p class="mt-2 text-3xl font-semibold text-gray-900">{data.stats.inputCount}</p>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Issues</h2>
      <p class="mt-2 text-3xl font-semibold text-gray-900">{data.stats.issueCount}</p>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide">Open Issues</h2>
      <p class="mt-2 text-3xl font-semibold text-gray-900">{data.stats.openIssues}</p>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
    <div>
      <h2 class="text-lg font-semibold mb-4">Recent Inputs</h2>
      <div class="bg-white shadow overflow-hidden rounded-lg">
        {#if data.inputs.length > 0}
          <ul class="divide-y divide-gray-200">
            {#each data.inputs.slice(0, 5) as input}
              <li class="px-4 py-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-gray-900">{input.source}</p>
                    <p class="text-sm text-gray-500">ID: {input.id}</p>
                  </div>
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    pending
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="px-4 py-4 text-sm text-gray-500">No inputs available</p>
        {/if}
      </div>
    </div>

    <div>
      <h2 class="text-lg font-semibold mb-4">Recent Issues</h2>
      <div class="bg-white shadow overflow-hidden rounded-lg">
        {#if data.issues.length > 0}
          <ul class="divide-y divide-gray-200">
            {#each data.issues.slice(0, 5) as issue}
              <li class="px-4 py-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-gray-900">{issue.title}</p>
                    <p class="text-sm text-gray-500">Labels: {issue.labels.join(', ') || 'None'}</p>
                  </div>
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {issue.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    {issue.status}
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="px-4 py-4 text-sm text-gray-500">No issues available</p>
        {/if}
      </div>
    </div>
  </div>
</div>
