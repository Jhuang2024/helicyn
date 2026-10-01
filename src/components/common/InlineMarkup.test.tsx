import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { InlineMarkup } from './InlineMarkup';
it('keeps emphasis without mounting imported HTML attributes or active elements', () => {
  const { container } = render(<p><InlineMarkup text={'Safe <strong onclick="alert(1)">emphasis</strong><img src="x" onerror="alert(1)"><script>alert(1)</script><svg onload="alert(1)"></svg>'} /></p>);
  expect(screen.getByText('emphasis').tagName).toBe('STRONG');
  expect(container.querySelector('img, script, svg, [onclick], [onerror]')).toBeNull();
});
