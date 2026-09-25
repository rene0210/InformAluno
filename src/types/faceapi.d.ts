// Declaração do global `faceapi` — a lib é carregada pelo script clássico
// <script src="/face-api.js"> no index.html (fora do pipeline do Vite,
// porque o transform do Vite quebra o método `async import` do tfjs).
import type * as FaceApi from "@vladmandic/face-api";

declare global {
  const faceapi: typeof FaceApi;
}

export {};
