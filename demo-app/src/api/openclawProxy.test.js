import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeBackendMessages, pollForChatCompletion } from './openclawProxy'

const createRunStatus = (overrides = {}) => ({
  state: 'idle',
  pending: false,
  label: 'Idle',
  startedAt: null,
  updatedAt: null,
  runId: null,
  error: null,
  artifactCount: 0,
  hasUploads: false,
  ...overrides,
})

const jsonResponse = (payload) => ({
  ok: true,
  text: async () => JSON.stringify(payload),
})

describe('openclawProxy polling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('keeps polling until completion so late artifacts are not missed', async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            { role: 'user', text: 'Generate a summary', timestamp: '2026-03-05T09:00:00.000Z' },
            { role: 'assistant', text: 'Working on it', timestamp: '2026-03-05T09:00:01.000Z' },
          ],
          pending: true,
          runStatus: createRunStatus({
            state: 'running',
            pending: true,
            label: 'Waiting for agent output',
          }),
          files: {
            newArtifacts: [],
            artifacts: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            { role: 'user', text: 'Generate a summary', timestamp: '2026-03-05T09:00:00.000Z' },
            { role: 'assistant', text: 'Working on it', timestamp: '2026-03-05T09:00:01.000Z' },
          ],
          pending: false,
          runStatus: createRunStatus({
            state: 'completed',
            pending: false,
            label: 'Completed with files',
            artifactCount: 1,
          }),
          files: {
            newArtifacts: [
              {
                id: 'artifact-1',
                originalName: 'summary.txt',
                sizeBytes: 42,
                mimeType: 'text/plain',
              },
            ],
            artifacts: [],
          },
        }),
      )

    const updates = []
    const result = await pollForChatCompletion({
      agent: 'Excel Analyst',
      conversationId: 'smoke',
      previousAssistantCount: 0,
      pollIntervalMs: 1,
      timeoutMs: 100,
      onUpdate: (payload) => updates.push(payload),
    })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(updates).toHaveLength(2)
    expect(result.files.newArtifacts).toHaveLength(1)
    expect(result.runStatus.pending).toBe(false)
  })

  it('keeps polling after assistant text arrives until the backend clears pending', async () => {
    fetch
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [{ role: 'user', text: 'Need summary', timestamp: '2026-03-05T09:10:00.000Z' }],
          pending: true,
          runStatus: createRunStatus({
            state: 'running',
            pending: true,
            label: 'Waiting for agent output',
          }),
          files: {
            newArtifacts: [],
            artifacts: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            { role: 'user', text: 'Need summary', timestamp: '2026-03-05T09:10:00.000Z' },
            {
              role: 'assistant',
              text: 'I am generating the file now.',
              timestamp: '2026-03-05T09:10:01.000Z',
            },
          ],
          pending: true,
          runStatus: createRunStatus({
            state: 'running',
            pending: true,
            label: 'Waiting for agent output',
          }),
          files: {
            newArtifacts: [],
            artifacts: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            { role: 'user', text: 'Need summary', timestamp: '2026-03-05T09:10:00.000Z' },
            {
              role: 'assistant',
              text: 'I am generating the file now.',
              timestamp: '2026-03-05T09:10:01.000Z',
            },
          ],
          pending: false,
          runStatus: createRunStatus({
            state: 'completed',
            pending: false,
            label: 'Completed',
          }),
          files: {
            newArtifacts: [],
            artifacts: [],
          },
        }),
      )

    const result = await pollForChatCompletion({
      agent: 'Excel Analyst',
      conversationId: 'pending-with-output',
      previousAssistantCount: 0,
      pollIntervalMs: 1,
      timeoutMs: 100,
    })

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result.runStatus.pending).toBe(false)
    expect(normalizeBackendMessages(result).at(-1)?.text).toBe('I am generating the file now.')
  })

  it('normalizes backend messages for UI display', () => {
    const messages = normalizeBackendMessages({
      messages: [
        {
          role: 'user',
          text: 'Analyze the file\n[UI_FILE_CONTEXT]\nsecret path\n[/UI_FILE_CONTEXT]',
        },
        {
          role: 'assistant',
          text: '<final>Done</final>',
        },
      ],
    })

    expect(messages).toEqual([
      {
        role: 'user',
        text: 'Analyze the file',
        timestamp: null,
        file: null,
        artifacts: [],
      },
      {
        role: 'assistant',
        text: 'Done',
        timestamp: null,
        file: null,
        artifacts: [],
      },
    ])
  })

  it('keeps assistant message attachments when files are embedded on the message', () => {
    const messages = normalizeBackendMessages({
      messages: [
        {
          role: 'assistant',
          text: '',
          file: {
            id: 'doc-1',
            originalFilename: 'summary.docx',
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            downloadUrl: '/files/doc-1',
          },
          attachments: [
            {
              id: 'doc-2',
              originalFilename: 'appendix.docx',
              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              downloadUrl: '/files/doc-2',
            },
          ],
        },
      ],
    })

    expect(messages).toEqual([
      {
        role: 'assistant',
        text: '',
        timestamp: null,
        file: {
          id: 'doc-1',
          name: 'summary.docx',
          size: 0,
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          downloadUrl: 'https://api.golemforce.ai/files/doc-1',
        },
        artifacts: [
          {
            id: 'doc-2',
            name: 'appendix.docx',
            size: 0,
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            downloadUrl: 'https://api.golemforce.ai/files/doc-2',
          },
        ],
      },
    ])
  })
})
