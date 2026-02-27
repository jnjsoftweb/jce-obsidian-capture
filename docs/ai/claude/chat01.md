"""
C:\JnJ-soft\Projects\@chrome-extension\jce-obsidian-capture\src 에는
크롬 익스텐션 ts 파일들이 있어요.

현재는 화면 캡처 후 저장하는 기본 기능으로 이루어져 있어요.

스크롤을 사용하여, full page를 캡쳐하는 기능을 추가해주세요. 설정에 'scroll 사용' 을 체크박스를 추가하고, 디폴트값은 체크(true)로 해주세요. 이 값이 true 이면, full page를 캡쳐하도록 합니다.
"""

  변경된 파일 4개:                                                                                                              
                                                                                                                                
  1. types.ts                                                                                                                   

  - useScroll: boolean 필드 추가

  2. options/options.html

  - "캡처 옵션" 섹션 추가
  - #useScroll 체크박스 ("scroll 사용 (전체 페이지 캡처)")

  3. options/options.ts

  - useScrollCheckbox 요소 바인딩
  - change 이벤트: chrome.storage.local에 useScroll 저장
  - loadSettings(): useScroll 로드 — data.useScroll !== false로 기본값 true 처리

  4. popup/popup.ts

  - 캡처 버튼 클릭 시 useScroll 설정 읽기
  - useScroll === true면 captureFullPage() 호출, 아니면 기존 CAPTURE_VISIBLE 사용
  - captureFullPage(format) 신규 함수:
    a. 활성 탭에 GET_PAGE_INFO 메시지 → 전체 높이, 뷰포트 크기 획득
    b. 캔버스(전체 페이지 크기)를 생성
    c. 뷰포트 단위로 스크롤하며 각 구간 캡처 → 캔버스에 합성
    d. 마지막 조각의 겹침 보정 (actualScrollY vs scrollY 오프셋 계산)
    e. 스크롤 원위치 후 canvas.toDataURL() 반환

================

"""
Popup error: Error: Could not establish connection. Receiving end does not exist.
컨텍스트
src/popup/popup.html
스택 추적
assets/popup.html-C2QaW1XF.js:1 (익명의 함수)
1
2
import"./modulepreload-polyfill-B5Qt9EMX.js";document.addEventListener("DOMContentLoaded",()=>{const n=document.getElementById("captureBtn"),e=document.getElementById("openOptions"),a=document.getElementById("status");if(!n||!a||!e){console.error("Popup elements not found.");return}e.addEventListener("click",()=>{chrome.runtime.openOptionsPage()}),n.addEventListener("click",async()=>{try{a.textContent="캡처 중...";const t=await chrome.storage.local.get(["imageFormat","useScroll"]),o=t.imageFormat||"png",s=t.useScroll!==!1;let i;if(s)a.textContent="전체 페이지 캡처 중...",i=await p(o);else{const r=await chrome.runtime.sendMessage({type:"CAPTURE_VISIBLE",format:o});if(!r?.dataUrl){a.textContent="캡처 실패";return}i=r.dataUrl}const c=await window.showDirectoryPicker();await b(c,i,o),a.textContent="저장 완료!"}catch(t){console.error("Popup error:",t),a.textContent="오류 발생"}})});async function p(n){const[e]=await chrome.tabs.query({active:!0,currentWindow:!0});if(!e?.id)throw new Error("No active tab");const a=await chrome.tabs.sendMessage(e.id,{type:"GET_PAGE_INFO"}),{totalHeight:t,viewportHeight:o,viewportWidth:s}=a,i=document.createElement("canvas");i.width=s,i.height=t;const c=i.getContext("2d");let r=0;for(;r<t;){const u=Math.min(r,t-o);await chrome.tabs.sendMessage(e.id,{type:"SCROLL_TO",y:u}),await y(200);const l=await chrome.runtime.sendMessage({type:"CAPTURE_VISIBLE",format:n});if(!l?.dataUrl)throw new Error("Capture failed");const m=await h(l.dataUrl),w=r-u,g=Math.min(o-w,t-r);c.drawImage(m,0,w,s,g,0,r,s,g),r+=o-w}await chrome.tabs.sendMessage(e.id,{type:"SCROLL_TO",y:0});const d=n==="jpeg"?"image/jpeg":n==="webp"?"image/webp":"image/png";return i.toDataURL(d)}function h(n){return new Promise((e,a)=>{const t=new Image;t.onload=()=>e(t),t.onerror=a,t.src=n})}function y(n){return new Promise(e=>setTimeout(e,n))}async function b(n,e,a){const t=await(await fetch(e)).blob(),o=new Date,s=`${o.getFullYear()}-${String(o.getMonth()+1).padStart(2,"0")}`,c=await(await n.getDirectoryHandle("WebCaptures",{create:!0})).getDirectoryHandle(s,{create:!0}),r=a==="jpeg"?"jpg":a,d=`capture-${o.toISOString().replace(/[:.]/g,"-")}.${r}`,l=await(await c.getFileHandle(d,{create:!0})).createWritable();await l.write(t),await l.close()}
"""

  원인: chrome.tabs.sendMessage는 콘텐츠 스크립트가 이미 탭에 주입되어 있어야 동작합니다. 탭을 새로 열었거나
  익스텐션 업데이트 후 페이지를 리로드하지 않으면 연결이 없어 에러가 발생합니다.

  ┌──────────────────┬──────────────────────────────┬─────────────────────────────────────┐
  │                  │           변경 전            │               변경 후               │
  ├──────────────────┼──────────────────────────────┼─────────────────────────────────────┤
  │ 페이지 정보 수집 │ sendMessage("GET_PAGE_INFO") │ scripting.executeScript 인라인 함수 │
  ├──────────────────┼──────────────────────────────┼─────────────────────────────────────┤
  │ 스크롤 이동      │ sendMessage("SCROLL_TO")     │ scripting.executeScript 인라인 함수 │
  ├──────────────────┼──────────────────────────────┼─────────────────────────────────────┤
  │ 권한             │ "scripting" 주석처리됨       │ "scripting" 활성화                  │
  └──────────────────┴──────────────────────────────┴─────────────────────────────────────┘

  scripting.executeScript는 콘텐츠 스크립트 주입 여부와 무관하게 직접 탭에 코드를 실행하므로 연결 오류가        
  발생하지 않습니다.

==========================

"""
"""