import { describe, expect, it } from 'vitest'
import { parseDocumentPreview, parsePresentationPreview } from './officePreview'

const DOCX_PREVIEW_FIXTURE =
  'UEsDBBQAAAAIABYGZlyn3//Y5QAAAGkBAAARAAAAd29yZC9kb2N1bWVudC54bWxNkEluxCAQRfd9ihJSljF2FEWRZdO7KMvOdABiV7otQYEA2+H2AZweVrwS//8auv2vVrCg85OhnjVVzQBpMONEx559fb7cPzPwQdIolSHsWUTP9mLXre1ohlkjBUgJ5Nu1Z6cQbMu5H06opa+MRUp/P8ZpGVLpjnw1brTODOh9aqAVf6jrJ67lREzsAFLqtxljxlLYjTY+OJGfjxAVwtouUvXsFWWetGFcdHzTXB1FH8TbLF1ApyIclKQsC0X8Ly2+m45X4zsuSDPC5GG20DzeQUTpwKRrFapusy4xGbYlMp2PJP4AUEsBAhQAFAAAAAgAFgZmXKff/9jlAAAAaQEAABEAAAAAAAAAAAAAAAAAAAAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAABAAEAPwAAABQBAAAAAA=='
const PPTX_PREVIEW_FIXTURE =
  'UEsDBBQAAAAIAH0GZlxY2oehNQEAAAwDAAAVAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1stVLLTsMwELz3KyxLHInLU1WUpIIDnJCqpnyAqZc0kl+yl7T5e+ykUWiRApde7Jmxd3bHcrY8KEkacL42Oqc3yZwS0Fsjal3l9H3zcr2gxCPXgkujIacteLosZplNvRQkFGuf8pzuEG3KmN/uQHGfGAs6nH0apzgG6iomHN8HUyXZ7Xz+yBSvNT3W2//UWwceNHIMg56YFDNCwjjbUooIO+LtxgH09CgMpKO6Ke3KFR3qd7sj2NoQEGuUQFmRseGwA939nxZ4eDaiHaUg8vQjSCvHzlTpscRWwrlui7CEBjzFYg0N6C8gJRrXZixKcY3t48Wxc5jmtHVUxnh/ZR2CXTrP03pNKgd7gobcJfdvyUSmX8WvznhPFHdVrUmtrDMNiOj0sLiaMpp+nB4PHyOy/s90egDfUEsDBBQAAAAIAH0GZlzb0/0sNgEAABMDAAAVAAAAcHB0L3NsaWRlcy9zbGlkZTIueG1stVLLTsMwELzzFZbv1IUDQlGSSkhw4lCp5QOWZNtYOM7K3pbm71knjUorVLhwsWfG3sfYmy8OrVN7DNF2vtB3s7lW6Kuutn5b6Lf1y+2jVpHB1+A6j4XuMepFeZNTFl2tJNjHDArdMFNmTKwabCHOOkIvZ5sutMBCw9bUAT4laevM/Xz+YFqwXh/j6S/xFDCiZ2Bp9CxJeaOUtFOtXJ3gQCKtA+JIj8JEBur3K1qGckDjTo3insQgW3aoTZmb6XAAw/3vKfjw1NX9SRIRsneRlsFcqC7yinuHlzqVskgByLh8PmC1S97U0oHPTdLSmuqnm6fS0s557aSc/P1mdnL234ZeYeerRhFUH7CVj1cBN/KFzeyKtx9ehWT0ZCIZAwUbUZEldNbjtTTXn2jE03wkNo7OoAv4AlBLAQIUABQAAAAIAH0GZlxY2oehNQEAAAwDAAAVAAAAAAAAAAAAAAAAAAAAAABwcHQvc2xpZGVzL3NsaWRlMS54bWxQSwECFAAUAAAACAB9BmZc29P9LDYBAAATAwAAFQAAAAAAAAAAAAAAAABoAQAAcHB0L3NsaWRlcy9zbGlkZTIueG1sUEsFBgAAAAACAAIAhgAAANECAAAAAA=='
const decodeBase64ToArrayBuffer = (value) => Uint8Array.from(Buffer.from(value, 'base64')).buffer

const createDocxBuffer = () => decodeBase64ToArrayBuffer(DOCX_PREVIEW_FIXTURE)

const createPptxBuffer = () => decodeBase64ToArrayBuffer(PPTX_PREVIEW_FIXTURE)

describe('officePreview', () => {
  it('extracts structured text from docx files', () => {
    const preview = parseDocumentPreview(createDocxBuffer())

    expect(preview.blocks).toHaveLength(2)
    expect(preview.blocks[0]).toMatchObject({
      kind: 'heading',
      text: 'Quarterly Plan',
    })
    expect(preview.blocks[1]).toMatchObject({
      kind: 'paragraph',
      text: 'Revenue is up 14% year over year.',
    })
  })

  it('extracts slides from pptx files', () => {
    const preview = parsePresentationPreview(createPptxBuffer())

    expect(preview.slides).toHaveLength(2)
    expect(preview.slides[0]).toMatchObject({
      index: 1,
      title: 'Revenue Story',
      blocks: ['ARR grew to 3.4M.', 'Gross margin improved to 58%.'],
    })
    expect(preview.slides[1]).toMatchObject({
      index: 2,
      title: 'Execution Plan',
      blocks: ['Launch packaging refresh.', 'Expand enterprise pipeline.'],
    })
  })
})
