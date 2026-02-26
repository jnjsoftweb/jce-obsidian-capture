async function delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => resolve(img);
    });
}

async function stitchImages(images: string[]): Promise<string> {
    const imgElements = await Promise.all(images.map(loadImage));

    const width = imgElements[0].width;
    const height = imgElements.reduce((sum, img) => sum + img.height, 0);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d")!;

    let y = 0;
    for (const img of imgElements) {
        ctx.drawImage(img, 0, y);
        y += img.height;
    }

    const blob = await canvas.convertToBlob({ type: "image/png" });
    return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}

async function captureFullPage(tabId: number) {
    const pageInfo = await chrome.tabs.sendMessage(tabId, {
        type: "GET_PAGE_INFO"
    });

    const { totalHeight, viewportHeight, title, url } = pageInfo;

    const images: string[] = [];
    let scrollY = 0;

    while (scrollY < totalHeight) {
        await chrome.tabs.sendMessage(tabId, {
            type: "SCROLL_TO",
            y: scrollY
        });

        await delay(400);

        const dataUrl = await chrome.tabs.captureVisibleTab();
        images.push(dataUrl);

        scrollY += viewportHeight;
    }

    const finalImage = await stitchImages(images);

    const fileBase = sanitizeFileName(title);

    // 이미지 저장
    await chrome.downloads.download({
        url: finalImage,
        filename: `WebCaptures/${fileBase}.png`
    });

    // Markdown 생성
    const markdown = `
# ${title}

URL: ${url}

![[${fileBase}.png]]
`;

    const mdData =
        "data:text/markdown;base64," + btoa(unescape(encodeURIComponent(markdown)));

    await chrome.downloads.download({
        url: mdData,
        filename: `WebCaptures/${fileBase}.md`
    });
}

function sanitizeFileName(name: string) {
    return name.replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "START_CAPTURE") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0].id) return;
            captureFullPage(tabs[0].id);
        });
    }
});