<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let { issue } = data;

  function getStatusColor(status: string): string {
    return status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  }

  function getRelationTypeLabel(type: string): string {
    switch (type) {
      case 'blocks': return 'Blocks';
      case 'relates_to': return 'Related to';
      case 'duplicates': return 'Duplicates';
      case 'parent_of': return 'Parent of';
      default: return type;
    }
  }

  function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  function getAuthorBadge(author: string): string {
    return author === 'ai' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="mb-6">
    <a href="/issues" class="text-blue-600 hover:text-blue-800 mb-4 inline-block">← Back to Issues</a>

    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-bold mb-2">{issue.title}</h1>
        <div class="flex items-center gap-4">
          <span class="text-gray-600">ID: {issue.id}</span>
          <span class={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(issue.status)}`}>
            {issue.status}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Description -->
  <div class="bg-white shadow rounded-lg p-6 mb-6">
    <h2 class="text-lg font-semibold mb-3">Description</h2>
    <div class="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
      {issue.description}
    </div>
  </div>

  <!-- Labels -->
  {#if issue.labels && issue.labels.length > 0}
    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <h2 class="text-lg font-semibold mb-3">Labels</h2>
      <div class="flex flex-wrap gap-2">
        {#each issue.labels as label}
          <span class="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
            {label}
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Relations -->
  {#if issue.relations && issue.relations.length > 0}
    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <h2 class="text-lg font-semibold mb-3">Relations</h2>
      <ul class="space-y-2">
        {#each issue.relations as relation}
          <li class="flex items-center gap-2">
            <span class="font-medium">{getRelationTypeLabel(relation.type)}:</span>
            <a href="/issues/{relation.targetIssueId}" class="text-blue-600 hover:text-blue-800">
              Issue #{relation.targetIssueId}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Source Inputs -->
  {#if issue.sourceInputIds && issue.sourceInputIds.length > 0}
    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <h2 class="text-lg font-semibold mb-3">Source Inputs</h2>
      <ul class="space-y-1">
        {#each issue.sourceInputIds as inputId}
          <li class="text-gray-600 text-sm">
            Input ID: {inputId}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Updates -->
  {#if issue.updates && issue.updates.length > 0}
    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-3">Updates</h2>
      <div class="space-y-4">
        {#each issue.updates as update}
          <div class="border-l-2 border-gray-200 pl-4">
            <div class="flex items-center gap-2 mb-1">
              <span class={`px-2 py-1 text-xs font-medium rounded ${getAuthorBadge(update.author)}`}>
                {update.author}
              </span>
              <span class="text-sm text-gray-500">
                {formatDate(update.timestamp)}
              </span>
            </div>
            <p class="text-gray-700 whitespace-pre-wrap">{update.content}</p>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="bg-white shadow rounded-lg p-6">
      <h2 class="text-lg font-semibold mb-3">Updates</h2>
      <p class="text-gray-500">No updates yet</p>
    </div>
  {/if}
</div>