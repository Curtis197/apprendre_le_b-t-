import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EditModeProvider, EditOnly, EditToggle } from '@/components/lexicon/EditMode'
import { SpellingsList } from '@/components/lexicon/SpellingsList'

const listProps = {
  userId: 'u1', isAdmin: false, busy: false, error: '', notice: '',
  signInHref: '/auth', onAdd: () => {}, onRemove: () => {},
}

describe('lexicon edit mode (initial render)', () => {
  it('starts as a plain reading view inside the provider, with the pencil offered', () => {
    const html = renderToStaticMarkup(
      <EditModeProvider>
        <EditToggle />
        <EditOnly><p>formulaire</p></EditOnly>
      </EditModeProvider>,
    )
    expect(html).toContain('Modifier ou contribuer')
    expect(html).toContain('aria-pressed="false"')
    expect(html).not.toContain('formulaire')
  })

  it('leaves components unchanged outside a provider', () => {
    expect(renderToStaticMarkup(<EditOnly><p>formulaire</p></EditOnly>)).toContain('formulaire')
    expect(renderToStaticMarkup(<SpellingsList items={[]} {...listProps} />)).toContain('Proposer une autre graphie')
  })

  it('hides an empty spellings section from a reader', () => {
    const html = renderToStaticMarkup(
      <EditModeProvider><SpellingsList items={[]} {...listProps} /></EditModeProvider>,
    )
    expect(html).not.toContain('Autres graphies')
  })

  it('keeps existing spellings visible to a reader, without the add field or remove button', () => {
    const html = renderToStaticMarkup(
      <EditModeProvider>
        <SpellingsList items={[{ id: '1', spelling: 'kpa', created_by: 'u1' }]} {...listProps} />
      </EditModeProvider>,
    )
    expect(html).toContain('kpa')
    expect(html).not.toContain('Proposer une autre graphie')
    expect(html).not.toContain('Retirer')
  })
})
