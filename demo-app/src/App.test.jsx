import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import App from './App'
import {
  clearChat,
  fetchChat,
  pollForChatCompletion,
  postChat,
  uploadFiles,
} from './api/openclawProxy'

vi.mock('./api/openclawProxy', async () => {
  const actual = await vi.importActual('./api/openclawProxy')

  return {
    ...actual,
    clearChat: vi.fn(),
    fetchChat: vi.fn(),
    pollForChatCompletion: vi.fn(),
    postChat: vi.fn(),
    uploadFiles: vi.fn(),
  }
})

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

const createPayload = ({ messages = [], runStatus, files = {}, pending } = {}) => ({
  assistant: '',
  pending: pending ?? Boolean(runStatus?.pending),
  runStatus:
    runStatus
    ?? createRunStatus({
      state: pending ? 'running' : 'idle',
      pending: Boolean(pending),
      label: pending ? 'Waiting for agent output' : 'Idle',
    }),
  messages,
  files: {
    artifacts: [],
    newArtifacts: [],
    ...files,
  },
})

const getComposerInput = () => screen.getAllByPlaceholderText('Message Excel Analyst...')[0]
const RUNTIME_CONVERSATIONS_CACHE_KEY = '__golemforce-chat-runtime-conversations'
const DOCX_PREVIEW_FIXTURE =
  'UEsDBBQAAAAIABYGZlyn3//Y5QAAAGkBAAARAAAAd29yZC9kb2N1bWVudC54bWxNkEluxCAQRfd9ihJSljF2FEWRZdO7KMvOdABiV7otQYEA2+H2AZweVrwS//8auv2vVrCg85OhnjVVzQBpMONEx559fb7cPzPwQdIolSHsWUTP9mLXre1ohlkjBUgJ5Nu1Z6cQbMu5H06opa+MRUp/P8ZpGVLpjnw1brTODOh9aqAVf6jrJ67lREzsAFLqtxljxlLYjTY+OJGfjxAVwtouUvXsFWWetGFcdHzTXB1FH8TbLF1ApyIclKQsC0X8Ly2+m45X4zsuSDPC5GG20DzeQUTpwKRrFapusy4xGbYlMp2PJP4AUEsBAhQAFAAAAAgAFgZmXKff/9jlAAAAaQEAABEAAAAAAAAAAAAAAAAAAAAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAABAAEAPwAAABQBAAAAAA=='
const PPTX_PREVIEW_FIXTURE =
  'UEsDBBQAAAAIAH0GZlxY2oehNQEAAAwDAAAVAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1stVLLTsMwELz3KyxLHInLU1WUpIIDnJCqpnyAqZc0kl+yl7T5e+ykUWiRApde7Jmxd3bHcrY8KEkacL42Oqc3yZwS0Fsjal3l9H3zcr2gxCPXgkujIacteLosZplNvRQkFGuf8pzuEG3KmN/uQHGfGAs6nH0apzgG6iomHN8HUyXZ7Xz+yBSvNT3W2//UWwceNHIMg56YFDNCwjjbUooIO+LtxgH09CgMpKO6Ke3KFR3qd7sj2NoQEGuUQFmRseGwA939nxZ4eDaiHaUg8vQjSCvHzlTpscRWwrlui7CEBjzFYg0N6C8gJRrXZixKcY3t48Wxc5jmtHVUxnh/ZR2CXTrP03pNKgd7gobcJfdvyUSmX8WvznhPFHdVrUmtrDMNiOj0sLiaMpp+nB4PHyOy/s90egDfUEsDBBQAAAAIAH0GZlzb0/0sNgEAABMDAAAVAAAAcHB0L3NsaWRlcy9zbGlkZTIueG1stVLLTsMwELzzFZbv1IUDQlGSSkhw4lCp5QOWZNtYOM7K3pbm71knjUorVLhwsWfG3sfYmy8OrVN7DNF2vtB3s7lW6Kuutn5b6Lf1y+2jVpHB1+A6j4XuMepFeZNTFl2tJNjHDArdMFNmTKwabCHOOkIvZ5sutMBCw9bUAT4laevM/Xz+YFqwXh/j6S/xFDCiZ2Bp9CxJeaOUtFOtXJ3gQCKtA+JIj8JEBur3K1qGckDjTo3insQgW3aoTZmb6XAAw/3vKfjw1NX9SRIRsneRlsFcqC7yinuHlzqVskgByLh8PmC1S97U0oHPTdLSmuqnm6fS0s557aSc/P1mdnL234ZeYeerRhFUH7CVj1cBN/KFzeyKtx9ehWT0ZCIZAwUbUZEldNbjtTTXn2jE03wkNo7OoAv4AlBLAQIUABQAAAAIAH0GZlxY2oehNQEAAAwDAAAVAAAAAAAAAAAAAAAAAAAAAABwcHQvc2xpZGVzL3NsaWRlMS54bWxQSwECFAAUAAAACAB9BmZc29P9LDYBAAATAwAAFQAAAAAAAAAAAAAAAABoAQAAcHB0L3NsaWRlcy9zbGlkZTIueG1sUEsFBgAAAAACAAIAhgAAANECAAAAAA=='
