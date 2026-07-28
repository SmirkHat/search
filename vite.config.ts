import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { autocompleteProxyPlugin } from "./vite-ac-proxy";

/** Prefetch/modulepreload hints for built hashed assets. */
function assetHintsPlugin(): Plugin {
  return {
    name: "smirkhat-asset-hints",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;

        const preloads: string[] = [];
        const prefetches: string[] = [];

        for (const item of Object.values(ctx.bundle)) {
          if (item.type === "chunk" && item.isEntry) {
            preloads.push(
              `<link rel="modulepreload" crossorigin href="/${item.fileName}" />`,
            );
            for (const dep of item.imports) {
              const depChunk = ctx.bundle[dep];
              if (depChunk && depChunk.type === "chunk") {
                preloads.push(
                  `<link rel="modulepreload" crossorigin href="/${depChunk.fileName}" />`,
                );
              }
            }
            for (const css of item.viteMetadata?.importedCss ?? []) {
              preloads.push(
                `<link rel="preload" href="/${css}" as="style" />`,
              );
            }
          }
          if (item.type === "asset" && item.fileName.endsWith(".woff2")) {
            preloads.push(
              `<link rel="preload" href="/${item.fileName}" as="font" type="font/woff2" crossorigin />`,
            );
          }
        }

        // Soft-prefetch non-critical shell bits
        prefetches.push(
          `<link rel="prefetch" href="/logo.svg" as="image" />`,
          `<link rel="prefetch" href="/clipboard.svg" as="image" />`,
          `<link rel="prefetch" href="/opensearch.xml" as="fetch" crossorigin />`,
        );

        const hints = [...new Set([...preloads, ...prefetches])].join("\n    ");
        return html.replace("</head>", `    ${hints}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  server: {
    allowedHosts: ["prcek.local"],
  },
  build: {
    modulePreload: {
      polyfill: true,
    },
  },
  test: {
    environment: "node",
  },
  plugins: [
    autocompleteProxyPlugin(),
    assetHintsPlugin(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: [
        "bangs-hot.json",
        "logo.svg",
        "clipboard.svg",
        "clipboard-check.svg",
        "opensearch.xml",
        "icons/*.png",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,svg,png,webp,woff2,webmanifest}"],
        globIgnores: ["**/bangs.json"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        minify: false,
      },
      manifest: {
        name: "SmirkHat Search",
        short_name: "SmirkHat",
        description:
          "Rychlé vyhledávání s bangy přímo z adresního řádku.",
        lang: "cs",
        theme_color: "#171717",
        background_color: "#171717",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
});
