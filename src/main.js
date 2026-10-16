import { initApp } from './ui/app.js';
import { Player } from './audio/player.js';
import { safeStorage } from './audio/prefs.js';
import { VERSION } from './version.js';

const versionEl = document.getElementById('version');
versionEl.textContent = `v${VERSION}`;
versionEl.title = `Version ${VERSION}`;

initApp(document, { player: new Player(), storage: safeStorage() });
