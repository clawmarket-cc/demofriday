import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('App chat flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    fetchChat.mockResolvedValue(createPayload())
    clearChat.mockResolvedValue({ ok: true })
    uploadFiles.mockResolvedValue({ uploaded: [] })
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

    const hasUploadDownloadLink = (await screen.findAllByRole('link', { name: 'Download' })).some(
      (link) => /\/files\/upload-1$/.test(link.getAttribute('href') ?? ''),
    )

    expect(hasUploadDownloadLink).toBe(true)

    await user.click(screen.getByRole('button', { name: /PDF Agent/i }))
    await user.click(screen.getByRole('button', { name: /Excel Analyst/i }))

    expect(await screen.findByText('brief.xlsx')).toBeInTheDocument()

    const hasUploadDownloadLinkAfterSwitch = (
      await screen.findAllByRole('link', { name: 'Download' })
    ).some((link) => /\/files\/upload-1$/.test(link.getAttribute('href') ?? ''))

    expect(hasUploadDownloadLinkAfterSwitch).toBe(true)
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
})
