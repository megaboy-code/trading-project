// notification/notification.ts
// 🔔 NOTIFICATION MODULE - Toast & Alert System (TypeScript)

import {
    NotificationOptions,
    NotificationAction,
    ToastNotification,
    TradeData,
    AlertData,
    INotificationUI
} from './notification-types';

import { NotificationPayload } from '../generated/MegaFlowzDecoder';

export class NotificationModule {
    private notifications: ToastNotification[] = [];
    private unreadCount: number = 0;
    private audioEnabled: boolean = false;
    private maxNotifications: number = 50;
    private activeToastTimeouts: Map<string, any> = new Map();
    private ui: INotificationUI | null = null;
    private sounds: { [key: string]: () => void } = {};
    private toastContainer: HTMLElement | null = null;

    constructor() {
        console.log("🔔 Notification Module Initialized");
        this.sounds = {
            success: this.createSound(800, 1000),
            error: this.createSound(400, 600, 0.2),
            warning: this.createSound(600, 800, 0.15),
            info: this.createSound(500, 700, 0.1)
        };
    }

    // ==================== UI INJECTION ====================

    public setUI(ui: INotificationUI): void {
        this.ui = ui;
        console.log('✅ NotificationUI injected into NotificationModule');
    }

    // ==================== INITIALIZATION ====================

    public initialize(): void {
        console.log("🔄 Initializing Notification Module...");

        if (!this.ui) {
            console.error('❌ UI not set! Call setUI() before initialize()');
            return;
        }

        this.ui.initialize();
        this.setupToastContainer();
        this.setupSoundToggle();
        this.setupMarkAllRead();
        this.loadNotifications();
        this.updateBadge();
        this.requestNotificationPermission();

        console.log("✅ Notification Module Ready");
    }

    // ==================== TOAST CONTAINER ====================

    private setupToastContainer(): void {
        this.toastContainer = document.getElementById('notificationToastContainer');

        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'notification-toast-container';
            this.toastContainer.id = 'notificationToastContainer';
            document.body.appendChild(this.toastContainer);
        }

