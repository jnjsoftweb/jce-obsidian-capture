---
title: "전체 페이지 캡처 구현"
source: "https://chatgpt.com/c/69a0bc57-0020-8320-a2bc-0702c0faeb4f"
model: "ChatGPT"
messageCount: 4
createdAt: "2026-02-27"
publishedAt: "2026-02-27"
tags:
  - "ai-chat"
  - "chatgpt"
description: "전체 페이지 캡처 구현"
---

# 전체 페이지 캡처 구현

=========

> 👤 사용자 (User)

웹페이지를 full page screen capture(스크롤 하며 화면 끝까지 캡쳐)하여 obsidian으로 저장하는 chrome extension을 typescript로 구현하려고 해요.

===

> 🤖 챗GPT (ChatGPT)

좋은 아이디어네요 👍

**“웹페이지 전체를 스크롤 캡처 → Obsidian에 저장”** 흐름이면 구조를 먼저 깔끔하게 잡는 게 중요합니다.

아래에 **아키텍처 설계 → Chrome Extension 구성 → 핵심 코드 예시 (TypeScript) → Obsidian 저장 방식** 순서로 정리해드릴게요.
---

# 1️⃣ 전체 구조 설계

### 목표 기능 흐름
- 사용자가 확장 버튼 클릭
- 현재 탭의 웹페이지를 **전체 스크롤 캡처**
- 이미지 생성 (base64 or blob)
- Obsidian Vault에 저장 (파일 생성)
- Markdown 파일 생성 + 이미지 embed
---

# 2️⃣ 기술 스택 선택

| 기능 | 기술 |
| --- | --- |
| 확장 개발 | Chrome Extension Manifest v3 |
| 언어 | TypeScript |
| 캡처 방식 | chrome.tabs.captureVisibleTab() + 스크롤 stitching |
| Obsidian 저장 | Obsidian URI scheme or 로컬 파일 다운로드 |
---

# 3️⃣ 확장 구조 (Manifest v3)

```
/src
  ├── background.ts
  ├── contentScript.ts
  ├── popup.ts
  ├── utils/
manifest.json
tsconfig.json
```
---

# 4️⃣ manifest.json 예시

```json
{
  "manifest_version": 3,
  "name": "Full Page Capture to Obsidian",
  "version": "1.0",
  "permissions": ["tabs", "activeTab", "scripting", "downloads"],
  "background": {
    "service_worker": "dist/background.js"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "host_permissions": ["<all_urls>"]
}
```
---

# 5️⃣ 핵심 로직 설계

## 🔹 A. Full Page Capture 방법

Chrome은 전체 페이지 캡처 API를 기본 제공하지 않음.

따라서:
- content script에서 페이지 높이 계산
- 일정 간격으로 스크롤
- 각 화면을 capture
- canvas에 stitching
---

# 6️⃣ contentScript.ts (페이지 정보 수집)

```typescript
export function getPageInfo() {
  return {
    totalHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio
  };
}
```
---

# 7️⃣ background.ts (핵심 캡처 로직)

```typescript
async function captureFullPage(tabId: number) {
  const pageInfo = await chrome.tabs.sendMessage(tabId, {
    type: "GET_PAGE_INFO"
  });

  const { totalHeight, viewportHeight } = pageInfo;

  const images: string[] = [];
  let scrollY = 0;

  while (scrollY < totalHeight) {
    await chrome.tabs.sendMessage(tabId, {
      type: "SCROLL_TO",
      y: scrollY
    });

    await delay(300);

    const dataUrl = await chrome.tabs.captureVisibleTab();
    images.push(dataUrl);

    scrollY += viewportHeight;
  }

  return stitchImages(images);
}
```
---

# 8️⃣ 이미지 Stitching

```typescript
async function stitchImages(images: string[]): Promise<string> {
  const imgElements = await Promise.all(
    images.map(loadImage)
  );

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
```
---

# 9️⃣ Obsidian 저장 방법

## 방법 1️⃣ (추천) 다운로드 후 Vault 폴더 지정

```typescript
chrome.downloads.download({
  url: imageDataUrl,
  filename: `ObsidianVault/WebCaptures/${fileName}.png`
});
```

→ 사용자가 Vault를 기본 다운로드 폴더로 설정하면 자동 저장 가능
---

## 방법 2️⃣ Obsidian URI Scheme 사용

```
obsidian://new?file=WebCaptures/파일명&content=...
```

하지만 이미지 binary 저장은 어려움

→ URI는 Markdown 파일 생성용으로 사용 추천
---

# 🔟 Markdown 자동 생성 예시

```
const markdownContent = `
# ${document.title}

URL: ${location.href}

![[${fileName}.png]]
`;

chrome.downloads.download({
  url: "data:text/markdown;base64," + btoa(markdownContent),
  filename: `ObsidianVault/WebCaptures/${fileName}.md`
});
```
---

# 🔥 구현 시 주의할 점

### 1️⃣ Sticky Header 문제

스크롤 시 header가 계속 찍힘

→ 캡처 전 `position: fixed` 요소 숨기기

