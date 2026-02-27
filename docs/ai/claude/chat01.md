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
스크롤 기능이 구현되었어요. 고마워요.
그런데, 스크롤을 하는 경우 페이지의 하단 부분이 캡쳐되지 않는 경우가 있고,
캡쳐시에 전체 화면이 아니라 좌측 상단 부분만 캡쳐되기도 합니다.
"""

  버그 1: 좌측 상단만 캡처되는 문제 (dpr 미적용)                                                                
captureVisibleTab이 반환하는 스크린샷은 물리 픽셀 크기 (CSS px × devicePixelRatio)입니다. dpr=2인 모니터에서는   이미지가 뷰포트의 2배 크기입니다.

  기존 코드는 소스 좌표를 CSS 픽셀로 지정했기 때문에, 실제 이미지의 좌측 상단 1/4(dpr=2의 경우)만
  샘플링됐습니다.

  - 캔버스: viewportWidth * dpr, totalHeight * dpr (물리 픽셀)
  - drawImage 소스 좌표: 모두 × dpr 변환 후 지정

  버그 2: 하단 미캡처

  - Math.min(scrollY, totalHeight - viewportHeight) → 페이지가 뷰포트보다 짧을 때 음수가 되는 엣지케이스를      
  Math.max(0, ...) 로 방지
  - 렌더링 대기 시간 200ms → 300ms 로 증가 (느린 페이지에서 스크롤 후 렌더링이 덜 된 상태로 캡처되던 문제 대응)


================================

"""
페이지 전체에 대한 스크롤은 없는데, 페이지 내부에 스크롤이 있는 경우도 스크롤을 이동하면서 캡쳐하는 기능을 추가하고 싶어요.
"""

  전체 흐름 
  팝업 "내부 스크롤 캡처" 클릭                                                                                      → background: ACTIVATE_ELEMENT_PICKER                                                                           → contentScript: START_PICKER                                                                                   → 페이지에 오버레이 표시                                                                                    
          ↓ 사용자가 스크롤 요소 클릭
    → contentScript: 스크롤 + 캡처 루프
          ↓ (background에 CAPTURE_VISIBLE 반복 요청)
    → background: SAVE_SCROLL_CAPTURE
    → chrome.downloads → Downloads/WebCaptures/YYYY-MM/ 저장

  각 파일 변경 요약

  ┌──────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐  
  │       파일       │                                       변경 내용                                       │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ popup.html       │ "내부 스크롤 캡처" 버튼 추가                                                          │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ popup.ts         │ 버튼 클릭 시 ACTIVATE_ELEMENT_PICKER 전송 후 팝업 닫기                                │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ background.ts    │ ACTIVATE_ELEMENT_PICKER → 콘텐츠 스크립트에 START_PICKER 전달SAVE_SCROLL_CAPTURE →    │  
  │                  │ chrome.downloads.download() + 배지 피드백                                             │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │                  │ START_PICKER: 오버레이 생성, hover 시 스크롤 가능 요소 하이라이트, 클릭 시 캡처       │  
  │ contentScript.ts │ 시작captureScrollableElement(): 요소를 스크롤하며 캡처 → 캔버스에 합성 (dpr 보정      │  
  │                  │ 포함)                                                                                 │  
  └──────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘  

  주요 구현 포인트
  - 팝업은 닫혀도 백그라운드 서비스 워커가 전체 흐름을 조율
  - 캡처 결과는 chrome.downloads로 Downloads/WebCaptures/YYYY-MM/scroll-*.ext 에 저장
  - 배지 텍스트(... → OK! / ERR)로 팝업 없이 상태를 표시
  - ESC 키로 피커 취소 가능

=======================

"""
내부 스크롤 기능이 구현되었는데,