        console.log('✅ Toast container ready');
    }

    // ==================== SOUND TOGGLE ====================

    private setupSoundToggle(): void {
        const soundToggle = document.getElementById('notificationSoundToggle');
        if (!soundToggle) return;

        const saved = localStorage.getItem('notificationSoundEnabled');
        if (saved === 'true') {
            this.audioEnabled = true;
            soundToggle.classList.add('active');
            soundToggle.querySelector('i')?.classList.replace('fa-volume-xmark', 'fa-volume-high');
        }

        soundToggle.addEventListener('click', () => {
            this.audioEnabled = !this.audioEnabled;
            localStorage.setItem('notificationSoundEnabled', this.audioEnabled.toString());

            const icon = soundToggle.querySelector('i');
            if (this.audioEnabled) {
                soundToggle.classList.add('active');
                icon?.classList.replace('fa-volume-xmark', 'fa-volume-high');
            } else {
                soundToggle.classList.remove('active');
                icon?.classList.replace('fa-volume-high', 'fa-volume-xmark');
            }

            console.log(`🔔 Sound ${this.audioEnabled ? 'enabled' : 'disabled'}`);
        });

        console.log('✅ Sound toggle ready');
    }

    // ==================== MARK ALL READ ====================

    private setupMarkAllRead(): void {
        const btn = document.getElementById('markAllRead');
        if (!btn) return;
        btn.addEventListener('click', () => this.markAllAsRead());
    }

    // ==================== FLATBUFFER NOTIFICATION HANDLER ====================

    public notify(data: NotificationPayload): void {
        const severityMap: Record<number, 'success' | 'error' | 'warning' | 'info'> = {
            0: 'success',
            1: 'warning',
            2: 'error',
            3: 'info'
        };

        const type = severityMap[data.severity as number] ?? 'info';

        // ✅ FIX: direction is already 'BUY' | 'SELL' string from decoder
        const directionStr = data.direction;

        let detailLine = '';
        if (data.symbol) {
            detailLine = `${directionStr} ${data.volume?.toFixed(2)}L ${data.symbol} @ ${data.price?.toFixed(5)}`;
            if (data.open_price && data.open_price > 0) {
                detailLine += ` | open ${data.open_price?.toFixed(5)}`;
            }
        }

        let pnlLine = '';
        if (data.profit !== undefined && data.profit !== 0) {
            const isProfit = data.profit > 0;
            const sign     = isProfit ? '+' : '';
            const arrow    = isProfit ? '▲' : '▼';
            const cls      = isProfit ? 'profit' : 'loss';
            pnlLine = `<span class="toast-pnl ${cls}">${arrow} ${sign}$${Math.abs(data.profit).toFixed(2)} USD</span>`;
        }

        const message = [detailLine, pnlLine].filter(Boolean).join('<br>');

        this.show(
            message || data.message || '',
            type,
            5000,
            { title: data.title || this.getDefaultTitle(type) }
        );
    }

    // ==================== NOTIFICATION CREATION ====================

    public show(
        message: string,
        type: 'success' | 'error' | 'warning' | 'info' = 'info',
        duration: number = 5000,
        options: NotificationOptions = {}
    ): string {

        const now = Date.now();
        const isDuplicate = this.notifications.some(n =>
            n.message === message &&
            n.type === type &&
            (now - n.timestamp) < 2000
        );

        if (isDuplicate) {
            console.log(`🔔 Duplicate notification blocked: ${message}`);
            return '';
        }

        const notification: ToastNotification = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            type,
            message,
            title: options.title || this.getDefaultTitle(type),
            timestamp: Date.now(),
            read: false,
            persistent: options.persistent || false,
            action: options.action || null,
            data: options.data || {}
        };

        this.notifications.unshift(notification);

        if (this.notifications.length > this.maxNotifications) {
            this.notifications = this.notifications.slice(0, this.maxNotifications);
        }

        this.updateUnreadCount();
        this.ui?.updateBadgeCount(this.unreadCount);
        this.updateNotificationList();
        this.showToast(notification, duration);

        if (this.audioEnabled && options.sound !== false) {
            this.playSound(type);
        }

        if (options.browserNotification !== false && document.hidden) {
            this.showBrowserNotification(notification);
        }

        this.saveNotifications();

        console.log(`🔔 ${type.toUpperCase()}: ${message}`);

        return notification.id;
    }

    // ==================== TOAST ====================

    private showToast(notification: ToastNotification, duration: number): void {
        if (!this.toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `notification-toast ${notification.type}`;
        toast.id = `toast-${notification.id}`;

        const icon = this.getIcon(notification.type);

        // ── Parse structured message parts ──
        const parts     = notification.message.split('<br>');
        const tradeLine = parts[0] || '';
        const pnlRaw    = parts[1] || '';

        // ── Detect direction for rich badge ──
        const isBuy      = tradeLine.startsWith('BUY');
        const isSell     = tradeLine.startsWith('SELL');
        const isTradeMsg = isBuy || isSell;

        let directionHTML = '';
        let tradeBodyHTML = '';
        let pnlHTML       = '';

        if (isTradeMsg) {
            const dirClass   = isBuy ? 'buy' : 'sell';
            const dirLabel   = isBuy ? 'BUY' : 'SELL';
            const dirArrow   = isBuy ? '▲' : '▼';

            // Strip direction prefix from trade line for detail
            const detail = tradeLine.replace(/^(BUY|SELL)\s*/, '');

            directionHTML = `
                <div class="toast-direction-row">
                    <span class="toast-dir-badge ${dirClass}">${dirArrow} ${dirLabel}</span>
                    <span class="toast-trade-line">${detail}</span>
                </div>
            `;

            if (pnlRaw) {
                // Extract value from span if present
                const match = pnlRaw.match(/class="toast-pnl (\w+)">(.*?)<\/span>/);
                if (match) {
                    const cls   = match[1]; // profit | loss
                    const value = match[2]; // e.g. ▲ +$125.00 USD
                    const arrow = cls === 'profit' ? '▲' : '▼';
                    // Remove arrow from value if already inside
                    const cleanVal = value.replace(/^[▲▼]\s*/, '');
                    pnlHTML = `
                        <div class="toast-pnl-row">
                            <span class="toast-pnl-arrow ${cls}">${arrow}</span>
                            <span class="toast-pnl ${cls}">${cleanVal}</span>
                        </div>
                    `;
                } else {
                    pnlHTML = `<div class="toast-pnl-row">${pnlRaw}</div>`;
                }
            }
        } else {
            // Plain message toast
            tradeBodyHTML = `<div class="toast-message">${notification.message}</div>`;
        }

        toast.innerHTML = `
            <div class="toast-header">
                <div class="toast-icon"><i class="fas fa-${icon}"></i></div>
                <div class="toast-title">${notification.title}</div>
                ${notification.action
                    ? `<button class="toast-action-btn" data-notification-id="${notification.id}">
                           <i class="fas fa-bolt"></i>
                       </button>`
                    : ''}
                <button class="toast-close-btn" data-notification-id="${notification.id}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="toast-body">
                ${directionHTML}
                ${tradeBodyHTML}
                ${pnlHTML}
                <div class="toast-time">Just now</div>
            </div>
            <div class="toast-progress">
                <div class="toast-progress-fill"></div>
            </div>
        `;

        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        if (!notification.persistent) {
            const timeoutId = setTimeout(() => {
                this.removeToast(notification.id);
            }, duration) as any;
            this.activeToastTimeouts.set(notification.id, timeoutId);
        }

        toast.querySelector('.toast-close-btn')?.addEventListener('click', (e: Event) => {
            e.stopPropagation();
            this.removeToast(notification.id);
        });

        if (notification.action) {
            toast.querySelector('.toast-action-btn')?.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                this.triggerAction(notification);
                this.removeToast(notification.id);
            });
        }

        toast.addEventListener('click', (e) => {
            if (
                !(e.target as Element).closest('.toast-close-btn') &&
                !(e.target as Element).closest('.toast-action-btn')
            ) {
                this.ui?.showModal();
                this.markAsRead(notification.id);
            }
        });
    }

    private removeToast(id: string): void {
        const toast = document.getElementById(`toast-${id}`);
        if (toast) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }

        const timeoutId = this.activeToastTimeouts.get(id);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.activeToastTimeouts.delete(id);
        }
    }

    private removeNotification(id: string): void {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.updateUnreadCount();
        this.ui?.updateBadgeCount(this.unreadCount);
        this.updateNotificationList();
        this.removeToast(id);
        this.saveNotifications();
    }

    // ==================== NOTIFICATION TYPES ====================

    public success(message: string, options: NotificationOptions = {}): string {
        return this.show(message, 'success', 4000, { title: 'Success', ...options });
    }

    public error(message: string, options: NotificationOptions = {}): string {
        return this.show(message, 'error', 6000, { title: 'Error', persistent: false, ...options });
    }

    public warning(message: string, options: NotificationOptions = {}): string {
        return this.show(message, 'warning', 5000, { title: 'Warning', ...options });
    }

    public info(message: string, options: NotificationOptions = {}): string {
        return this.show(message, 'info', 4000, { title: 'Information', ...options });
    }

    public tradeExecuted(tradeData: TradeData): string {
        const direction = tradeData.direction === 'LONG' ? 'BUY' : 'SELL';
        const dirClass  = tradeData.direction === 'LONG' ? 'dir-buy' : 'dir-sell';

        let pnlPart = '';
        if (tradeData.pnl) {
            const isProfit = tradeData.pnl >= 0;
            const sign     = isProfit ? '+' : '';
            const arrow    = isProfit ? '▲' : '▼';
            const cls      = isProfit ? 'profit' : 'loss';
            pnlPart = `<br><span class="toast-pnl ${cls}">${arrow} ${sign}$${Math.abs(tradeData.pnl).toFixed(2)} USD</span>`;
        }

        return this.show(
            `<span class="${dirClass}">${direction}</span> ${tradeData.symbol} ${tradeData.volume}L @ ${tradeData.entry_price}${pnlPart}`,
            'success',
            5000,
            {
                title: 'Trade Executed',
                action: {
                    label: 'View',
                    callback: () => this.openTradeDetails(tradeData)
                },
                data: { trade: tradeData }
            }
        );
    }

    public priceAlert(alertData: AlertData): string {
        return this.show(
            `${alertData.symbol} ${alertData.condition} ${alertData.price}`,
            'warning',
            6000,
            {
                title: 'Price Alert Triggered',
                persistent: true,
                sound: true,
                browserNotification: true,
                action: {
                    label: 'View Chart',
                    callback: () => this.openChart(alertData.symbol)
                }
            }
        );
    }

    public systemAlert(
        title: string,
        message: string,
        type: 'success' | 'error' | 'warning' | 'info' = 'info'
    ): string {
        return this.show(message, type, 5000, {
            title,
            persistent: type === 'error',
            sound: type === 'error'
        });
    }

    // ==================== NOTIFICATION MANAGEMENT ====================

    public markAsRead(id: string): void {
        const notification = this.notifications.find(n => n.id === id);
        if (notification && !notification.read) {
            notification.read = true;
            this.updateUnreadCount();
            this.ui?.updateBadgeCount(this.unreadCount);
            this.saveNotifications();
            this.updateNotificationList();
        }
    }

    public markAllAsRead(): void {
        this.notifications.forEach(n => n.read = true);
        this.unreadCount = 0;
        this.ui?.updateBadgeCount(0);
        this.saveNotifications();
        this.updateNotificationList();
    }

    public clearAll(): void {
        if (this.notifications.length === 0) return;

        this.activeToastTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeToastTimeouts.clear();

        this.notifications = [];
        this.unreadCount = 0;
        this.ui?.updateBadgeCount(0);
        this.updateNotificationList();
        this.saveNotifications();

        document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());
    }

    public clearRead(): void {
        this.notifications.forEach(notification => {
            if (notification.read) {
                const timeoutId = this.activeToastTimeouts.get(notification.id);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.activeToastTimeouts.delete(notification.id);
                }
                this.removeToast(notification.id);
            }
        });

        this.notifications = this.notifications.filter(n => !n.read);
        this.updateUnreadCount();
        this.ui?.updateBadgeCount(this.unreadCount);
        this.updateNotificationList();
        this.saveNotifications();
    }

    public getUnread(): ToastNotification[] {
        return this.notifications.filter(n => !n.read);
    }

    public getRecent(count: number = 10): ToastNotification[] {
        return this.notifications.slice(0, count);
    }

    // ==================== UI UPDATES ====================

    public updateNotificationList(): void {
        const notificationList = document.getElementById('notificationList');
        if (!notificationList) return;

        // ── Update badge in header ──
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = String(this.unreadCount);
            badge.style.display = this.unreadCount > 0 ? 'inline-flex' : 'none';
        }

        // ── Update footer count ──
        const countEl = document.querySelector('.notification-count');
        if (countEl) {
            countEl.textContent = `${this.notifications.length} total · ${this.unreadCount} unread`;
        }

        if (this.notifications.length === 0) {
            notificationList.innerHTML = `
                <div class="notification-item empty">
                    <div class="notification-icon info">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notification-title">No notifications</div>
                        <div class="notification-text">You're all caught up!</div>
                    </div>
                </div>
            `;
            return;
        }

        let html = '';
        this.notifications.forEach(notification => {
            const timeAgo   = this.formatTimeAgo(notification.timestamp);
            const readClass = notification.read ? 'read' : 'unread';
            const icon      = this.getIcon(notification.type);

            // ── Split trade line and pnl ──
            const parts     = notification.message.split('<br>');
            const tradeLine = parts[0] || '';
            const pnlPart   = parts[1] || '';

            html += `
                <div class="notification-item ${notification.type} ${readClass}" data-id="${notification.id}">
                    <div class="notif-icon ${notification.type}">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notification-title">${notification.title}</div>
                        ${tradeLine ? `<div class="notification-text">${tradeLine}</div>` : ''}
                        ${pnlPart   ? `<div class="notif-pnl-line">${pnlPart}</div>` : ''}
                        <div class="notification-time">${timeAgo}</div>
                    </div>
                    <div class="notification-actions">
                        <button class="notification-mark-read" data-id="${notification.id}" title="Mark read">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="notification-dismiss" data-id="${notification.id}" title="Dismiss">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        notificationList.innerHTML = html;

        notificationList.querySelectorAll('.notification-mark-read').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (id) this.markAsRead(id);
            });
        });

        notificationList.querySelectorAll('.notification-dismiss').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (id) this.removeNotification(id);
            });
        });

        notificationList.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!(e.target as Element).closest('.notification-actions')) {
                    const id = item.getAttribute('data-id');
                    if (id) this.showNotificationDetails(id);
                }
            });
        });
    }

    public updateBadge(): void {
        this.ui?.updateBadgeCount(this.unreadCount);
    }

    // ==================== UTILITY METHODS ====================

    private getDefaultTitle(type: string): string {
        const titles: { [key: string]: string } = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };
        return titles[type] || 'Notification';
    }

    private getIcon(type: string): string {
        const icons: { [key: string]: string } = {
            success: 'check',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    private formatTimeAgo(timestamp: number): string {
        const now  = Date.now();
        const diff = now - timestamp;

        if (diff < 60000)    return 'Just now';
        if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return new Date(timestamp).toLocaleDateString();
    }

    private createSound(freqStart: number, freqEnd: number, duration: number = 0.1): () => void {
        return () => {
            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator   = audioContext.createOscillator();
                const gainNode     = audioContext.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                oscillator.frequency.setValueAtTime(freqStart, audioContext.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(freqEnd, audioContext.currentTime + duration);

                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + duration);
            } catch (error) {
                console.log('Sound not supported:', error);
            }
        };
    }

    private playSound(type: string): void {
        if (this.sounds[type]) this.sounds[type]();
    }

    private toggleSound(enabled: boolean): void {
        this.audioEnabled = enabled;
        localStorage.setItem('notificationSoundEnabled', enabled.toString());
    }

    // ==================== BROWSER NOTIFICATIONS ====================

    private requestNotificationPermission(): void {
        if (!("Notification" in window)) return;
        if (Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
                console.log("Notification permission:", permission);
            });
        }
    }

    private showBrowserNotification(notification: ToastNotification): void {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") return;

        const browserNotification = new Notification(notification.title, {
            body: notification.message.replace(/<[^>]*>/g, ''),
            icon: '/favicon.ico',
            tag: 'megaflowz-notification',
            requireInteraction: notification.persistent || false,
            silent: !this.audioEnabled
        });

        browserNotification.onclick = () => {
            window.focus();
            this.ui?.showModal();
            this.markAsRead(notification.id);
        };

        if (!notification.persistent) {
            setTimeout(() => browserNotification.close(), 6000);
        }
    }

    // ==================== ACTION HANDLERS ====================

    private triggerAction(notification: ToastNotification): void {
        if (notification.action?.callback) {
            notification.action.callback(notification.data);
        }
    }

    private openTradeDetails(tradeData: TradeData): void {
        console.log('Opening trade details:', tradeData);
        if ((window as any).MegaFlowzDashboard?.showTradeDetails) {
            (window as any).MegaFlowzDashboard.showTradeDetails(tradeData);
        }
    }

    private openChart(symbol: string): void {
        console.log('Opening chart for:', symbol);
        if ((window as any).MegaFlowzDashboard?.chart) {
            (window as any).MegaFlowzDashboard.chart.switchSymbol(symbol);
        }
    }

    private showNotificationDetails(id: string): void {
        const notification = this.notifications.find(n => n.id === id);
        if (!notification) return;
        console.log('Notification details:', notification);
    }

    // ==================== PERSISTENCE ====================

    private saveNotifications(): void {
        try {
            localStorage.setItem('megaflowz_notifications', JSON.stringify(this.notifications));
        } catch (error) {
            console.error('Failed to save notifications:', error);
        }
    }

    private loadNotifications(): void {
        try {
            const saved = localStorage.getItem('megaflowz_notifications');
            if (saved) {
                this.notifications = JSON.parse(saved);
                this.updateUnreadCount();
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }

    private updateUnreadCount(): void {
        this.unreadCount = this.notifications.filter(n => !n.read).length;
    }

    // ==================== PUBLIC API ====================

    public enableSound(): void  { this.toggleSound(true); }
    public disableSound(): void { this.toggleSound(false); }
    public setMaxNotifications(max: number): void { this.maxNotifications = max; }

    public getStats(): {
        total: number;
        unread: number;
        read: number;
        types: { [key: string]: number };
    } {
        return {
            total: this.notifications.length,
            unread: this.unreadCount,
            read: this.notifications.length - this.unreadCount,
            types: {
                success: this.notifications.filter(n => n.type === 'success').length,
                error:   this.notifications.filter(n => n.type === 'error').length,
                warning: this.notifications.filter(n => n.type === 'warning').length,
                info:    this.notifications.filter(n => n.type === 'info').length
            }
        };
    }

    // ==================== UI DELEGATION ====================

    public toggleModal(): void  { this.ui?.toggleModal(); }
    public showModal(): void    { this.ui?.showModal(); this.updateNotificationList(); }
    public hideModal(): void    { this.ui?.hideModal(); }
    public closeAllModals(): void { this.ui?.closeAllModals(); }

    // ==================== CLEANUP ====================

    public destroy(): void {
        console.log('🧹 Cleaning up Notification Module...');

        this.activeToastTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.activeToastTimeouts.clear();

        this.ui?.destroy();

        document.querySelectorAll('.notification-toast').forEach(toast => toast.remove());

        if (this.toastContainer) {
            this.toastContainer.remove();
            this.toastContainer = null;
        }

        this.notifications = [];
        this.unreadCount   = 0;
        this.ui            = null;

        console.log('✅ Notification Module cleanup complete');
    }
}