# Plain TypeScript PWA instead of .NET Blazor

The first PRD named .NET/Blazor. Every hard part of the client is a browser API: AudioWorklet, Web Audio scheduling, WebCrypto, IndexedDB, Canvas at 60 fps. Blazor WebAssembly would put a large payload and a JS interop layer in front of each, hurting phone startup and latency. We decided (2026-10-27) on TypeScript with Lit and Vite, and Python for the offline content builder where the existing tools live.

## Considered Options

- Blazor WebAssembly: rejected for payload, startup and interop cost on phones.
- Vanilla JS without a build step like the existing viewer: rejected because the PWA shell, tests and bundled fonts need a build.
