figma.showUI(__html__);  
figma.ui.resize(240, 270);  

let debounceTimer: number | null = null;  
const resultCache = new Map<string, { ratio: number, preview: Uint8Array }>();  

figma.on('selectionchange', () => {  
    if (debounceTimer) clearTimeout(debounceTimer);  
    debounceTimer = setTimeout(() => {  
        const selection = figma.currentPage.selection;  
        if (selection.length === 1) {  
            const node = selection[0];  
            if (isExportableNode(node)) {  
                updateUIWithNodeInfo(node);  
            } else {  
                figma.ui.postMessage({ type: 'error', message: '所选图层不支持此操作' });  
            }  
        }  
    }, 300); // 300ms 延迟  
});  

function isExportableNode(node: SceneNode): node is ExportMixin & SceneNode {  
    return 'exportAsync' in node;  
}  

async function updateUIWithNodeInfo(node: ExportMixin & SceneNode) {  
    const cacheKey = `${node.id}-${node.width}-${node.height}`;  
    
    if (resultCache.has(cacheKey)) {  
        const cachedResult = resultCache.get(cacheKey)!;  
        figma.ui.postMessage({ type: 'result', value: cachedResult.ratio });  
        figma.ui.postMessage({ type: 'preview', imageData: cachedResult.preview });  
        return;  
    }  

    try {  
        const [ratio, preview] = await Promise.all([  
            calculateNonBlackPixelRatio(node),  
            generatePreview(node)  
        ]);  

        resultCache.set(cacheKey, { ratio, preview });  

        figma.ui.postMessage({ type: 'result', value: ratio });  
        figma.ui.postMessage({ type: 'preview', imageData: preview });  
    } catch (error: unknown) {  
        if (error instanceof Error) {  
            figma.ui.postMessage({ type: 'error', message: error.message });  
        } else {  
            figma.ui.postMessage({ type: 'error', message: 'An unknown error occurred' });  
        }  
    }  
}  

async function calculateNonBlackPixelRatio(node: ExportMixin & SceneNode): Promise<number> {  
    const bounds = node.absoluteBoundingBox;  
    if (!bounds) throw new Error('无法获取图层边界');  

    const { width, height } = bounds;  

    const bytes = await node.exportAsync({  
        format: 'PNG',  
        constraint: { type: 'SCALE', value: 1 }  
    });  

    return new Promise((resolve, reject) => {  
        figma.ui.postMessage({  
            type: 'calculate',  
            bytes: bytes,  
            width: width,  
            height: height  
        });  

        figma.ui.once('message', msg => {  
            if (msg.type === 'result') {  
                resolve(msg.ratio);  
            } else if (msg.type === 'error') {  
                reject(new Error(msg.message));  
            }  
        });  
    });  
}  

async function generatePreview(node: ExportMixin & SceneNode): Promise<Uint8Array> {  
    const MAX_SIZE = 1024;  
    const bounds = node.absoluteBoundingBox;  
    if (!bounds) throw new Error('无法获取图层边界');  

    let scale = 2;  
    if (bounds.width > MAX_SIZE / 2 || bounds.height > MAX_SIZE / 2) {  
        scale = Math.min(MAX_SIZE / bounds.width, MAX_SIZE / bounds.height);  
    }  

    return node.exportAsync({  
        format: 'PNG',  
        constraint: { type: 'SCALE', value: scale }  
    });  
}  

figma.ui.onmessage = msg => {  
    if (msg.type === 'create-rectangles') {  
        const nodes: SceneNode[] = [];  
        for (let i = 0; i < msg.count; i++) {  
            const rect = figma.createRectangle();  
            rect.x = i * 150;  
            rect.fills = [{type: 'SOLID', color: {r: 1, g: 0.5, b: 0}}];  
            figma.currentPage.appendChild(rect);  
            nodes.push(rect);  
        }  
        figma.currentPage.selection = nodes;  
        figma.viewport.scrollAndZoomIntoView(nodes);  
    }  
};