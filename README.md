# My ChatGPT

A ChatGPT-style assistant built from scratch without an OpenAI, OpenRouter, Anthropic, Gemini, or other AI inference API.

## How the AI works

The chat model runs locally in the user's browser with Transformers.js and the ONNX version of `onnx-community/Qwen2.5-0.5B-Instruct`. The model is downloaded the first time it is needed and then cached by the browser.

This means there is no AI API key in the project and prompts are sent to the local model instead of an AI provider.

## Built-in tools

- Local AI chat and coding assistance
- Automatic web search for questions that need fresh information
- Web page text extraction through the Node backend
- Calculator tool
- Markdown-style code blocks with copy buttons
- Persistent chat history in localStorage
- New chat and delete chat
- Dark and light themes
- Responsive mobile layout
- WebGPU acceleration when supported, with WASM fallback

## Run locally

```bash
npm install
npm run dev
```

Open the Vite address shown in the terminal, normally `http://localhost:5173`.

## Production

```bash
npm install
npm run build
npm start
```

The included `render.yaml` can be used as a starting point for Render deployment.

## Important limitation

A small browser model cannot match the quality, context length, tool use, or reasoning ability of large hosted models. This project deliberately avoids AI inference APIs, so the model must run on the user's hardware. A stronger local model can be added later if the target devices have enough RAM/VRAM.
