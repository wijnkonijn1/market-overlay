/**
 * Ensures Chromium/Electron DLLs (notably ffmpeg.dll) sit next to the Windows exe.
 * Used as electron-builder afterPack and as a post-build CLI check.
 *
 * Background: Market Overlay.exe imports ffmpeg.dll. If packaging or NSIS 7z
 * extraction drops PE files (e.g. incompatible BCJ2/ARM64 filters vs Nsis7z),
 * Windows shows: "ffmpeg.dll was not found" / Dutch "ffmpeg.dll niet is gevonden".
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_WIN_DLLS = [
  'ffmpeg.dll',
  'd3dcompiler_47.dll',
  'libEGL.dll',
  'libGLESv2.dll',
  'vk_swiftshader.dll',
  'vulkan-1.dll',
];

function listMissing(appOutDir) {
  return REQUIRED_WIN_DLLS.filter((name) => {
    try {
      const st = fs.statSync(path.join(appOutDir, name));
      return !(st.isFile() && st.size > 0);
    } catch {
      return true;
    }
  });
}

function findExe(appOutDir) {
  const entries = fs.readdirSync(appOutDir);
  return entries.find((n) => n.toLowerCase().endsWith('.exe') && !/^uninstall/i.test(n));
}

/**
 * electron-builder afterPack hook
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function ensureElectronWinDlls(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }
  const appOutDir = context.appOutDir;
  const exe = findExe(appOutDir);
  const missing = listMissing(appOutDir);
  if (!exe) {
    throw new Error(
      `[ensure-electron-win-dlls] No Windows .exe in ${appOutDir}. Packing failed.`,
    );
  }
  if (missing.length) {
    throw new Error(
      `[ensure-electron-win-dlls] Missing required Electron DLLs next to ${exe} in ${appOutDir}: ${missing.join(', ')}. ` +
        `Refusing to ship a broken Windows build (this causes "ffmpeg.dll niet is gevonden" on launch).`,
    );
  }
  console.log(`[ensure-electron-win-dlls] OK: ${exe} + ${REQUIRED_WIN_DLLS.join(', ')} in ${appOutDir}`);
};

/** CLI: node scripts/ensure-electron-win-dlls.cjs [dir=release/win-unpacked] */
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || 'release/win-unpacked');
  if (!fs.existsSync(dir)) {
    console.error(`[ensure-electron-win-dlls] Directory not found: ${dir}`);
    process.exit(1);
  }
  const exe = findExe(dir);
  const missing = listMissing(dir);
  if (!exe || missing.length) {
    console.error(
      `[ensure-electron-win-dlls] FAIL in ${dir}: exe=${exe || '(none)'} missing=${missing.join(', ') || '(none)'}`,
    );
    process.exit(1);
  }
  console.log(`[ensure-electron-win-dlls] OK: ${exe} + DLLs present in ${dir}`);
}
