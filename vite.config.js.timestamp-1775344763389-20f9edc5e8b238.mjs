// vite.config.js
import { defineConfig } from "file:///C:/Users/mega/mega_env/trading-project/node_modules/vite/dist/node/index.js";
import fs from "fs";
import path from "path";
import { visualizer } from "file:///C:/Users/mega/mega_env/trading-project/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
var __vite_injected_original_dirname = "C:\\Users\\mega\\mega_env\\trading-project";
var vite_config_default = defineConfig({
  root: ".",
  server: {
    port: 3e3,
    strictPort: true
  },
  plugins: [
    {
      name: "html-include",
      enforce: "pre",
      // ✅ No 'as const' needed in .js
      transformIndexHtml(html) {
        function processIncludes(content, currentFile, visited) {
          return content.replace(
            /<!--@include\s+(.+?)-->/g,
            (match, filePath) => {
              const fullPath = path.resolve(path.dirname(currentFile), filePath.trim());
              if (visited.has(fullPath)) {
                console.warn(`\u26A0\uFE0F Circular include detected: ${fullPath}`);
                return `<!--@include ${filePath} (CIRCULAR)-->`;
              }
              if (!fs.existsSync(fullPath)) {
                console.warn(`\u26A0\uFE0F HTML include not found: ${filePath}`);
                return `<!--@include ${filePath} (NOT FOUND)-->`;
              }
              const included = fs.readFileSync(fullPath, "utf-8");
              visited.add(fullPath);
              return processIncludes(included, fullPath, visited);
            }
          );
        }
        const indexPath = path.resolve(__vite_injected_original_dirname, "index.html");
        return processIncludes(html, indexPath, /* @__PURE__ */ new Set([indexPath]));
      }
    },
    visualizer({
      filename: "stats.html",
      template: "network",
      open: true,
      gzipSize: true,
      brotliSize: true,
      json: true
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtZWdhXFxcXG1lZ2FfZW52XFxcXHRyYWRpbmctcHJvamVjdFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcbWVnYVxcXFxtZWdhX2VudlxcXFx0cmFkaW5nLXByb2plY3RcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL21lZ2EvbWVnYV9lbnYvdHJhZGluZy1wcm9qZWN0L3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCBmcyBmcm9tICdmcyc7XHJcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyB2aXN1YWxpemVyIH0gZnJvbSAncm9sbHVwLXBsdWdpbi12aXN1YWxpemVyJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcm9vdDogJy4nLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgcG9ydDogMzAwMCxcclxuICAgIHN0cmljdFBvcnQ6IHRydWUsXHJcbiAgfSxcclxuICBwbHVnaW5zOiBbXHJcbiAgICB7XHJcbiAgICAgIG5hbWU6ICdodG1sLWluY2x1ZGUnLFxyXG4gICAgICBlbmZvcmNlOiAncHJlJywgICAgICAgICAgICAgICAgICAgIC8vIFx1MjcwNSBObyAnYXMgY29uc3QnIG5lZWRlZCBpbiAuanNcclxuICAgICAgdHJhbnNmb3JtSW5kZXhIdG1sKGh0bWwpIHtcclxuICAgICAgICBmdW5jdGlvbiBwcm9jZXNzSW5jbHVkZXMoY29udGVudCwgY3VycmVudEZpbGUsIHZpc2l0ZWQpIHtcclxuICAgICAgICAgIHJldHVybiBjb250ZW50LnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC88IS0tQGluY2x1ZGVcXHMrKC4rPyktLT4vZyxcclxuICAgICAgICAgICAgKG1hdGNoLCBmaWxlUGF0aCkgPT4ge1xyXG4gICAgICAgICAgICAgIGNvbnN0IGZ1bGxQYXRoID0gcGF0aC5yZXNvbHZlKHBhdGguZGlybmFtZShjdXJyZW50RmlsZSksIGZpbGVQYXRoLnRyaW0oKSk7XHJcblxyXG4gICAgICAgICAgICAgIGlmICh2aXNpdGVkLmhhcyhmdWxsUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgXHUyNkEwXHVGRTBGIENpcmN1bGFyIGluY2x1ZGUgZGV0ZWN0ZWQ6ICR7ZnVsbFBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYDwhLS1AaW5jbHVkZSAke2ZpbGVQYXRofSAoQ0lSQ1VMQVIpLS0+YDtcclxuICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgIGlmICghZnMuZXhpc3RzU3luYyhmdWxsUGF0aCkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgXHUyNkEwXHVGRTBGIEhUTUwgaW5jbHVkZSBub3QgZm91bmQ6ICR7ZmlsZVBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYDwhLS1AaW5jbHVkZSAke2ZpbGVQYXRofSAoTk9UIEZPVU5EKS0tPmA7XHJcbiAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICBjb25zdCBpbmNsdWRlZCA9IGZzLnJlYWRGaWxlU3luYyhmdWxsUGF0aCwgJ3V0Zi04Jyk7XHJcbiAgICAgICAgICAgICAgdmlzaXRlZC5hZGQoZnVsbFBhdGgpO1xyXG4gICAgICAgICAgICAgIHJldHVybiBwcm9jZXNzSW5jbHVkZXMoaW5jbHVkZWQsIGZ1bGxQYXRoLCB2aXNpdGVkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGluZGV4UGF0aCA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdpbmRleC5odG1sJyk7XHJcbiAgICAgICAgcmV0dXJuIHByb2Nlc3NJbmNsdWRlcyhodG1sLCBpbmRleFBhdGgsIG5ldyBTZXQoW2luZGV4UGF0aF0pKTtcclxuICAgICAgfVxyXG4gICAgfSxcclxuXHJcbiAgICB2aXN1YWxpemVyKHtcclxuICAgICAgZmlsZW5hbWU6ICdzdGF0cy5odG1sJyxcclxuICAgICAgdGVtcGxhdGU6ICduZXR3b3JrJyxcclxuICAgICAgb3BlbjogdHJ1ZSxcclxuICAgICAgZ3ppcFNpemU6IHRydWUsXHJcbiAgICAgIGJyb3RsaVNpemU6IHRydWUsXHJcbiAgICAgIGpzb246IHRydWVcclxuICAgIH0pXHJcbiAgXVxyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiO0FBQThTLFNBQVMsb0JBQW9CO0FBQzNVLE9BQU8sUUFBUTtBQUNmLE9BQU8sVUFBVTtBQUNqQixTQUFTLGtCQUFrQjtBQUgzQixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsRUFDTixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsRUFDZDtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1A7QUFBQSxNQUNFLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQTtBQUFBLE1BQ1QsbUJBQW1CLE1BQU07QUFDdkIsaUJBQVMsZ0JBQWdCLFNBQVMsYUFBYSxTQUFTO0FBQ3RELGlCQUFPLFFBQVE7QUFBQSxZQUNiO0FBQUEsWUFDQSxDQUFDLE9BQU8sYUFBYTtBQUNuQixvQkFBTSxXQUFXLEtBQUssUUFBUSxLQUFLLFFBQVEsV0FBVyxHQUFHLFNBQVMsS0FBSyxDQUFDO0FBRXhFLGtCQUFJLFFBQVEsSUFBSSxRQUFRLEdBQUc7QUFDekIsd0JBQVEsS0FBSywyQ0FBaUMsUUFBUSxFQUFFO0FBQ3hELHVCQUFPLGdCQUFnQixRQUFRO0FBQUEsY0FDakM7QUFFQSxrQkFBSSxDQUFDLEdBQUcsV0FBVyxRQUFRLEdBQUc7QUFDNUIsd0JBQVEsS0FBSyx3Q0FBOEIsUUFBUSxFQUFFO0FBQ3JELHVCQUFPLGdCQUFnQixRQUFRO0FBQUEsY0FDakM7QUFFQSxvQkFBTSxXQUFXLEdBQUcsYUFBYSxVQUFVLE9BQU87QUFDbEQsc0JBQVEsSUFBSSxRQUFRO0FBQ3BCLHFCQUFPLGdCQUFnQixVQUFVLFVBQVUsT0FBTztBQUFBLFlBQ3BEO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFFQSxjQUFNLFlBQVksS0FBSyxRQUFRLGtDQUFXLFlBQVk7QUFDdEQsZUFBTyxnQkFBZ0IsTUFBTSxXQUFXLG9CQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUFBLE1BQzlEO0FBQUEsSUFDRjtBQUFBLElBRUEsV0FBVztBQUFBLE1BQ1QsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsWUFBWTtBQUFBLE1BQ1osTUFBTTtBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0g7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
