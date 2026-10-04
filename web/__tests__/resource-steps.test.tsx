import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResourceSteps } from '../components/ResourceSteps'

describe('ResourceSteps', () => {
  it('shows both steps and marks the current one', () => {
    const html = renderToStaticMarkup(<ResourceSteps step={2} resourceId="r1" />)
    expect(html).toContain('Étape 1')
    expect(html).toContain('Étape 2')
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-current="step"[^>]*>[^<]*Étape 2/)
  })

  it('on step 2 links back to step 1 (the edit form)', () => {
    const html = renderToStaticMarkup(<ResourceSteps step={2} resourceId="r1" />)
    expect(html).toContain('href="/resources/r1/edit"')
    expect(html).not.toContain('href="/resources/r1/relier"')
  })

  it('on step 1 of an existing resource links forward to step 2', () => {
    const html = renderToStaticMarkup(<ResourceSteps step={1} resourceId="r1" />)
    expect(html).toContain('href="/resources/r1/relier"')
    expect(html).not.toContain('href="/resources/r1/edit"')
  })

  it('on step 1 of a new resource (nothing saved yet) has no link at all', () => {
    const html = renderToStaticMarkup(<ResourceSteps step={1} />)
    expect(html).not.toContain('<a')
    expect(html).toContain('Étape 2')
  })
})
