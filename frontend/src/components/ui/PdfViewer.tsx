import { useEffect, useRef, useState, useCallback } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PdfViewerProps {
  url: string
  className?: string
}

export function PdfViewer({ url, className = '' }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null)

  const renderAllPages = useCallback(async (pdf: PDFDocumentProxy) => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum)
        const containerWidth = container.clientWidth - 32
        const unscaledViewport = page.getViewport({ scale: 1 })
        const scale = containerWidth / unscaledViewport.width
        const viewport = page.getViewport({ scale })

        const pageDiv = document.createElement('div')
        pageDiv.style.marginBottom = '8px'
        pageDiv.style.display = 'flex'
        pageDiv.style.justifyContent = 'center'

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) continue

        const pixelRatio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        context.scale(pixelRatio, pixelRatio)

        pageDiv.appendChild(canvas)
        container.appendChild(pageDiv)

        await page.render({
          canvasContext: context,
          viewport: viewport,
        } as any).promise
      } catch (err) {
        console.error(`Error rendering page ${pageNum}:`, err)
      }
    }
  }, [])

  const loadPdf = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy()
        pdfDocRef.current = null
      }

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)

      const loadingTask = getDocument({ data })
      const pdf = await loadingTask.promise

      pdfDocRef.current = pdf
      setNumPages(pdf.numPages)
      setLoading(false)

      await renderAllPages(pdf)
    } catch (err) {
      console.error('PDF load error:', err)
      setError('Failed to load PDF document')
      setLoading(false)
    }
  }, [url, renderAllPages])

  useEffect(() => {
    const doLoad = async () => {
      await loadPdf()
    }
    doLoad()

    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy()
        pdfDocRef.current = null
      }
    }
  }, [loadPdf])

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>
    const handleResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (pdfDocRef.current) {
          renderAllPages(pdfDocRef.current)
        }
      }, 200)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      clearTimeout(resizeTimer)
      resizeObserver.disconnect()
    }
  }, [renderAllPages])

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-center p-8">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={loadPdf}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative h-full ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-grey-800/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-grey-400 border-t-white rounded-full animate-spin" />
            <p className="text-xs text-grey-400">Loading PDF...</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full overflow-y-auto p-4"
        style={{ background: '#525659' }}
      />
      {numPages > 0 && (
        <div className="absolute bottom-2 right-4 bg-grey-900/80 text-grey-400 text-xs px-2 py-1 rounded">
          {numPages} page{numPages !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