### 2️⃣ Lazy Loading 이미지

스크롤 중 강제 로딩 필요

→ `window.scrollTo(0, document.body.scrollHeight)` 먼저 실행

### 3️⃣ Retina 대응

devicePixelRatio 반영 필요
---

# 🏗 개선 아이디어
- 날짜 기반 폴더 자동 생성
- 태그 자동 삽입
- 페이지 메타데이터 (description, author) 파싱
- PDF 저장 옵션
- 특정 영역만 캡처 기능
---

# 💡 구조 추천

```
core/
  capture.ts
  stitch.ts
  obsidian.ts
  markdown.ts
```

로직 분리하면 유지보수 쉬움.
---

# 🚀 질문

다음 중 어떤 방향으로 더 깊게 가볼까요?
- 📦 완성형 프로젝트 구조 (vite + crx)
- 🧠 캡처 알고리즘 고도화 (sticky/header 완전 해결)
- 🔗 Obsidian과 안정적 연동 방식 설계
- 🧪 실제 동작하는 최소 예제 전체 코드

원하시는 방향 알려주시면 거기 맞춰서 실전 코드 수준으로 만들어드릴게요.

=========

> 👤 사용자 (User)

우선 tsc로 빌드될 수 있도록 하는 MVP 전체 코드를 생성해주세요.

===

> 🤖 챗GPT (ChatGPT)

좋습니다 👍

**“tsc로 바로 빌드되는 Manifest v3 기반 MVP”** 전체 코드를 깔끔하게 정리해드리겠습니다.

> 목표
> - 버튼 클릭 → 전체 페이지 스크롤 캡처
> - 이미지 stitching
> - PNG 다운로드
> - Markdown 파일 생성 후 다운로드
> - 순수 `tsc` 빌드 (번들러 없이)
---

# 📁 최종 프로젝트 구조

```
fullpage-obsidian-extension/
│
├─ manifest.json
├─ tsconfig.json
├─ package.json
│
├─ popup.html
│
├─ src/
│   ├─ background.ts
│   ├─ contentScript.ts
│   ├─ popup.ts
│   └─ types.ts
│
└─ dist/   (tsc 빌드 결과)
```
---

# 1️⃣ package.json

```json
{
  "name": "fullpage-obsidian-extension",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "@types/chrome": "^0.0.257"
  }
}
```

설치:

```bash
npm install
```
---

# 2️⃣ tsconfig.json

```json
{
  "compilersettings": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["DOM", "ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "moduleResolution": "Bundler",
    "types": ["chrome"]
  },
  "include": ["src"]
}
```
---

# 3️⃣ manifest.json

```json
{
  "manifest_version": 3,
  "name": "Full Page Capture to Obsidian",
  "version": "1.0",
  "description": "Capture full page and save to Obsidian",
  "permissions": ["activeTab", "scripting", "downloads"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["dist/contentScript.js"]
    }
  ]
}
```
---

# 4️⃣ popup.html

```
<!DOCTYPE html<html  <head    <meta charset="UTF-8" /  </head  <body    <button id="captureBtn">Capture Full Page</button    <script type="module" src="dist/popup.js"></script  </body</html```
---

# 5️⃣ src/types.ts

```typescript
export type Message =
  | { type: "GET_PAGE_INFO" }
  | { type: "SCROLL_TO"; y: number };
```
---

# 6️⃣ src/contentScript.ts

```
import { Message } from "./types";

chrome.runtime.onMessage.addListener(
  (message: Message, _, sendResponse) => {
    if (message.type === "GET_PAGE_INFO") {
      sendResponse({
        totalHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        title: document.title,
        url: location.href
      });
    }

    if (message.type === "SCROLL_TO") {
      window.scrollTo(0, message.y);
      sendResponse(true);
    }

    return true;
  }
);
```
---

# 7️⃣ src/background.ts

```typescript
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
```
---

# 8️⃣ src/popup.ts

```typescript
document.getElementById("captureBtn")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "START_CAPTURE" });
});
```
---

# 🚀 빌드 방법

```bash
npm run build
```

`dist/` 생성됨.
---

# 🧩 Chrome에 로드하기
- chrome://extensions
- 개발자 모드 ON
- "압축해제된 확장 프로그램 로드"
- 프로젝트 폴더 선택
---

# 🎉 MVP 동작

버튼 클릭하면:
- 전체 페이지 스크롤 캡처
- 하나의 PNG로 stitching
- Markdown 생성
- Downloads/WebCaptures/ 에 저장
---

# ⚠️ MVP 한계 (정상)
- sticky header 중복 찍힘
- lazy image 완전 대응 안됨
- 매우 긴 페이지는 메모리 문제 가능
---

원하시면 다음 단계로:
- ✅ Sticky 요소 자동 제거 로직 추가
- ✅ Retina 정확 보정
- ✅ Obsidian Vault 자동 지정 UX 개선
- ✅ 크롬 웹스토어 배포 구조
- ✅ Playwright 기반 테스트

어디까지 발전시켜볼까요?

=========

