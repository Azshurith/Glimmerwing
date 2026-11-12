// Images are inlined as data URIs by esbuild (see build.mjs).
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
