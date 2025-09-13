<script lang="ts">
	import '../app.css';
	import HealthIndicator from '$lib/components/HealthIndicator.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-50">
  <nav class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex">
          <div class="flex-shrink-0 flex items-center">
            <h1 class="text-xl font-bold">sebas-chan</h1>
          </div>
          <div class="hidden sm:ml-6 sm:flex sm:space-x-8">
            <a href="/" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Dashboard
            </a>
            <a href="/pond" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Pond
            </a>
            <a href="/issues" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Issues
            </a>
            <a href="/knowledge" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              Knowledge
            </a>
            <a href="/state" class="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
              State
            </a>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <main>
    {@render children?.()}
  </main>
  
  <HealthIndicator />
</div>
