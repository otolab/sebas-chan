<script lang="ts">
  import type { PageData } from './$types';
  
  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <h1 class="text-2xl font-bold mb-6">State Document</h1>
  
  <div class="bg-white shadow overflow-hidden rounded-lg">
    <div class="px-6 py-4">
      <pre class="whitespace-pre-wrap text-sm text-gray-700 font-mono">{data.state}</pre>
    </div>
  </div>
</div>