1. 스크롤이 길 경우 중간에 '캡처 실패' 메시지가 뜨면서, 중단되요.
2. 내부 스크롤 캡쳐 이미지가 Downloads 폴더의 하위 폴더로 자동으로 저장되요.
"""

  Issue 1: 캡처 실패 → captureVisibleWithRetry() 추가                                                           
                                                                                                                
  captureVisibleTab은 빠른 연속 호출 시 실패할 수 있습니다. 3회 재시도 + 지수 백오프(700ms, 1400ms)로
  처리합니다.

  1회 실패 → 700ms 후 재시도
  2회 실패 → 1400ms 후 재시도
  3회 실패 → 예외 발생

  스크롤 후 렌더링 대기도 300ms → 500ms로 늘렸습니다.

  ---
  Issue 2: 자동 저장 → showDirectoryPicker() 즉시 호출로 변경

  핵심 제약: showDirectoryPicker()는 사용자 제스처(클릭)가 유효한 동안만 호출 가능합니다. 콘텐츠 스크립트에서는 
  popup과 달리 user activation이 빠르게 만료되므로, 클릭 이벤트 핸들러의 첫 번째 await로 호출해야 합니다.       

  사용자가 스크롤 요소 클릭
    → 즉시 showDirectoryPicker() (user gesture 유효 시점)
    → 폴더 선택
    → 캡처 루프 실행 (시간이 얼마나 걸려도 무방)
    → 선택된 폴더에 저장 (일반 캡처와 동일한 WebCaptures/YYYY-MM/ 구조)

  chrome.downloads 방식을 제거하고, saveToDirectory() 함수로 File System API를 사용해 직접 저장합니다.

===============

"""
'내부 스크롤 캡처'의 경우 스크롤이 끝까지 가는데, "캡처 실패"가 뜹니다.
그리고, '현재 화면 캡처'는 볼트 폴더를 지정하는데, '내부 스크롤 캡처'는 스크롤 전에 '사이트에서 볼 수 있는 폴더를 선택하세요' 타이틀로 파일 익스플로러가 뜨네요.
"""

  Issue 1: 캡처 실패 → windowId 전달
  captureVisibleTab(undefined, ...) 은 서비스 워커에서 "현재 윈도우"를 특정하지 못해 실패할 수 있습니다.                                                                                                                          content script → background: CAPTURE_VISIBLE                                                                    background: captureVisibleTab(sender.tab?.windowId, { format })                                               
                                ↑ content script가 실행 중인 탭의 윈도우 ID

  팝업에서 보내는 경우엔 sender.tab이 없으므로 undefined → 기존 동작 유지.

  ---
  Issue 2: 폴더 선택 타이밍 개선

  ┌────────────────┬───────────────────────────────────────────┬────────────────────────────────────────┐       
  │                │                   이전                    │                  이후                  │       
  ├────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤       
  │ 폴더 선택 시점 │ element click 시 (사이트 컨텍스트)        │ 팝업 버튼 클릭 시 (extension 컨텍스트) │       
  ├────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤       
  │ 저장 주체      │ content script                            │ background (IndexedDB의 handle 사용)   │       
  ├────────────────┼───────────────────────────────────────────┼────────────────────────────────────────┤       
  │ 폴더 선택 UI   │ "사이트에서 볼 수 있는 폴더를 선택하세요" │ 정상 폴더 선택 다이얼로그              │       
  └────────────────┴───────────────────────────────────────────┴────────────────────────────────────────┘       

  흐름:
  팝업 "내부 스크롤 캡처" 클릭
    → showDirectoryPicker({ mode:'readwrite' })  ← 팝업 컨텍스트에서 정상 동작
    → saveHandle(dirHandle)  ← IndexedDB 저장
    → ACTIVATE_ELEMENT_PICKER → 팝업 닫힘
    → (element 클릭 → 캡처 → SAVE_SCROLL_CAPTURE)
    → background: getHandle() → vault에 저장


========================

"""
Save error: TypeError: a.getDirectoryHandle is not a function
컨텍스트
assets/background.ts-BGHW7LLz.js
스택 추적
assets/background.ts-BGHW7LLz.js:1 (익명의 함수)

