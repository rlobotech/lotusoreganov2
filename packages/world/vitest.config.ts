import { defineConfig } from 'vitest/config';

// The simulation and balance tests play hundreds of fights, so give them room on slow machines.
export default defineConfig({ test: { testTimeout: 30_000 } });
