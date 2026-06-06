/** Logos de stacks et de langages (copiés depuis la logothèque locale). */

const STACK_ICONS: Record<string, string> = {
  nextjs: "/icons/nextjs.svg",
  vite: "/icons/vite.svg",
  expo: "/icons/expo.svg",
  "react-native": "/icons/react.svg",
  tauri: "/icons/tauri.svg",
  electron: "/icons/electron.svg",
  android: "/icons/android.svg",
  nuxt: "/icons/nuxt.svg",
  angular: "/icons/angular.svg",
  astro: "/icons/astro.svg",
  svelte: "/icons/svelte.svg",
  vue: "/icons/vue.svg",
  rust: "/icons/rust.svg",
  python: "/icons/python.svg",
  node: "/icons/node.svg",
};

const FILE_ICONS: Record<string, string> = {
  ts: "/icons/ts.svg",
  mts: "/icons/ts.svg",
  tsx: "/icons/react.svg",
  jsx: "/icons/react.svg",
  js: "/icons/js.svg",
  mjs: "/icons/js.svg",
  cjs: "/icons/js.svg",
  md: "/icons/md.svg",
  mdx: "/icons/md.svg",
  css: "/icons/css.svg",
  scss: "/icons/css.svg",
  sass: "/icons/css.svg",
  less: "/icons/css.svg",
  html: "/icons/html.svg",
  htm: "/icons/html.svg",
  vue: "/icons/vue.svg",
  svelte: "/icons/svelte.svg",
  rs: "/icons/rust.svg",
  py: "/icons/python.svg",
  svg: "/icons/svg.svg",
};

export function stackIcon(kind: string): string | null {
  return STACK_ICONS[kind] ?? null;
}

export function fileIcon(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? null;
}
