import { describe, expect, it } from 'vitest'
import { parseDocumentPreview, parsePresentationPreview } from './officePreview'

const DOCX_PREVIEW_FIXTURE =
  'UEsDBBQAAAAIABYGZlyn3//Y5QAAAGkBAAARAAAAd29yZC9kb2N1bWVudC54bWxNkEluxCAQRfd9ihJSljF2FEWRZdO7KMvOdABiV7otQYEA2+H2AZweVrwS//8auv2vVrCg85OhnjVVzQBpMONEx559fb7cPzPwQdIolSHsWUTP9mLXre1ohlkjBUgJ5Nu1Z6cQbMu5H06opa+MRUp/P8ZpGVLpjnw1brTODOh9aqAVf6jrJ67lREzsAFLqtxljxlLYjTY+OJGfjxAVwtouUvXsFWWetGFcdHzTXB1FH8TbLF1ApyIclKQsC0X8Ly2+m45X4zsuSDPC5GG20DzeQUTpwKRrFapusy4xGbYlMp2PJP4AUEsBAhQAFAAAAAgAFgZmXKff/9jlAAAAaQEAABEAAAAAAAAAAAAAAAAAAAAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAABAAEAPwAAABQBAAAAAA=='
const PPTX_PREVIEW_FIXTURE =
  'UEsDBBQAAAAIAFIGZlyB0XcdFgEAAFUCAAAVAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1spZDLToQwFIb38xRN91K8xBgCTHThzmQC4wNUegSS0jbtkRne3tMyxLgxGjftf25/v55yf540m8GH0ZqKX2c5Z2A6q0bTV/z1+Hz1wFlAaZTU1kDFFwh8X+9KVwStGA2bUMiKD4iuECJ0A0wyZNaBodq79ZNECn0vlJcnMp20uMnzezHJ0fDLvPvNvPMQwKBEAv1mUu8YI5yu1aqOWO7oAWIypYNbZQrM3LqDj11mXm83MFwc/QtH1MBFXYqtmETq/zLA85NVS13K4o3ug6d+WeiALS4aUuDiQdOywLqBGcwHsBatX0oRU/GM3qmRXrgYrrQUb7g/k2+Y/6J7bBrWezgxtOw2u3vJ/kK4qrTpKNPydylJ4hNQSwMEFAAAAAgAUgZmXLcAw7IyAQAAmgIAABUAAABwcHQvc2xpZGVzL3NsaWRlMi54bWylUsFOwzAMve8rotxZBgeEqraTkODEYdLGB5jWWyPS1Eq8sf49TroJgQZC2iV5dvxenuOUy2Pv1AFDtIOv9O18oRX6Zmit31X6dfN886BVZPAtuMFjpUeMelnPSiqia5WQfSyg0h0zFcbEpsMe4nwg9HK2HUIPLGHYmTbAh4j2ztwtFvemB+v1iU//4VPAiJ6Bxeg3kXqmlNhp1q6tky3aBMSUzOlIE8yBP6xpFVKVP0w7dYpHkr7YskNt6tKcDzPI9V8CfHwc2rEuoXiTfRWkHgoXec2jwxxQWoQNBddPR2z2ya9aOfClSbm0JvFcKVecFCe7Ep/9/m397PMqey+w902nCJp32MloVMCtPHI3v+D0Z2MkP0I+CmOgYCMqsoTOerzE/bXLCeVxJZgnOMtJAZ9QSwECFAAUAAAACABSBmZcgdF3HRYBAABVAgAAFQAAAAAAAAAAAAAAAAAAAAAAcHB0L3NsaWRlcy9zbGlkZTEueG1sUEsBAhQAFAAAAAgAUgZmXLcAw7IyAQAAmgIAABUAAAAAAAAAAAAAAAAASQEAAHBwdC9zbGlkZXMvc2xpZGUyLnhtbFBLBQYAAAAAAgACAIYAAACuAgAAAAA='
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
      blocks: ['ARR grew to 3.4M.'],
    })
    expect(preview.slides[1]).toMatchObject({
      index: 2,
      title: 'Execution Plan',
    })
  })
})