const decodeBase64ToArrayBuffer = (value) => Uint8Array.from(Buffer.from(value, 'base64')).buffer
const createWorkbookPreviewBuffer = () => {
  const workbook = XLSX.utils.book_new()
  const overviewSheet = XLSX.utils.aoa_to_sheet([
    ['Metric', 'Value'],
    ['Revenue', '120000'],
    ['Margin', '18%'],
  ])
  const forecastSheet = XLSX.utils.aoa_to_sheet([
    ['Month', 'ARR'],
    ['Jan', '95000'],
    ['Feb', '103000'],
  ])

  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview')
  XLSX.utils.book_append_sheet(workbook, forecastSheet, 'Forecast')

  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  if (bytes instanceof ArrayBuffer) {
    return bytes
  }

  if (ArrayBuffer.isView(bytes)) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }

  return new Uint8Array(bytes).buffer
}

const createDocxPreviewBuffer = () => decodeBase64ToArrayBuffer(DOCX_PREVIEW_FIXTURE)

const createPptxPreviewBuffer = () => decodeBase64ToArrayBuffer(PPTX_PREVIEW_FIXTURE)

describe('App chat flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    delete window[RUNTIME_CONVERSATIONS_CACHE_KEY]
    vi.clearAllMocks()
    fetchChat.mockResolvedValue(createPayload())
    clearChat.mockResolvedValue({ ok: true })
    postChat.mockResolvedValue(createPayload())
    pollForChatCompletion.mockResolvedValue(null)
    uploadFiles.mockResolvedValue({ uploaded: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('hides PowerPoint Maker from the visible agent list', async () => {
    render(<App />)

    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    const agentList = screen.getByRole('navigation', { name: 'Available agents' })

    expect(within(agentList).getByRole('button', { name: /Excel Analyst/i })).toBeInTheDocument()
    expect(within(agentList).getByRole('button', { name: /PDF Agent/i })).toBeInTheDocument()
    expect(within(agentList).queryByRole('button', { name: /PowerPoint Maker/i })).not.toBeInTheDocument()
  })

  it('keeps the waiting indicator visible until the pending run completes', async () => {
    const user = userEvent.setup()
    let resolvePoll

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
        }),
      }),
    )

    pollForChatCompletion.mockImplementation(async ({ onUpdate }) => {
      onUpdate(
        createPayload({
          pending: true,
          runStatus: createRunStatus({
            state: 'running',
            pending: true,
            label: 'Waiting for agent output',
          }),
          messages: [
            { role: 'user', text: 'Need a summary', timestamp: '2026-03-05T10:00:00.000Z' },
            { role: 'assistant', text: 'Summary ready', timestamp: '2026-03-05T10:00:01.000Z' },
          ],
        }),
      )

      return await new Promise((resolve) => {
        resolvePoll = () =>
          resolve(
            createPayload({
              pending: false,
              runStatus: createRunStatus({
                state: 'completed',
                pending: false,
                label: 'Completed',
              }),
              messages: [
                { role: 'user', text: 'Need a summary', timestamp: '2026-03-05T10:00:00.000Z' },
                { role: 'assistant', text: 'Summary ready', timestamp: '2026-03-05T10:00:01.000Z' },
              ],
            }),
          )
      })
    })

    render(<App />)

    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Need a summary')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Need a summary')).toBeInTheDocument()
    expect((await screen.findAllByText('Summary ready')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Waiting for agent output')).toBeInTheDocument()

    await act(async () => {
      resolvePoll()
    })

    await waitFor(() => {
      expect(postChat).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'Excel Analyst',
          message: 'Need a summary',
        }),
      )
    })

    expect(screen.queryByText('Waiting for agent output')).not.toBeInTheDocument()
  })

  it('restores a pending agent status after returning with a cleared tab session', async () => {
    const createPendingHydrationPayload = (agent) =>
      agent === 'Excel Analyst'
        ? createPayload({
            pending: true,
            runStatus: createRunStatus({
              state: 'running',
              pending: true,
              label: 'Waiting for agent output',
            }),
            messages: [
              { role: 'user', text: 'Need a summary', timestamp: '2026-03-06T12:00:00.000Z' },
            ],
          })
        : createPayload()

    const firstConversationIds = []

    fetchChat.mockImplementation(({ agent, conversationId }) => {
      if (agent === 'Excel Analyst') {
        firstConversationIds.push(conversationId)
      }

      return Promise.resolve(createPendingHydrationPayload(agent))
    })

    const firstRender = render(<App />)

    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Excel Analyst/i })[0]).toHaveTextContent('Busy'),
    )

    const firstConversationId = firstConversationIds[0]

    firstRender.unmount()
    window.sessionStorage.clear()
    delete window[RUNTIME_CONVERSATIONS_CACHE_KEY]

    const secondConversationIds = []
    fetchChat.mockClear()
    fetchChat.mockImplementation(({ agent, conversationId }) => {
      if (agent === 'Excel Analyst') {
        secondConversationIds.push(conversationId)
      }

      return Promise.resolve(createPendingHydrationPayload(agent))
    })

    render(<App />)

    expect(screen.getAllByRole('button', { name: /Excel Analyst/i })[0]).toHaveTextContent('Busy')

    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))
    expect(secondConversationIds[0]).toBe(firstConversationId)
  })

  it('shows a task-specific ticker label for pending Word generation', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
        }),
      }),
    )

    pollForChatCompletion.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'running',
          pending: true,
          label: 'Waiting for agent output',
        }),
        messages: [],
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Create a Word document for the customer')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Generating Word document')).toBeInTheDocument()
  })

  it('does not show a running ticker while clearing chat history', async () => {
    const user = userEvent.setup()
    let resolveClear

    fetchChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed',
        }),
        messages: [
          { role: 'user', text: 'Old prompt', timestamp: '2026-03-06T10:00:00.000Z' },
          { role: 'assistant', text: 'Old answer', timestamp: '2026-03-06T10:00:01.000Z' },
        ],
      }),
    )

    clearChat.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClear = resolve
        }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))
    expect((await screen.findAllByText('Old answer')).length).toBeGreaterThan(0)

    const clearButton = screen.getByLabelText('Clear chat history for Excel Analyst')
    await user.click(clearButton)

    expect(clearButton).toBeDisabled()
    expect(screen.queryByText('Waiting for agent output')).not.toBeInTheDocument()

    await act(async () => {
      resolveClear({ ok: true })
    })
  })

  it('uploads a file and renders a generated artifact returned from the backend', async () => {
    const user = userEvent.setup()

    uploadFiles.mockResolvedValue({
      uploaded: [
        {
          id: 'upload-1',
          name: 'brief.xlsx',
          size: 14,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
          hasUploads: true,
        }),
      }),
    )

    pollForChatCompletion.mockImplementation(async ({ onUpdate }) => {
      onUpdate(
        createPayload({
          pending: true,
          runStatus: createRunStatus({
            state: 'running',
            pending: true,
            label: 'Waiting for agent output',
            hasUploads: true,
          }),
          messages: [
            { role: 'user', text: 'Analyze this workbook', timestamp: '2026-03-05T11:00:00.000Z' },
            {
              role: 'assistant',
              text: 'I am preparing the workbook summary.',
              timestamp: '2026-03-05T11:00:01.000Z',
            },
          ],
        }),
      )

      return createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          hasUploads: true,
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Analyze this workbook', timestamp: '2026-03-05T11:00:00.000Z' },
          {
            role: 'assistant',
            text: 'Workbook summary is ready.',
            timestamp: '2026-03-05T11:00:02.000Z',
          },
        ],
        files: {
          newArtifacts: [
            {
              id: 'artifact-1',
              name: 'summary.txt',
              sizeBytes: 128,
              mimeType: 'text/plain',
              downloadUrl: '/files/artifact-1',
            },
          ],
        },
      })
    })

    const { container } = render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    const fileInput = container.querySelector('input[type="file"]')
    const workbook = new File(['a,b\n1,2'], 'brief.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await user.upload(fileInput, workbook)
    await user.type(getComposerInput(), 'Analyze this workbook')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(uploadFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'Excel Analyst',
          files: [workbook],
        }),
      )
    })

    expect((await screen.findAllByText('Workbook summary is ready.')).length).toBeGreaterThan(0)
    expect(await screen.findByText('summary.txt')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://api.golemforce.ai/files/artifact-1',
    )
  })

  it('keeps uploaded files downloadable after switching between agent screens', async () => {
    const user = userEvent.setup()

    uploadFiles.mockResolvedValue({
      uploaded: [
        {
          id: 'upload-1',
          name: 'brief.xlsx',
          size: 14,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          downloadUrl: '/files/upload-1',
        },
      ],
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed',
          hasUploads: true,
        }),
        messages: [
          { role: 'user', text: 'Analyze this workbook', timestamp: '2026-03-05T12:00:00.000Z' },
          { role: 'assistant', text: 'Workbook parsed.', timestamp: '2026-03-05T12:00:01.000Z' },
        ],
      }),
    )

    const { container } = render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    const fileInput = container.querySelector('input[type="file"]')
    const workbook = new File(['a,b\n1,2'], 'brief.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await user.upload(fileInput, workbook)
    await user.type(getComposerInput(), 'Analyze this workbook')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(uploadFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'Excel Analyst',
          files: [workbook],
        }),
      )
    })

    expect(await screen.findByText('brief.xlsx')).toBeInTheDocument()

    const downloadLinks = await screen.findAllByRole('link', { name: 'Download' })
    const downloadHrefs = downloadLinks.map((link) => link.getAttribute('href') ?? '')
    const hasUploadDownloadLink = downloadHrefs.some((href) => /\/files\/upload-1$/.test(href))

    expect(hasUploadDownloadLink).toBe(true)

    await user.click(screen.getByRole('button', { name: /PDF Agent/i }))
    await user.click(screen.getByRole('button', { name: /Excel Analyst/i }))

    expect(await screen.findByText('brief.xlsx')).toBeInTheDocument()

    const downloadLinksAfterSwitch = await screen.findAllByRole('link', { name: 'Download' })
    const downloadHrefsAfterSwitch = downloadLinksAfterSwitch.map(
      (link) => link.getAttribute('href') ?? '',
    )
    const hasUploadDownloadLinkAfterSwitch = downloadHrefsAfterSwitch.some((href) =>
      /\/files\/upload-1$/.test(href),
    )

    expect(hasUploadDownloadLinkAfterSwitch).toBe(true)
  })

  it('does not render artifact-only updates while the run is still pending', async () => {
    const user = userEvent.setup()
    let resolvePoll

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
        }),
      }),
    )

    pollForChatCompletion.mockImplementation(async ({ onUpdate }) => {
      onUpdate(
        createPayload({
          pending: true,
          runStatus: createRunStatus({
            state: 'running',
            pending: true,
            label: 'Waiting for agent output',
          }),
          messages: [{ role: 'user', text: 'Build the report', timestamp: '2026-03-05T14:00:00.000Z' }],
          files: {
            newArtifacts: [
              {
                id: 'artifact-pending-1',
                name: 'report.xlsx',
                sizeBytes: 2048,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                downloadUrl: '/files/artifact-pending-1',
              },
            ],
          },
        }),
      )

      return await new Promise((resolve) => {
        resolvePoll = () =>
          resolve(
            createPayload({
              pending: false,
              runStatus: createRunStatus({
                state: 'completed',
                pending: false,
                label: 'Completed with files',
                artifactCount: 1,
              }),
              messages: [
                { role: 'user', text: 'Build the report', timestamp: '2026-03-05T14:00:00.000Z' },
                { role: 'assistant', text: 'Report complete.', timestamp: '2026-03-05T14:00:01.000Z' },
              ],
              files: {
                newArtifacts: [
                  {
                    id: 'artifact-pending-1',
                    name: 'report.xlsx',
                    sizeBytes: 2048,
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    downloadUrl: '/files/artifact-pending-1',
                  },
                ],
              },
            }),
          )
      })
    })

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Build the report')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Build the report')).toBeInTheDocument()
    expect(screen.queryByText('report.xlsx')).not.toBeInTheDocument()

    await act(async () => {
      resolvePoll()
    })

    expect((await screen.findAllByText('Report complete.')).length).toBeGreaterThan(0)
    expect(await screen.findByText('report.xlsx')).toBeInTheDocument()
  })

  it('keeps the run in pending state without injecting a timeout assistant message', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
        }),
      }),
    )

    pollForChatCompletion.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'running',
          pending: true,
          label: 'Waiting for agent output',
        }),
        messages: [],
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Need summary')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Need summary')).toBeInTheDocument()
    expect(await screen.findByText('Waiting for agent output')).toBeInTheDocument()
    expect(screen.queryByText(/still pending/i)).not.toBeInTheDocument()
  })

  it('keeps the run pending when assistant text is present but backend is still running', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
        }),
      }),
    )

    pollForChatCompletion.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'running',
          pending: true,
          label: 'Waiting for agent output',
        }),
        messages: [
          { role: 'user', text: 'Need summary', timestamp: '2026-03-05T12:10:00.000Z' },
          { role: 'assistant', text: 'Summary is ready.', timestamp: '2026-03-05T12:10:01.000Z' },
        ],
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Need summary')
    await user.click(screen.getByLabelText('Send message'))

    expect((await screen.findAllByText('Summary is ready.')).length).toBeGreaterThan(0)
    expect(screen.getByText('Waiting for agent output')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Excel Analyst/i })[0]).toHaveTextContent('Busy')
  })

  it('keeps earlier uploaded files visible after later non-file replies', async () => {
    const user = userEvent.setup()

    uploadFiles.mockResolvedValue({
      uploaded: [
        {
          id: 'upload-1',
          name: 'brief.xlsx',
          size: 14,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          downloadUrl: '/files/upload-1',
        },
      ],
    })

    postChat
      .mockResolvedValueOnce(
        createPayload({
          pending: false,
          runStatus: createRunStatus({
            state: 'completed',
            pending: false,
            label: 'Completed',
          }),
          messages: [
            { role: 'user', text: 'Analyze this workbook', timestamp: '2026-03-05T13:00:00.000Z' },
            { role: 'assistant', text: 'Workbook parsed.', timestamp: '2026-03-05T13:00:01.000Z' },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createPayload({
          pending: false,
          runStatus: createRunStatus({
            state: 'completed',
            pending: false,
            label: 'Completed',
          }),
          messages: [
            { role: 'user', text: 'Analyze this workbook', timestamp: '2026-03-05T13:00:00.000Z' },
            { role: 'assistant', text: 'Workbook parsed.', timestamp: '2026-03-05T13:00:01.000Z' },
            { role: 'user', text: 'Now summarize in 3 bullets', timestamp: '2026-03-05T13:01:00.000Z' },
            {
              role: 'assistant',
              text: 'Here are 3 bullets.',
              timestamp: '2026-03-05T13:01:01.000Z',
            },
          ],
        }),
      )

    const { container } = render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    const fileInput = container.querySelector('input[type="file"]')
    const workbook = new File(['a,b\n1,2'], 'brief.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    await user.upload(fileInput, workbook)
    await user.type(getComposerInput(), 'Analyze this workbook')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('brief.xlsx')).toBeInTheDocument()

    await user.type(getComposerInput(), 'Now summarize in 3 bullets')
    await user.click(screen.getByLabelText('Send message'))

    expect((await screen.findAllByText('Here are 3 bullets.')).length).toBeGreaterThan(0)
    expect(await screen.findByText('brief.xlsx')).toBeInTheDocument()

    const hasUploadDownloadLink = (await screen.findAllByRole('link', { name: 'Download' })).some(
      (link) => /\/files\/upload-1$/.test(link.getAttribute('href') ?? ''),
    )

    expect(hasUploadDownloadLink).toBe(true)
  })

  it('keeps the optimistic user message when the backend returns only a generated file', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: true,
        runStatus: createRunStatus({
          state: 'queued',
          pending: true,
          label: 'Queued',
        }),
      }),
    )

    pollForChatCompletion.mockResolvedValue(
      createPayload({
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
              id: 'artifact-2',
              name: 'board-deck.pptx',
              sizeBytes: 2048,
              mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              downloadUrl: '/files/artifact-2',
            },
          ],
        },
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Generate the deck')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Generate the deck')).toBeInTheDocument()
    expect(await screen.findByText('board-deck.pptx')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for agent output')).not.toBeInTheDocument()
  })

  it('keeps the user message visible when backend returns an assistant-only snapshot', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed',
        }),
        messages: [
          {
            role: 'assistant',
            text: 'Done. I updated the file.',
            timestamp: '2026-03-05T15:10:01.000Z',
          },
        ],
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Please update this file')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Please update this file')).toBeInTheDocument()
    expect((await screen.findAllByText('Done. I updated the file.')).length).toBeGreaterThan(0)

    const conversation = screen.getByLabelText('Excel Analyst conversation')
    const conversationText = conversation.textContent ?? ''
    const userIndex = conversationText.indexOf('Please update this file')
    const assistantIndex = conversationText.indexOf('Done. I updated the file.')

    expect(userIndex).toBeGreaterThanOrEqual(0)
    expect(assistantIndex).toBeGreaterThanOrEqual(0)
    expect(userIndex).toBeLessThan(assistantIndex)
  })

  it('opens a workbook preview with sheet tabs in the right-side panel', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => createWorkbookPreviewBuffer(),
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Build the workbook', timestamp: '2026-03-05T16:00:00.000Z' },
          { role: 'assistant', text: 'Workbook is ready.', timestamp: '2026-03-05T16:00:01.000Z' },
        ],
        files: {
          newArtifacts: [
            {
              id: 'artifact-preview-1',
              name: 'q1-forecast.xlsx',
              sizeBytes: 2048,
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              downloadUrl: '/files/artifact-preview-1',
            },
          ],
        },
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Build the workbook')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('q1-forecast.xlsx')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'q1-forecast.xlsx' })).toBeInTheDocument()
    expect(await screen.findByText('Revenue', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Forecast')).toBeInTheDocument()

    await user.click(screen.getByText('Forecast'))

    expect(await screen.findByText('Feb')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.golemforce.ai/files/artifact-preview-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('opens a PDF preview panel from an agent artifact', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Generate the PDF', timestamp: '2026-03-05T17:00:00.000Z' },
          { role: 'assistant', text: 'PDF is ready.', timestamp: '2026-03-05T17:00:01.000Z' },
        ],
        files: {
          newArtifacts: [
            {
              id: 'artifact-preview-pdf',
              name: 'board-summary.pdf',
              sizeBytes: 1024,
              mimeType: 'application/pdf',
              downloadUrl: '/files/artifact-preview-pdf',
            },
          ],
        },
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Generate the PDF')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('board-summary.pdf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'board-summary.pdf' })).toBeInTheDocument()
    expect(screen.getByTitle('board-summary.pdf preview')).toHaveAttribute(
      'src',
      'https://api.golemforce.ai/files/artifact-preview-pdf',
    )
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
  })

  it('accepts uploaded markdown files and previews them inline', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        '# Revenue Brief\n\n**Summary**\n- ARR expanded 18% year over year.\n1. Expand enterprise pipeline.',
    })

    uploadFiles.mockResolvedValue({
      uploaded: [
        {
          id: 'upload-md-1',
          name: 'briefing.md',
          size: 64,
          type: 'text/markdown',
          downloadUrl: '/files/upload-md-1',
        },
      ],
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed',
          hasUploads: true,
        }),
        messages: [
          {
            role: 'assistant',
            text: 'I reviewed the markdown notes.',
            timestamp: '2026-03-05T17:20:01.000Z',
          },
        ],
      }),
    )

    const { container } = render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    const fileInput = container.querySelector('input[type="file"]')
    const markdownFile = new File(['# Revenue Brief'], 'briefing.md', {
      type: 'text/markdown',
    })

    await user.upload(fileInput, markdownFile)
    await user.type(getComposerInput(), 'Review these markdown notes')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(uploadFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: 'Excel Analyst',
          files: [markdownFile],
        }),
      )
    })

    expect(await screen.findByText('briefing.md')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'briefing.md' })).toBeInTheDocument()
    expect(await screen.findByText('Revenue Brief')).toBeInTheDocument()
    expect(screen.getByText('ARR expanded 18% year over year.')).toBeInTheDocument()
    expect(screen.getByText('Expand enterprise pipeline.')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      '/files/upload-md-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('opens a returned markdown preview using artifact mime types', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        '# Revenue Brief\n\n**Summary**\n- ARR expanded 18% year over year.\n1. Expand enterprise pipeline.',
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Generate the markdown brief', timestamp: '2026-03-05T17:25:00.000Z' },
          { role: 'assistant', text: 'Markdown brief is ready.', timestamp: '2026-03-05T17:25:01.000Z' },
        ],
        files: {
          newArtifacts: [
            {
              id: 'artifact-preview-md',
              name: 'briefing',
              sizeBytes: 64,
              mimeType: 'text/markdown',
              downloadUrl: '/files/artifact-preview-md',
            },
          ],
        },
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Generate the markdown brief')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('briefing')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'briefing' })).toBeInTheDocument()
    expect(await screen.findByText('Revenue Brief')).toBeInTheDocument()
    expect(screen.getByText('ARR expanded 18% year over year.')).toBeInTheDocument()
    expect(screen.getByText('Expand enterprise pipeline.')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.golemforce.ai/files/artifact-preview-md',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('opens a Word document preview with extracted text in the right-side panel', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => createDocxPreviewBuffer(),
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Generate the plan doc', timestamp: '2026-03-05T17:30:00.000Z' },
          { role: 'assistant', text: 'The plan document is ready.', timestamp: '2026-03-05T17:30:01.000Z' },
        ],
        files: {
          newArtifacts: [
            {
              id: 'artifact-preview-docx',
              name: 'quarterly-plan.docx',
              sizeBytes: 4096,
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              downloadUrl: '/files/artifact-preview-docx',
            },
          ],
        },
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Generate the plan doc')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('quarterly-plan.docx')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'quarterly-plan.docx' })).toBeInTheDocument()
    expect((await screen.findAllByText('Quarterly Plan')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Revenue is up 14% year over year.').length).toBeGreaterThan(0)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.golemforce.ai/files/artifact-preview-docx',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('opens a presentation preview with slide tabs in the right-side panel', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => createPptxPreviewBuffer(),
    })

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Build the deck', timestamp: '2026-03-05T17:45:00.000Z' },
          { role: 'assistant', text: 'The deck is ready.', timestamp: '2026-03-05T17:45:01.000Z' },
        ],
        files: {
          newArtifacts: [
            {
              id: 'artifact-preview-pptx',
              name: 'board-deck.pptx',
              sizeBytes: 8192,
              mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              downloadUrl: '/files/artifact-preview-pptx',
            },
          ],
        },
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Build the deck')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('board-deck.pptx')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'board-deck.pptx' })).toBeInTheDocument()
    expect((await screen.findAllByText('Revenue Story')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Execution Plan').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ARR grew to 3.4M.').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: 'Execution Plan' }))

    expect((await screen.findAllByText('Expand enterprise pipeline.')).length).toBeGreaterThan(0)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.golemforce.ai/files/artifact-preview-pptx',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('renders a returned Word document when the backend attaches it directly to an assistant message', async () => {
    const user = userEvent.setup()

    postChat.mockResolvedValue(
      createPayload({
        pending: false,
        runStatus: createRunStatus({
          state: 'completed',
          pending: false,
          label: 'Completed with files',
          artifactCount: 1,
        }),
        messages: [
          { role: 'user', text: 'Create the proposal doc', timestamp: '2026-03-05T18:00:00.000Z' },
          {
            role: 'assistant',
            text: '',
            timestamp: '2026-03-05T18:00:01.000Z',
            file: {
              id: 'artifact-word-1',
              originalFilename: 'proposal.docx',
              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              downloadUrl: '/files/artifact-word-1',
            },
          },
        ],
      }),
    )

    render(<App />)
    await waitFor(() => expect(fetchChat).toHaveBeenCalledTimes(3))

    await user.type(getComposerInput(), 'Create the proposal doc')
    await user.click(screen.getByLabelText('Send message'))

    expect((await screen.findAllByText('proposal.docx')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://api.golemforce.ai/files/artifact-word-1',
    )
  })
})
