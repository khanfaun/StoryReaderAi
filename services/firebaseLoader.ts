// services/firebaseLoader.ts
export function getModuleImports() {
  const isAIStudio = window.location.hostname.includes('aistudio.google.com');

  if (isAIStudio) {
    console.log("[Module Loader] Running in AI Studio -> using aistudiocdn.com");
    // Sử dụng tiền tố đường dẫn (path prefixes) để phân giải các module con như 'react-dom/client' một cách chính xác.
    return {
      "firebase/": "https://aistudiocdn.com/firebase@^12.3.0/",
      "react": "https://aistudiocdn.com/react@^19.1.1",
      "react/": "https://aistudiocdn.com/react@^19.1.1/",
      "react-dom": "https://aistudiocdn.com/react-dom@^19.1.1",
      "react-dom/": "https://aistudiocdn.com/react-dom@^19.1.1/",
      "@google/genai": "https://aistudiocdn.com/@google/genai@^1.20.0"
    };
  } else {
    console.log("[Module Loader] Running on web -> using esm.sh");
    // Sử dụng phiên bản cố định (pinned versions) và tiền tố đường dẫn để đảm bảo ổn định trên esm.sh.
    return {
      "firebase/": "https://esm.sh/firebase@10.12.2/",
      "react": "https://esm.sh/react@19.1.1",
      "react/": "https://esm.sh/react@19.1.1/",
      "react-dom": "https://esm.sh/react-dom@19.1.1",
      "react-dom/": "https://esm.sh/react-dom@19.1.1/",
      "@google/genai": "https://esm.sh/@google/genai@1.20.0"
    };
  }
}
