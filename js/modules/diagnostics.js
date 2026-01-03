/**
 * GameVault Diagnostics Module
 * Provides insights into App State, Network calls, and potential issues.
 * Access via console: window.GameVaultDebug
 */

class DiagnosticsModule {
    constructor() {
        this.enabled = localStorage.getItem('gv_debug_enabled') === 'true';
        this.config = {
            traceState: true,
            traceNetwork: true,
            traceErrors: true,
            performance: true
        };
        this.logHistory = [];
        this.maxHistory = 500;

        if (this.enabled) {
            console.log("%c 🕵️ DIAGNOSTICS MODE ENABLED ", "background: #7c3aed; color: #fff; padding: 4px; border-radius: 4px; font-weight: bold;");
        }
    }

    enable() {
        this.enabled = true;
        localStorage.setItem('gv_debug_enabled', 'true');
        console.log("✅ Diagnostics Enabled. Reload to ensure full coverage.");
        return "Reload page for best results";
    }

    disable() {
        this.enabled = false;
        localStorage.setItem('gv_debug_enabled', 'false');
        console.log("❌ Diagnostics Disabled.");
    }

    /**
     * Internal Logger
     */
    _log(type, label, data, color) {
        if (!this.enabled) return;

        const timestamp = new Date().toLocaleTimeString();
        const msg = { timestamp, type, label, data };

        // History management
        this.logHistory.unshift(msg);
        if (this.logHistory.length > this.maxHistory) this.logHistory.pop();

        // Console Output
        const styles = [
            `color: ${color}`,
            'font-weight: bold',
            'padding: 2px 4px',
            'border-radius: 2px'
        ].join(';');

        console.groupCollapsed(`%c[${type}]%c ${label} @ ${timestamp}`, `background:${color}; color:white; border-radius:3px; padding:2px 5px`, 'color:inherit');
        if (data) console.dir(data);
        console.groupEnd();
    }

    /**
     * Log State Changes (Store)
     */
    logState(oldState, newState) {
        if (!this.enabled || !this.config.traceState) return;

        const changes = {};
        Object.keys(newState).forEach(key => {
            if (oldState[key] !== newState[key]) {
                changes[key] = { from: oldState[key], to: newState[key] };
            }
        });

        if (Object.keys(changes).length > 0) {
            this._log('STATE', 'Store Update', changes, '#0ea5e9'); // Blue
        }
    }

    /**
     * Log Network Calls
     */
    logNetwork(valid, method, url, duration = 0, status = 200) {
        if (!this.enabled || !this.config.traceNetwork) return;

        const color = valid ? '#22c55e' : '#ef4444'; // Green or Red
        this._log('NET', `${method} ${url} (${status}) - ${duration.toFixed(0)}ms`, null, color);
    }

    /**
     * Log Errors
     */
    logError(source, error) {
        // ALWAYS log errors, even if disabled, but formatting is nicer if enabled
        const color = '#ef4444';
        console.group(`%c 🚨 ERROR: ${source} `, `background:${color}; color:white; font-size:12px; padding:4px;`);
        console.error(error);
        if (error.stack) console.log(error.stack);
        console.groupEnd();

        // Add to history
        this.logHistory.unshift({ timestamp: new Date(), type: 'ERROR', label: source, data: error });
    }

    /**
     * Performance Mark
     */
    startTimer(label) {
        if (!this.enabled) return () => { };
        const start = performance.now();
        return () => {
            const end = performance.now();
            this._log('PERF', `${label}`, { duration: parseFloat((end - start).toFixed(2)) + 'ms' }, '#f59e0b');
        };
    }

    /**
     * Export Logs
     */
    exportLogs() {
        return JSON.stringify(this.logHistory, null, 2);
    }

    /**
     * Check for potential known issues
     */
    audit() {
        console.group("🔍 Running System Audit...");

        // check Supabase
        if (!window.supabase) console.warn("⚠️ Supabase client not found globally.");

        // check LocalStorage quotas
        let total = 0;
        for (let x in localStorage) {
            if (localStorage.hasOwnProperty(x)) {
                total += ((localStorage[x].length + x.length) * 2);
            }
        }
        const totalKb = (total / 1024).toFixed(2);
        console.log(`📦 LocalStorage Usage: ${totalKb} KB`);
        if (totalKb > 4500) console.warn("⚠️ LocalStorage nearing 5MB limit!");

        console.log("✅ Audit Complete.");
        console.groupEnd();
    }
}

export const Diagnostics = new DiagnosticsModule();
window.GameVaultDebug = Diagnostics;
