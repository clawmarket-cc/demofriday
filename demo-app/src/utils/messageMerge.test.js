import { describe, expect, it } from 'vitest'
import { appendMissingConversationMessages } from './messageMerge'

describe('appendMissingConversationMessages', () => {
  it('does not duplicate a single loose match when only timestamp differs', () => {
    const primary = [
      {
        role: 'user',
        text: 'Repeat this',
        timestamp: '2026-03-06T10:00:00.000Z',
      },
    ]
    const secondary = [
      {
        role: 'user',
        text: 'Repeat this',
        timestamp: '2026-03-06T10:00:01.000Z',
      },
    ]

    const merged = appendMissingConversationMessages(primary, secondary)

    expect(merged).toEqual(primary)
  })

  it('skips exact duplicates', () => {
    const primary = [
      {
        role: 'assistant',
        text: 'Done.',
        timestamp: '2026-03-06T10:00:00.000Z',
      },
    ]
    const secondary = [
      {
        role: 'assistant',
        text: 'Done.',
        timestamp: '2026-03-06T10:00:00.000Z',
      },
    ]

    const merged = appendMissingConversationMessages(primary, secondary)

    expect(merged).toEqual(primary)
  })

  it('treats timestamp-less messages as fallback matches when a loose match exists', () => {
    const primary = [
      {
        role: 'assistant',
        text: 'Working on it',
        timestamp: '2026-03-06T10:00:00.000Z',
      },
    ]
    const secondary = [
      {
        role: 'assistant',
        text: 'Working on it',
        timestamp: '',
      },
    ]

    const merged = appendMissingConversationMessages(primary, secondary)

    expect(merged).toEqual(primary)
  })

  it('keeps a later repeated turn even when one duplicate already exists', () => {
    const primary = [
      {
        role: 'assistant',
        text: 'Queued',
        timestamp: '2026-03-06T10:00:00.000Z',
      },
    ]
    const secondary = [
      {
        role: 'assistant',
        text: 'Queued',
        timestamp: '2026-03-06T10:00:00.000Z',
      },
      {
        role: 'assistant',
        text: 'Queued',
        timestamp: '2026-03-06T10:00:05.000Z',
      },
    ]

    const merged = appendMissingConversationMessages(primary, secondary)

    expect(merged).toHaveLength(2)
    expect(merged[1]).toEqual(secondary[1])
  })
})
