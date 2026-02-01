export declare const ViewerCssTheme: {
    readonly AUTOMATIC: 0;
    readonly LIGHT: 1;
    readonly DARK: 2;
};
export declare const hardRefreshAttributes: string[];
export type PdfjsViewerElementHotspotClickMode = 'in-iframe' | 'overlay';
export interface PdfjsViewerElementHotspotClickRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
export interface PdfjsViewerElementHotspotClickDetail {
    key: string;
    pageNumber?: string | number;
    rect?: PdfjsViewerElementHotspotClickRect | null;
    clientX?: number | null;
    clientY?: number | null;
    source?: 'iframe' | 'overlay';
    mode: PdfjsViewerElementHotspotClickMode;
}
export declare class PdfjsViewerElement extends HTMLElement {
    constructor();
    iframe: PdfjsViewerElementIframe;
    private hotspotsEl;
    private hotspotsIframeDoc;
    private hotspotsScrollEl;
    private hotspotsBaseTransform;
    private hotspotsRaf;
    private hotspotsRetryTimer;
    private hotspotsHostPrevDisplay;
    private hotspotsIframeEnabled;
    private hotspotsIframeClickBound;
    private hotspotsHostClickBound;
    private hotspotsHostClickEl;
    private hotspotsHostObserver;
    private readonly onHotspotsSlotChange;
    private readonly onIframeLoadForHotspots;
    private readonly onHotspotsScroll;
    static get observedAttributes(): string[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string): void;
    private onIframeReady;
    private getIframeSrc;
    private mountViewer;
    private getHotspotsElement;
    private resolveHotspotsScrollEl;
    private attachHotspotsToScrollEl;
    private detachHotspotsFromScrollEl;
    private getHotspotsScrollOffsets;
    private computeHotspotsBaseTransform;
    private updatePdfHotspotsAnchoring;
    private setupPdfHotspotsAnchoring;
    private teardownPdfHotspotsAnchoring;
    private getHotspotKey;
    private hideHostHotspots;
    private showHostHotspots;
    private ensureIframeHotspotsStyle;
    private clearIframeHotspotsLayers;
    private syncHotspotsToIframe;
    private bindIframeHotspotsClick;
    private bindHostHotspotsClick;
    private unbindHostHotspotsClick;
    private bindHostHotspotsObserver;
    private trySetupHotspotsInIframe;
    private teardownHotspotsInIframe;
    private getFullPath;
    private getCssThemeOption;
    private setCssTheme;
    private setViewerExtraStyles;
    private injectExtraStylesLinks;
    initialize: () => Promise<PdfjsViewerElementIframeWindow["PDFViewerApplication"]>;
}
declare global {
    interface Window {
        PdfjsViewerElement: typeof PdfjsViewerElement;
    }
}
export interface IPdfjsViewerElement extends HTMLElement {
    initialize: () => Promise<PdfjsViewerElementIframeWindow['PDFViewerApplication']>;
}
export interface PdfjsViewerElementIframeWindow extends Window {
    PDFViewerApplication: {
        initializedPromise: Promise<void>;
        initialized: boolean;
        eventBus: Record<string, any>;
        open: (data: Uint8Array) => void;
    };
    PDFViewerApplicationOptions: {
        set: (name: string, value: string | boolean | number) => void;
        getAll: () => Record<string, any>;
    };
}
export interface PdfjsViewerElementIframe extends HTMLIFrameElement {
    contentWindow: PdfjsViewerElementIframeWindow;
}
export default PdfjsViewerElement;
