// ================================================================
// ⚡ MEGA FLOWZ - Entry Point
// ================================================================

import { ConnectionManager } from './core/connection-manager';
import { ModuleManager } from './core/module-manager';
import { HotkeyManager } from './core/hotkey-manager';
import { initializeTabManager } from './core/tab-manager';

// ================================================================
// 🎨 THEME RESTORE — must run before DOMContentLoaded
// ================================================================

(function restoreTheme(): void {
    const saved = localStorage.getItem('app-theme') || 'system';
    document.documentElement.setAttribute('data-theme', saved);
})();

// ================================================================
// 🧠 MEGA FLOWZ APP
// ================================================================

class MegaFlowzApp {
    private connectionManager!: ConnectionManager;
    private moduleManager!:     ModuleManager;
    private hotkeyManager!:     HotkeyManager;
    private isActive = false;

    constructor() {
        console.log('🧠 MEGA FLOWZ Dashboard Initialized');

        if ((window as any).megaFlowzApp) {
            console.warn('⚠️ MegaFlowzApp already exists, skipping...');
            return;
        }

        this.connectionManager = new ConnectionManager();
        this.moduleManager     = new ModuleManager(this.connectionManager);
        this.hotkeyManager     = new HotkeyManager();
        this.isActive          = true;

        (window as any).megaFlowzApp = this;

        this.initialize();
    }

    private initialize(): void {
        if (!this.isActive) return;

        console.log('🚀 Starting dashboard...');

        try {
            initializeTabManager();
            this.moduleManager.initialize();
            this.hotkeyManager.initialize();
            this.connectionManager.connect();

            console.log('✅ Dashboard started');

        } catch (error) {
            console.error('❌ Initialization failed:', error);
        }
    }

    public destroy(): void {
        if (!this.isActive) return;

        console.log('🧹 Cleaning up...');

        this.connectionManager.disconnect();
        this.hotkeyManager.disable();
        this.moduleManager.destroy();

        if ((window as any).megaFlowzApp === this) {
            delete (window as any).megaFlowzApp;
        }

        this.isActive = false;

        console.log('✅ Cleanup complete');
    }

    public isActiveInstance(): boolean {
        return this.isActive;
    }
}

// ================================================================
// 🚀 BOOTSTRAP
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    // ✅ Destroy existing instance before creating new one
    // Prevents HMR duplicate connections during development
    if ((window as any).megaFlowzApp) {
        (window as any).megaFlowzApp.destroy();
    }
    new MegaFlowzApp();
    console.log('🚀 MEGA FLOWZ TypeScript Edition Initialized');
});

// ==================== HMR ====================

if (import.meta && (import.meta as any).hot) {
    (import.meta as any).hot.dispose(() => {
        console.log('🔄 Vite HMR reloading...');
        if ((window as any).megaFlowzApp) {
            (window as any).megaFlowzApp.destroy();
        }
    });
}