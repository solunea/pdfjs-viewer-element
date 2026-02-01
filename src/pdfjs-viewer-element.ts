import { elementReady } from './elementReady'
import { debounce } from 'perfect-debounce'

const DEFAULTS = {
  viewerPath: '/pdfjs',
  viewerEntry: '/web/viewer.html',
  src: '',
  iframeTitle: 'PDF viewer window',
  page: '',
  search: '',
  phrase: '',
  zoom: '',
  pagemode: 'none',
  locale: '',
  disableWorker: '',
  textLayer: '',
  disableFontFace: '',
  disableRange: '',
  disableStream: '',
  disableAutoFetch: '',
  verbosity: '',
  viewerCssTheme: 'AUTOMATIC',
  viewerExtraStyles: '',
  viewerExtraStylesUrls: '',
  nameddest: ''
} as const

export const ViewerCssTheme = {
  AUTOMATIC: 0, // Default value.
  LIGHT: 1,
  DARK: 2,
} as const

export const hardRefreshAttributes = [
  'src', 'viewer-path', 
  'disable-worker', 'text-layer', 'disable-font-face', 'disable-range', 'disable-stream', 'disable-auto-fetch', 'verbosity', 'locale',
  'viewer-css-theme', 'viewer-extra-styles', 'viewer-extra-styles-urls'
]

export class PdfjsViewerElement extends HTMLElement {
  constructor() {
    super()
    const shadowRoot = this.attachShadow({ mode: 'open' })
    const template = document.createElement('template')

    template.innerHTML = `
      <style>
        :host{width:100%;display:block;overflow:hidden;position:relative}
        :host iframe{height:100%;position:relative;z-index:0}
        #hotspots-overlay{position:absolute;inset:0;z-index:1;pointer-events:none}
        ::slotted(.hotspots){position:absolute;inset:0;pointer-events:auto}
      </style>
      <iframe frameborder="0" width="100%" loading="lazy" title="${this.getAttribute('iframe-title') || DEFAULTS.iframeTitle}"></iframe>
      <div id="hotspots-overlay"><slot name="hotspots"></slot></div>
    `
    shadowRoot.appendChild(template.content.cloneNode(true))
  }

  public iframe!: PdfjsViewerElementIframe

  private hotspotsEl: HTMLElement | null = null
  private hotspotsIframeDoc: Document | null = null
  private hotspotsScrollEl: HTMLElement | Document | null = null
  private hotspotsBaseTransform: string | null = null
  private hotspotsRaf = 0
  private hotspotsRetryTimer: number | null = null
  private hotspotsHostPrevDisplay: string | null = null
  private hotspotsIframeEnabled = false
  private hotspotsIframeClickBound = false
  private hotspotsHostObserver: MutationObserver | null = null
  private readonly onHotspotsSlotChange = () => this.setupPdfHotspotsAnchoring()
  private readonly onIframeLoadForHotspots = () => this.setupPdfHotspotsAnchoring()

  private readonly onHotspotsScroll = () => {
    if (this.hotspotsRaf) cancelAnimationFrame(this.hotspotsRaf)
    this.hotspotsRaf = requestAnimationFrame(() => {
      this.hotspotsRaf = 0
      this.updatePdfHotspotsAnchoring()
    })
  }

  static get observedAttributes() {
    return [
      'src', 'viewer-path', 'page', 'search', 'phrase', 'zoom', 'pagemode', 
      'disable-worker', 'text-layer', 'disable-font-face', 'disable-range', 'disable-stream', 'disable-auto-fetch', 'verbosity', 'locale',
      'viewer-css-theme', 'viewer-extra-styles', 'viewer-extra-styles-urls', 'nameddest', 'iframe-title'
    ]
  }

