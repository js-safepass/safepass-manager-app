// Vitest global setup. Loaded before each test file.
//
// - @testing-library/jest-dom extends expect() with DOM matchers like
//   toBeInTheDocument(), toHaveStyle(), etc.
// - cleanup() after each test unmounts components rendered via RTL so we
//   don't leak DOM state between tests.

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