"""


  근본 원인: MV3 서비스 워커(background)에는 File System Access API가 없습니다.
  FileSystemDirectoryHandle.getDirectoryHandle()는 DOM 컨텍스트(브라우저 페이지)에서만 동작합니다.              
  
  해결: Offscreen Document

  content script
    → SAVE_SCROLL_CAPTURE (dataUrl) → background SW
                                            ↓
                                ensureOffscreenDocument()
                                            ↓
                                offscreen document (DOM 컨텍스트)
                                   getHandle() from IndexedDB
                                   getDirectoryHandle() ← File System API ✓
                                   파일 저장 완료
                                            ↓
                                { ok: true } → background → content script

  추가된 파일:
  - src/offscreen/offscreen.html — 최소 HTML
  - src/offscreen/offscreen.ts — vault 저장 로직 (getHandle() + File System API)

  변경된 파일:
  - manifest.config.ts — "offscreen" 권한 추가
  - vite.config.ts — offscreen.html을 빌드 entry로 추가
  - background.ts — saveScrollCapture() → offscreen document에 위임


====================

"""
Save error: Error: TypeError: Cannot read properties of undefined (reading 'local')
컨텍스트
assets/background.ts-FuSBUIKJ.js
스택 추적
assets/background.ts-FuSBUIKJ.js:1 (익명의 함수)
"""

  버그 1: chrome.storage undefined in offscreen
  
  Offscreen Document는 chrome.storage 접근이 불안정합니다. 해결책: imageFormat을 이미 chrome.storage에            안정적으로 접근 가능한 background에서 미리 읽어 메시지에 포함해 전달합니다.                                                                                                                                                     background: chrome.storage.local.get("imageFormat")                                                           
    → saveScrollCapture(dataUrl, format)
    → offscreen: { target, type, dataUrl, format }  ← format 전달받아 직접 사용

  버그 2: db.ts - IDBRequest는 Promise가 아님

  tx.objectStore().get() 은 IDBRequest를 반환하고, 이를 await하면 IDBRequest 객체 자체가 반환됩니다. 또한       
  tx.done은 표준 IDB API에 존재하지 않아 트랜잭션 완료 전에 함수가 반환됐습니다.

  ┌────────────┬───────────────────────────────────────────┬────────────────────────────────────────────────┐   
  │            │                이전 (버그)                │                  이후 (수정)                   │   
  ├────────────┼───────────────────────────────────────────┼────────────────────────────────────────────────┤   
  │ getHandle  │ await tx.objectStore().get() → IDBRequest │ req.onsuccess = () => resolve(req.result) →    │   
  │            │  객체 반환                                │ 실제 handle 반환                               │   
  ├────────────┼───────────────────────────────────────────┼────────────────────────────────────────────────┤   
  │ saveHandle │ await tx.done → 즉시 반환 (undefined)     │ tx.oncomplete = () => resolve() → 커밋 완료 후 │   
  │            │                                           │  반환                                          │   
  └────────────┴───────────────────────────────────────────┴────────────────────────────────────────────────┘  

======================

"""
Save error: Error: NotAllowedError: Failed to execute 'getDirectoryHandle' on 'FileSystemDirectoryHandle': The request is not allowed by the user agent or the platform in the current context.
컨텍스트
assets/background.ts-WSPq2Dzw.js
"""

  popup.ts                                                                                                        - import { saveHandle } 제거                                                                                  
  - innerScrollBtn 클릭 시 showDirectoryPicker()/saveHandle() 호출 제거                                           - 이제 단순히 ACTIVATE_ELEMENT_PICKER 메시지만 전송하고 팝업을 닫음                                                                                                                                                             background.ts                                                                                                 
  - import { getHandle } 제거
  - SAVE_SCROLL_CAPTURE 메시지 핸들러 제거
  - saveScrollCapture(), ensureOffscreenDocument(), OFFSCREEN_URL 제거

  이제 내부 스크롤 캡처 흐름:
  1. 팝업 "내부 스크롤 캡처" 클릭 → ACTIVATE_ELEMENT_PICKER 전송 → 팝업 닫힘
  2. Content script에서 요소 선택 → 캡처 완료
  3. Content script 토스트에 "저장 폴더 선택" 버튼 표시
  4. 버튼 클릭 (user gesture) → showDirectoryPicker() 호출 (페이지 컨텍스트에서 직접)
  5. 선택한 폴더에 WebCaptures/YYYY-MM/scroll-timestamp.ext 로 저장

  NotAllowedError 문제가 완전히 해결됩니다.

====================================

"""
'내부 스크롤 캡처' 저장이 성공했어요. 고마워요.
그런데, 
1. '현재 화면 캡처'를 클릭했을 때, 페이지 전체 스크롤이 있는 경우는 설정에서 스크롤이 'scroll 사용' 이 체크되어 있는 경우에는 페이지 전체 스크롤이 되도록 해주세요.
2. 설정에서 'Obsidian Vault 폴더' 이 선택된 경우 선택된 vault 이름이 나타나도록 해주세요.
3. 설정에서 이미지가 저장되는 vault의 하위 폴더를 선택하도록 해주세요.
4. 설정에서 이미지가 저장될 vault 및 vault의 하위 폴더(지정되지 않은 경우는 default값)가 지정된 경우, 그 디렉토리에 자동으로 저장되도록 해주세요.
5. '내부 스크롤 캡처'의 경우 마지막 저장시에 Downloads 폴더를 기준으로 저장 디렉토리를 다시 확인하는데, 설정의 디렉토리로 자동 저장되도록 해주세요.
"""

 구현 완료
                                                                                                                
  변경된 파일 7개

  ┌──────────────────┬───────────────────────────────────────────────────────────────────────────────────────┐  
  │       파일       │                                       주요 변경                                       │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ options.html     │ vaultName 표시 span + 하위 폴더 input 섹션 추가                                       │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ options.ts       │ mode:'readwrite' 지정, vaultName 저장/표시, subFolder 입력 처리                       │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ options.css      │ max-width: 170px → 500px                                                              │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ offscreen.ts     │ queryPermission 체크 + subFolder 경로 지원                                            │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ background.ts    │ SAVE_SCROLL_CAPTURE 핸들러 + ensureOffscreenDocument + saveScrollCaptureViaOffscreen  │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ contentScript.ts │ 캡처 후 자동 저장 시도 → 실패 시 수동 토스트 fallback                                 │  
  ├──────────────────┼───────────────────────────────────────────────────────────────────────────────────────┤  
  │ popup.ts         │ getHandle import, queryPermission/requestPermission, saveToVaultHandle(subFolder      │  
  │                  │ 지원)                                                                                 │  
  └──────────────────┴───────────────────────────────────────────────────────────────────────────────────────┘  

  동작 방식

  1. 설정 → Vault 폴더 선택 시 이름이 📁 MyVault로 표시됨, 하위 폴더 입력 가능
  2. 현재 화면 캡처 → vault 설정 시 자동 저장 (gesture 살아있을 때 permission 확보 후 캡처)
  3. 내부 스크롤 캡처 → 캡처 완료 후 background → offscreen → vault 자동 저장, vault 미설정 시 수동 토스트      
  fallback
  4. 저장 경로: subFolder 지정 시 vault/Attachments/..., 미지정 시 vault/WebCaptures/YYYY-MM/...

=========================


"""
내부 스크롤 캡처의 경우 "C:\Users\Jungsam\OneDrive\문서\Scanned Documents\개인\WebCaptures\2026-02\scroll-2026-02-27T08-21-31-765Z.png" 파일과 같이 size가 0인 빈 파일로 저장되는 경우가 있어요.
"""

 수정된 버그 3가지
 1. 빈 파일이 남는 근본 원인 (offscreen.ts, popup.ts)                                                          

  getFileHandle({ create: true }) → 0바이트 파일 생성
  createWritable()
  write(blob) → 실패 or blob이 0바이트
  close() 미호출 → 임시 스트림 버려짐
  → 원래 0바이트 파일이 디스크에 남음
  수정:
  - write() 실패 시 writable.abort() + removeEntry() 로 빈 파일 삭제
  - blob.size === 0 이면 파일 자체를 생성하지 않고 에러 throw (toast fallback)

  2. fetch(dataUrl) 대용량 실패 위험 (offscreen.ts, popup.ts)

  - 큰 스크롤 캡처 이미지 → data URL이 수 MB → fetch가 offscreen에서 silently 실패 가능
  - 수정: fetch() 대신 atob() 기반 dataUrlToBlob() 함수로 교체

  3. Offscreen document 초기화 race condition (background.ts)

  - createDocument() resolve 직후 메시지 전송 → 스크립트 listener 미등록 → 메시지 무시
  - 수정: 새 문서 생성 시 200ms 대기 추가

=============================

"""
아직도 내부 스크롤이 긴 경우에는 size=0 으로 이미지가 저장되네요.
"""

  버그 원인 및 수정
                                                                                                                
  원인 (버그 연쇄)

  1. eH(scrollHeight) × dpr > 16383px
     → canvas.toDataURL() 가 에러 없이 "data:," 반환

  2. 자동 저장: offscreen에서 EMPTY_BLOB 감지
     → { noVault: true } → 수동 저장 토스트 표시

  3. 사용자가 "저장 폴더 선택" 클릭
     → saveToDirectory(dirHandle, "data:,")
     → fetch("data:,").blob() → 0바이트 blob
     → 0바이트 파일 생성 ← 여기서 빈 파일 발생

  수정 1: effectiveDpr 도입 (예방)

  dpr=2, eH=10000px → effectiveDpr=1 → canvas.height=10000px (제한 이내)
  dpr=2, eH=5000px  → effectiveDpr=2 → canvas.height=10000px (정상)
  캔버스가 16383px을 넘으면 DPR을 자동으로 낮춰 toDataURL() 실패를 예방합니다.

  수정 2: toDataURL() 결과 검증 (안전망)

  if (!result || result === "data:," || !result.startsWith("data:image/")) {
    throw new Error("이미지 생성 실패: 스크롤 영역이 너무 길어 처리할 수 없습니다.");
  }
  빈 결과면 즉시 throw → 에러 토스트 표시 → showSaveToast는 절대 호출 안 됨 → 빈 파일 생성 불가

  수정 3: saveToDirectory 강화 (방어적)

  - fetch(dataUrl).blob() → dataUrlToBlob() (atob 기반, 대용량 안정)
  - blob.size === 0 검증 추가
  - write 실패 시 abort() + removeEntry() 로 빈 파일 정리

==============================

"""
Inner scroll capture error: Error: 스크롤 영역이 너무 깁니다 (51475px). 더 짧은 영역을 선택해 주세요.
컨텍스트
https://aistudio.google.com/prompts/1ynSPXkTC6vpADWHz_M8hHQukkFh_Cqpg
"""

  변경 요약
  
  이전 동작: max(1, ...) 제약으로 scale이 절대 1 미만이 되지 않음 → eH=51475px에서 canvas.height = 51475 > 16383
   → throw

  새 동작: scale 제한 없이 MIN(dpr, 16383/eH, 16383/ew) 계산

  ┌──────────┬─────┬──────────────────────────┬─────────────────────────────┐
  │    eH    │ dpr │       effectiveDpr       │        canvas.height        │
  ├──────────┼─────┼──────────────────────────┼─────────────────────────────┤
  │ 5,000px  │ 2   │ 2.0                      │ 10,000px (고해상도 정상)    │
  ├──────────┼─────┼──────────────────────────┼─────────────────────────────┤
  │ 10,000px │ 2   │ 1.638 → 1.0 이하 → 1.638 │ 16,383px                    │
  ├──────────┼─────┼──────────────────────────┼─────────────────────────────┤
  │ 51,475px │ 2   │ 0.318                    │ ~16,368px (전체 캡처, 축소) │
  ├──────────┼─────┼──────────────────────────┼─────────────────────────────┤
  │ 51,475px │ 1   │ 0.318                    │ ~16,368px (전체 캡처, 축소) │
  └──────────┴─────┴──────────────────────────┴─────────────────────────────┘

  51,475px 요소는 약 31% 스케일로 전체 내용이 캡처됩니다. toDataURL() 검증은 여전히 유지되어 실패 시 의미있는   
  에러를 표시합니다.

=====================

"""
긴 스크롤이어도 해상도를 축소하지 않고 저장할 수는 없나요? 파일 용량에 대한 설정을 조정할 수 없나요?
"""

  ---
  근본 원인: 브라우저 Canvas 크기 제한

  MAX_CANVAS_DIM = 16383px은 Chrome GPU 텍스처의 하드웨어 한계입니다. 단일 Canvas로는 이 이상의 이미지를 만들 수 없어서 현재 축소 방식을
   사용하고 있습니다.

  ---
  가능한 해결책

  방법 A — 분할 저장 (해상도 완전 보존)

  16383px 단위로 잘라 여러 파일로 저장합니다.
  - scroll-part1.png, scroll-part2.png, ... 형태
  - 51,475px 스크롤 → 약 4~7개 파일 생성
  - 해상도 손실 없음, 단 파일이 여러 개로 분리됨

  방법 B — JPEG 품질 설정 추가 (파일 용량 조절)

  설정에 JPEG 품질 슬라이더(1~100)를 추가합니다.
  - 현재 이미지 포맷이 jpeg일 때만 적용
  - 파일 용량을 줄일 수 있지만, 캔버스 크기 제한 자체는 해결하지 못함
  - PNG는 무손실이라 품질 설정이 의미 없음

  방법 C — A + B 동시 적용

  분할 저장 + JPEG 품질 설정을 모두 구현

---

  변경 내용 요약                                                                                                                          
  핵심 원리                                                                                                                             
  
  Canvas 16383px 한계를 넘으면 타일 단위로 분할해 각각 별도 파일로 저장합니다.

  dpr=2, eH=51,475px 기준

  ┌────────────────────────────────────────────┬────────────────────────────────────────┐
  │                    이전                    │                  이후                  │
  ├────────────────────────────────────────────┼────────────────────────────────────────┤
  │ effectiveDpr = 0.318 (31% 축소) → 1개 파일 │ dpr = 2 (100% 해상도) → 7개 파일       │
  ├────────────────────────────────────────────┼────────────────────────────────────────┤
  │ scroll-TIMESTAMP.png (축소된 단일 파일)    │ scroll-TIMESTAMP-part1.png ~ part7.png │
  └────────────────────────────────────────────┴────────────────────────────────────────┘

  타일 분할 계산

  - maxCssTileHeight = floor(16383 / dpr) — 타일 1개당 최대 CSS 높이
  - numTiles = ceil(eH / maxCssTileHeight) — 필요한 타일 수
  - 타일 경계를 넘치는 슬라이스는 양쪽 타일에 각각 나눠서 그림

  저장 파일명

  - 단일 타일(짧은 스크롤): scroll-TIMESTAMP.ext (기존과 동일)
  - 다중 타일(긴 스크롤): scroll-TIMESTAMP-part1.ext, part2.ext, ...

  빌드 후 테스트해 보시면 긴 스크롤도 원본 해상도 그대로 저장되는 것을 확인하실 수 있습니다.

===========================