  connectedCallback() {
    this.iframe = this.shadowRoot?.querySelector('iframe') as PdfjsViewerElementIframe

    const slot = this.shadowRoot?.querySelector('slot[name="hotspots"]') as HTMLSlotElement | null
    slot?.addEventListener('slotchange', this.onHotspotsSlotChange)
    this.iframe?.addEventListener('load', this.onIframeLoadForHotspots)
    this.setupPdfHotspotsAnchoring()

    document.addEventListener('webviewerloaded', async () => {
      this.setCssTheme(this.getCssThemeOption())
      this.injectExtraStylesLinks(this.getAttribute('viewer-extra-styles-urls') ?? DEFAULTS.viewerExtraStylesUrls)
      this.setViewerExtraStyles(this.getAttribute('viewer-extra-styles') ?? DEFAULTS.viewerExtraStyles)
      if (this.getAttribute('src') !== DEFAULTS.src) this.iframe.contentWindow?.PDFViewerApplicationOptions?.set('defaultUrl', '')

      this.iframe.contentWindow?.PDFViewerApplicationOptions?.set('disablePreferences', true)
      this.iframe.contentWindow?.PDFViewerApplicationOptions?.set('pdfBugEnabled', true)
      this.iframe.contentWindow?.PDFViewerApplicationOptions?.set('eventBusDispatchToDOM', true)
    })
  }

  disconnectedCallback() {
    const slot = this.shadowRoot?.querySelector('slot[name="hotspots"]') as HTMLSlotElement | null
    slot?.removeEventListener('slotchange', this.onHotspotsSlotChange)
    this.iframe?.removeEventListener('load', this.onIframeLoadForHotspots)
    this.teardownPdfHotspotsAnchoring()
  }

  attributeChangedCallback(name: string) {
    if (!hardRefreshAttributes.includes(name)) {
      this.onIframeReady(() => {
        this.iframe.src = this.getIframeSrc()
      })
      return
    }
    this.onIframeReady(() => this.mountViewer(this.getIframeSrc()))
  }

  private onIframeReady = debounce(async (callback: () => void) => {
    await elementReady('iframe', this.shadowRoot!)
    callback()
  }, 0, { leading: true })

  private getIframeSrc() {
    const src = this.getFullPath(this.getAttribute('src') || DEFAULTS.src)
    const viewerPath = this.getFullPath(this.getAttribute('viewer-path') || DEFAULTS.viewerPath)
    const page = this.getAttribute('page') || DEFAULTS.page
    const search = this.getAttribute('search') || DEFAULTS.search
    const phrase = this.getAttribute('phrase') || DEFAULTS.phrase
    const zoom = this.getAttribute('zoom') || DEFAULTS.zoom
    const pagemode = this.getAttribute('pagemode') || DEFAULTS.pagemode

    const disableWorker = this.getAttribute('disable-worker') || DEFAULTS.disableWorker
    const textLayer = this.getAttribute('text-layer') || DEFAULTS.textLayer
    const disableFontFace = this.getAttribute('disable-font-face') || DEFAULTS.disableFontFace
    const disableRange = this.getAttribute('disable-range') || DEFAULTS.disableRange
    const disableStream = this.getAttribute('disable-stream') || DEFAULTS.disableStream
    const disableAutoFetch = this.getAttribute('disable-auto-fetch') || DEFAULTS.disableAutoFetch
    const verbosity = this.getAttribute('verbosity') || DEFAULTS.verbosity
    const locale = this.getAttribute('locale') || DEFAULTS.locale

    const viewerCssTheme = this.getAttribute('viewer-css-theme') || DEFAULTS.viewerCssTheme
    const viewerExtraStyles = Boolean(this.getAttribute('viewer-extra-styles') || DEFAULTS.viewerExtraStyles)
    const nameddest = this.getAttribute('nameddest') || DEFAULTS.nameddest

    return `
${viewerPath}${DEFAULTS.viewerEntry}?file=
${encodeURIComponent(src)}#page=${page}&zoom=${zoom}&pagemode=${pagemode}&search=${search}&phrase=${phrase}&textLayer=
${textLayer}&disableWorker=
${disableWorker}&disableFontFace=
${disableFontFace}&disableRange=
${disableRange}&disableStream=
${disableStream}&disableAutoFetch=
${disableAutoFetch}&verbosity=
${verbosity}
${locale ? '&locale='+locale : ''}&viewerCssTheme=
${viewerCssTheme}&viewerExtraStyles=
${viewerExtraStyles}
${nameddest ? '&nameddest=' + nameddest : ''}`
  }

