<script lang="ts">
  import type { PageData } from './$types';
  
  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="mb-4">
    <a href="/issues" class="text-indigo-600 hover:text-indigo-900">← Back to Issues</a>
  </div>
  
  <div class="bg-white shadow overflow-hidden rounded-lg">
    <div class="px-6 py-4 border-b border-gray-200">
      <h1 class="text-2xl font-bold">{data.issue.title}</h1>
    </div>
    
    <div class="px-6 py-4">
      <dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
        <div>
          <dt class="text-sm font-medium text-gray-500">ID</dt>
          <dd class="mt-1 text-sm text-gray-900">{data.issue.id}</dd>
        </div>
        
        <div>
          <dt class="text-sm font-medium text-gray-500">Status</dt>
          <dd class="mt-1">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {data.issue.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
              {data.issue.status}
            </span>
          </dd>
        </div>
        
        <div>
          <dt class="text-sm font-medium text-gray-500">Labels</dt>
          <dd class="mt-1 text-sm text-gray-900">
            {data.issue.labels.join(', ') || 'None'}
          </dd>
        </div>
        
        <div>
          <dt class="text-sm font-medium text-gray-500">Updates</dt>
          <dd class="mt-1 text-sm text-gray-900">{data.issue.updates.length} updates</dd>
        </div>
        
        {#if data.issue.sourceInputIds.length > 0}
        <div>
          <dt class="text-sm font-medium text-gray-500">Source Inputs</dt>
          <dd class="mt-1 text-sm text-gray-900">{data.issue.sourceInputIds.length} inputs</dd>
        </div>
        {/if}
        
        <div class="sm:col-span-2">
          <dt class="text-sm font-medium text-gray-500">Description</dt>
          <dd class="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{data.issue.description || 'No description available'}</dd>
        </div>
      </dl>
    </div>
  </div>
</div>