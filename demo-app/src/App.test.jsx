import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
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

  it('hides the waiting indicator once the latest turn has an assistant reply', async () => {
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
    expect(screen.queryByText('Waiting for agent output')).not.toBeInTheDocument()

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