  private mountViewer(src: string) {
    if (!src || !this.iframe) return
    this.shadowRoot?.replaceChild(this.iframe.cloneNode(), this.iframe)
    this.iframe = this.shadowRoot?.querySelector('iframe') as PdfjsViewerElementIframe
    this.iframe.src = src
    this.iframe.setAttribute('title', this.getAttribute('iframe-title') || DEFAULTS.iframeTitle)
    this.iframe?.addEventListener('load', this.onIframeLoadForHotspots)
    this.setupPdfHotspotsAnchoring()
  }

  private getHotspotsElement() {
    const el = this.querySelector('.hotspots') as HTMLElement | null
    if (!el) return null

    if (!el.getAttribute('slot')) {
      el.setAttribute('slot', 'hotspots')
    }

    return el
  }

  private resolveHotspotsScrollEl() {
    this.hotspotsIframeDoc = null

    const root = this.shadowRoot || this
    const iframe = (this.iframe || root.querySelector('iframe')) as PdfjsViewerElementIframe | null
    if (!iframe) return null

    try {
      this.hotspotsIframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document) || null
    } catch {
      this.hotspotsIframeDoc = null
    }

    const doc = this.hotspotsIframeDoc
    if (!doc || typeof doc.querySelector !== 'function') return null

    const vc = (doc.querySelector('#viewerContainer') || doc.querySelector('.viewerContainer')) as HTMLElement | null
    if (vc) return vc

