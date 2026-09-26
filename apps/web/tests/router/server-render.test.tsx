import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { useRoute } from '../../src/router';

function RouteProbe() {
  const route = useRoute();
  return <span>{route.kind}</span>;
}

it('can resolve the initial route during server rendering', () => {
  expect(() => renderToString(<RouteProbe />)).not.toThrow();
});
