import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function readPackageVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return (parsed.version ?? '1.0.0').trim() || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function createAutoUpdateManifestPlugin(): Plugin {
  const versionName = (process.env.VITE_APP_VERSION_NAME || readPackageVersion()).trim();
  const parsedCode = Number.parseInt(process.env.VITE_APP_VERSION_CODE || '1', 10);
  const versionCode = Number.isFinite(parsedCode) && parsedCode >= 1 ? parsedCode : 1;
  const githubOwnerRepo = (process.env.VITE_GITHUB_REPO || '').trim();
  const commitSha = (process.env.VITE_BUILD_COMMIT_SHA || '').trim();
  const releaseNotes = (process.env.VITE_BUILD_RELEASE_NOTES || '').trim();
  const builtAt = process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString();
  const stamp = `${versionName}-c${versionCode}-${commitSha.slice(0, 7) || 'local'}`;

  return {
    name: 'quick-quiz-auto-update-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const versionPayload = {
        appName: 'Quick Quiz',
        packageName: 'com.aistudio.std10quiz.kqxmtv',
        versionName,
        versionCode,
        githubOwnerRepo,
        commitSha,
        releaseNotes,
        builtAt,
      };
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(versionPayload, null, 2),
      });

      const swAsset = bundle['sw.js'];
      if (swAsset && swAsset.type === 'asset' && typeof swAsset.source === 'string') {
        swAsset.source = swAsset.source.replace('__QUICK_QUIZ_SW_STAMP__', stamp);
      }
    },
    closeBundle() {
      const distSwPath = path.resolve(__dirname, 'dist', 'sw.js');
      if (fs.existsSync(distSwPath)) {
        const content = fs.readFileSync(distSwPath, 'utf8');
        if (content.includes('__QUICK_QUIZ_SW_STAMP__')) {
          fs.writeFileSync(
            distSwPath,
            content.replace('__QUICK_QUIZ_SW_STAMP__', stamp),
            'utf8'
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), createAutoUpdateManifestPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('lucide-react')) return 'lucide-vendor';
            if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
});