    return doc
  }

  private attachHotspotsToScrollEl(scrollEl: HTMLElement | Document) {
    if (scrollEl === this.hotspotsScrollEl) return

    this.detachHotspotsFromScrollEl()
    this.hotspotsScrollEl = scrollEl

    if ((scrollEl as Document).nodeType === 9) {
      scrollEl.addEventListener('scroll', this.onHotspotsScroll, true)
      return
    }

    try {
      ;(scrollEl as HTMLElement).addEventListener('scroll', this.onHotspotsScroll, { passive: true })
    } catch {
      ;(scrollEl as HTMLElement).addEventListener('scroll', this.onHotspotsScroll, true)
    }
  }

  private detachHotspotsFromScrollEl() {
    const scrollEl = this.hotspotsScrollEl
    if (!scrollEl) return

    if ((scrollEl as Document).nodeType === 9) {
      scrollEl.removeEventListener('scroll', this.onHotspotsScroll, true)
    } else {
      ;(scrollEl as HTMLElement).removeEventListener('scroll', this.onHotspotsScroll)
    }

    this.hotspotsScrollEl = null
  }

  private getHotspotsScrollOffsets() {
    const scrollEl = this.hotspotsScrollEl
    const doc = this.hotspotsIframeDoc

    if (doc && typeof doc.querySelector === 'function') {
      const vc = (doc.querySelector('#viewerContainer') || doc.querySelector('.viewerContainer')) as HTMLElement | null
      if (vc && typeof vc.scrollTop === 'number') {
        return { top: vc.scrollTop || 0, left: vc.scrollLeft || 0 }
      }

      const se = doc.scrollingElement || doc.documentElement || doc.body
      if (se && typeof (se as any).scrollTop === 'number') {
        return { top: (se as any).scrollTop || 0, left: (se as any).scrollLeft || 0 }
      }
    }

    if (scrollEl && (scrollEl as any).nodeType !== 9 && typeof (scrollEl as any).scrollTop === 'number') {
      return { top: (scrollEl as any).scrollTop || 0, left: (scrollEl as any).scrollLeft || 0 }
    }

    return { top: 0, left: 0 }
  }

  private computeHotspotsBaseTransform() {
    if (this.hotspotsBaseTransform !== null) return

    const hotspotsEl = this.hotspotsEl
    if (!hotspotsEl) return

    const isConnected = typeof hotspotsEl.isConnected === 'boolean'
      ? hotspotsEl.isConnected
      : !!(document.documentElement && document.documentElement.contains(hotspotsEl))
    if (!isConnected) return

    try {
      const t = String(getComputedStyle(hotspotsEl).transform || '').trim()
      this.hotspotsBaseTransform = (t && t !== 'none') ? t : ''
    } catch {
      this.hotspotsBaseTransform = ''
    }
  }

  private updatePdfHotspotsAnchoring() {
    const hotspotsEl = this.hotspotsEl
    if (!hotspotsEl) return

    if (this.hotspotsIframeEnabled) return

    this.computeHotspotsBaseTransform()
    if (this.hotspotsBaseTransform === null) return

    const off = this.getHotspotsScrollOffsets()
    const st = off.top
    const sl = off.left
    hotspotsEl.style.transform = (this.hotspotsBaseTransform ? (this.hotspotsBaseTransform + ' ') : '') + `translate(${-sl}px, ${-st}px)`

    const $any = (window as any).$
    if (typeof $any === 'function') {
      const open = hotspotsEl.querySelectorAll('.hotspot[aria-describedby]')
      open.forEach((h) => {
        const pop = $any(h).data('bs.popover')
        if (pop && typeof pop.update === 'function') {
          pop.update()
        } else if (pop && pop._popper) {
          pop._popper.scheduleUpdate()
        }
      })
    }
  }

  private setupPdfHotspotsAnchoring() {
    const hotspotsEl = this.getHotspotsElement()
    if (!hotspotsEl) {
      this.teardownPdfHotspotsAnchoring()
      return
    }

    this.hotspotsEl = hotspotsEl
    this.hotspotsBaseTransform = null

    if (this.hotspotsRetryTimer) {
      clearInterval(this.hotspotsRetryTimer)
      this.hotspotsRetryTimer = null
    }

    const retry = () => {
      const iframeReady = this.trySetupHotspotsInIframe()
      if (iframeReady) {
        if (this.hotspotsRetryTimer) {
          clearInterval(this.hotspotsRetryTimer)
          this.hotspotsRetryTimer = null
        }
        return
      }

      if (this.hotspotsIframeEnabled) {
        this.teardownHotspotsInIframe()
      }

      const next = this.resolveHotspotsScrollEl()
      if (next) this.attachHotspotsToScrollEl(next)
      this.updatePdfHotspotsAnchoring()
    }

    this.hotspotsRetryTimer = window.setInterval(retry, 250)
    setTimeout(() => {
      if (this.hotspotsRetryTimer) {
        clearInterval(this.hotspotsRetryTimer)
        this.hotspotsRetryTimer = null
      }
    }, 30000)

    retry()
  }

  private teardownPdfHotspotsAnchoring() {
    if (this.hotspotsRaf) {
      cancelAnimationFrame(this.hotspotsRaf)
      this.hotspotsRaf = 0
    }

    if (this.hotspotsRetryTimer) {
      clearInterval(this.hotspotsRetryTimer)
      this.hotspotsRetryTimer = null
    }

    this.teardownHotspotsInIframe()

    this.detachHotspotsFromScrollEl()
    this.hotspotsEl = null
    this.hotspotsIframeDoc = null
    this.hotspotsBaseTransform = null
  }

  private getHotspotKey(el: Element) {
    return (el.getAttribute('slot') || el.getAttribute('id') || el.getAttribute('data-hotspot-id') || '').trim()
  }

  private hideHostHotspots() {
    const el = this.hotspotsEl
    if (!el) return

    if (this.hotspotsHostPrevDisplay === null) {
      this.hotspotsHostPrevDisplay = el.style.display
    }

    el.style.display = 'none'
  }

  private showHostHotspots() {
    const el = this.hotspotsEl
    if (!el) return
    if (this.hotspotsHostPrevDisplay === null) return

    el.style.display = this.hotspotsHostPrevDisplay
    this.hotspotsHostPrevDisplay = null
  }

  private ensureIframeHotspotsStyle(doc: Document) {
    const existing = doc.getElementById('pdfjs-viewer-element-hotspots-style') as HTMLStyleElement | null
    if (existing) return

    const style = doc.createElement('style')
    style.id = 'pdfjs-viewer-element-hotspots-style'
    style.textContent = [
      '.pdfjs-viewer-element-hotspots-layer{position:absolute;inset:0;z-index:9999;pointer-events:none}',
      '.pdfjs-viewer-element-hotspots-layer .hotspots{position:absolute;inset:0;pointer-events:none}',
      '.pdfjs-viewer-element-hotspots-layer .hotspots .hotspot{pointer-events:auto}',
    ].join('')
    doc.head.appendChild(style)
  }

  private clearIframeHotspotsLayers(doc: Document) {
    doc.querySelectorAll('.pdfjs-viewer-element-hotspots-layer').forEach((el) => el.remove())
  }

  private syncHotspotsToIframe(doc: Document) {
    const hotspotsEl = this.hotspotsEl
    if (!hotspotsEl) return false

    const pages = Array.from(doc.querySelectorAll('.page[data-page-number]')) as HTMLElement[]
    if (!pages.length) return false

    const hotspotNodes = Array.from(hotspotsEl.querySelectorAll('.hotspot')) as HTMLElement[]
    if (!hotspotNodes.length) return true

    let containerPage = (hotspotsEl.getAttribute('data-page') || '').trim()
    if (!containerPage) containerPage = '1'

    const needsPerPage = hotspotNodes.some((n) => {
      const p = (n.getAttribute('data-page') || n.getAttribute('data-page-number') || (n as any).dataset?.page || '').toString().trim()
      return !!p
    })

    const layersByPage = new Map<string, HTMLElement>()

    const getLayerForPage = (pageNumber: string) => {
      const n = (pageNumber || '1').trim() || '1'
      const cached = layersByPage.get(n)
      if (cached) return cached

      const pageEl = (doc.querySelector(`.page[data-page-number="${CSS.escape(n)}"]`) || pages[0]) as HTMLElement
      let layer = pageEl.querySelector(':scope > .pdfjs-viewer-element-hotspots-layer') as HTMLElement | null
      if (!layer) {
        if (getComputedStyle(pageEl).position === 'static') {
          pageEl.style.position = 'relative'
        }
        layer = doc.createElement('div')
        layer.className = 'pdfjs-viewer-element-hotspots-layer'
        pageEl.appendChild(layer)
      }

      layer.innerHTML = ''
      layersByPage.set(n, layer)
      return layer
    }

    if (!needsPerPage) {
      getLayerForPage(containerPage)
    }

    hotspotNodes.forEach((node) => {
      const key = this.getHotspotKey(node)
      const p = needsPerPage
        ? (node.getAttribute('data-page') || node.getAttribute('data-page-number') || (node as any).dataset?.page || '').toString().trim() || containerPage
        : containerPage

      const layer = getLayerForPage(p)
      let hotspotsContainer = layer.querySelector(':scope > .hotspots') as HTMLElement | null
      if (!hotspotsContainer) {
        hotspotsContainer = doc.createElement('div')
        hotspotsContainer.className = 'hotspots'
        layer.appendChild(hotspotsContainer)
      }

      const clone = node.cloneNode(true) as HTMLElement
      if (key) clone.setAttribute('data-pdfjs-viewer-element-hotspot-key', key)
      hotspotsContainer.appendChild(clone)
    })

    return true
  }

  private bindIframeHotspotsClick(doc: Document) {
    if (this.hotspotsIframeClickBound) return

    const onClick = (ev: Event) => {
      const target = ev.target as Element | null
      if (!target) return
      const hotspot = target.closest('.pdfjs-viewer-element-hotspots-layer .hotspot') as HTMLElement | null
      if (!hotspot) return

      const key = (hotspot.getAttribute('data-pdfjs-viewer-element-hotspot-key') || this.getHotspotKey(hotspot)).trim()
      if (!key) return

      const hostHotspotsEl = this.hotspotsEl
      const orig = hostHotspotsEl?.querySelector(`.hotspot[slot="${CSS.escape(key)}"], .hotspot#${CSS.escape(key)}, .hotspot[data-hotspot-id="${CSS.escape(key)}"]`) as HTMLElement | null
      if (orig && typeof (orig as any).click === 'function') {
        ;(orig as any).click()
      }

      this.dispatchEvent(new CustomEvent('hotspot-click', { detail: { key }, bubbles: true, composed: true }))
    }

    doc.addEventListener('click', onClick)
    ;(doc as any).__pdfjsViewerElementHotspotsClick = onClick
    this.hotspotsIframeClickBound = true
  }

  private bindHostHotspotsObserver() {
    const hotspotsEl = this.hotspotsEl
    if (!hotspotsEl) return
    if (this.hotspotsHostObserver) return

    this.hotspotsHostObserver = new MutationObserver(() => {
      if (!this.hotspotsIframeEnabled) return
      const doc = this.hotspotsIframeDoc
      if (!doc) return
      this.clearIframeHotspotsLayers(doc)
      this.syncHotspotsToIframe(doc)
    })

    this.hotspotsHostObserver.observe(hotspotsEl, { attributes: true, childList: true, subtree: true })
  }

  private trySetupHotspotsInIframe() {
    const iframe = this.iframe
    if (!iframe) return false

    let doc: Document | null = null
    try {
      doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document) || null
    } catch {
      doc = null
    }
    if (!doc || !doc.documentElement) return false

    this.hotspotsIframeDoc = doc

    this.ensureIframeHotspotsStyle(doc)
    this.clearIframeHotspotsLayers(doc)
    const ok = this.syncHotspotsToIframe(doc)
    if (!ok) return false

    this.detachHotspotsFromScrollEl()
    this.hotspotsBaseTransform = null

    this.hotspotsIframeEnabled = true
    this.hideHostHotspots()
    this.bindHostHotspotsObserver()
    this.bindIframeHotspotsClick(doc)
    return true
  }

  private teardownHotspotsInIframe() {
    if (!this.hotspotsIframeEnabled && !this.hotspotsHostObserver && !this.hotspotsIframeDoc) {
      return
    }

    const doc = this.hotspotsIframeDoc
    if (doc) {
      const onClick = (doc as any).__pdfjsViewerElementHotspotsClick
      if (typeof onClick === 'function') {
        doc.removeEventListener('click', onClick)
      }
      ;(doc as any).__pdfjsViewerElementHotspotsClick = null
      this.clearIframeHotspotsLayers(doc)
    }

    if (this.hotspotsHostObserver) {
      this.hotspotsHostObserver.disconnect()
      this.hotspotsHostObserver = null
    }

    this.hotspotsIframeClickBound = false
    this.hotspotsIframeEnabled = false
    this.showHostHotspots()
  }

  private getFullPath(path: string) {
    return path.startsWith('/') ? `${window.location.origin}${path}` : path
  }

  private getCssThemeOption() {
    const attrValue = this.getAttribute('viewer-css-theme') as keyof typeof ViewerCssTheme
    return Object.keys(ViewerCssTheme).includes(attrValue) 
      ? ViewerCssTheme[attrValue] 
      : ViewerCssTheme[DEFAULTS.viewerCssTheme]
  }

  private setCssTheme(theme: 0 | 1 | 2) {
    if (theme === ViewerCssTheme.DARK) {
      if (!this.iframe.contentDocument?.styleSheets.length) return
      for (const styleSheet of Array.from(this.iframe.contentDocument.styleSheets)) {
        if (styleSheet.href?.includes('/web/viewer.css')) {
          const cssRules = styleSheet?.cssRules || []
          const rules = Object.keys(cssRules)
            .filter((key) => (cssRules[Number(key)] as CSSMediaRule)?.conditionText === "(prefers-color-scheme: dark)")
            .map((key) => {
              const rule = cssRules[Number(key)]
              return rule.cssText.split('@media (prefers-color-scheme: dark) {\n')[1].split('\n}')[0]
            })
          this.setViewerExtraStyles(rules.join(''), 'theme')
        }
      }
    }
    else {
      this.iframe.contentDocument?.head.querySelector('style[theme]')?.remove()
    }
    this.iframe.contentWindow?.PDFViewerApplicationOptions?.set('viewerCssTheme', theme)
  }

  private setViewerExtraStyles = (styles?: string | null, id = 'extra') => {
    if (!styles) {
      this.iframe.contentDocument?.head.querySelector(`style[${id}]`)?.remove()
      return
    }
    if (this.iframe.contentDocument?.head.querySelector(`style[${id}]`)?.innerHTML === styles) return
    const style = document.createElement('style')
    style.innerHTML = styles
    style.setAttribute(id, '')
    this.iframe.contentDocument?.head.appendChild(style)
  }

  private injectExtraStylesLinks = (rawLinks?: string) => {
    if (!rawLinks) return
    const linksArray = rawLinks.replace(/'|]|\[/g, '').split(',').map((link) => link.trim())
    linksArray.forEach((url) => {
      const linkExists = this.iframe.contentDocument?.head.querySelector(`link[href="${url}"]`);
      if (linkExists) return
      const linkEl = document.createElement('link')
      linkEl.rel = 'stylesheet'
      linkEl.href = url
      this.iframe.contentDocument?.head.appendChild(linkEl)
    })
  }

  public initialize = (): Promise<PdfjsViewerElementIframeWindow['PDFViewerApplication']> => new Promise(async (resolve) => {
    await elementReady('iframe', this.shadowRoot as ShadowRoot)
    this.iframe?.addEventListener('load', async () => {
      await this.iframe.contentWindow?.PDFViewerApplication?.initializedPromise
      resolve(this.iframe.contentWindow?.PDFViewerApplication)
    }, { once: true })
  })
}

declare global {
  interface Window {
    PdfjsViewerElement: typeof PdfjsViewerElement
  }
}

export interface IPdfjsViewerElement extends HTMLElement {
  initialize: () => Promise<PdfjsViewerElementIframeWindow['PDFViewerApplication']>
}

export interface PdfjsViewerElementIframeWindow extends Window {
  PDFViewerApplication: {
    initializedPromise: Promise<void>;
    initialized: boolean;
    eventBus: Record<string, any>;
    open: (data: Uint8Array) => void;
  },
  PDFViewerApplicationOptions: {
    set: (name: string, value: string | boolean | number) => void,
    getAll: () => Record<string, any>
  }
}

export interface PdfjsViewerElementIframe extends HTMLIFrameElement {
  contentWindow: PdfjsViewerElementIframeWindow
}

export default PdfjsViewerElement

if (!window.customElements.get('pdfjs-viewer-element')) {
  window.PdfjsViewerElement = PdfjsViewerElement
  window.customElements.define('pdfjs-viewer-element', PdfjsViewerElement)
}