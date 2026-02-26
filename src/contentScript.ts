type Message =
  | { type: "GET_PAGE_INFO" }
  | { type: "SCROLL_TO"; y: number };

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