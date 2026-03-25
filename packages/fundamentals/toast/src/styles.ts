/**
 * Minimal CSS for the toast container and items.
 * Injected into the DOM once when the Toaster component mounts.
 */
export const toastStyles = /* css */ `
.pyreon-toast-container {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  display: flex;
  flex-direction: column;
}

.pyreon-toast {
  pointer-events: auto;
  background: #fff;
  color: #1a1a1a;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.4;
  opacity: 1;
  transform: translateY(0);
  transition: opacity 200ms ease, transform 200ms ease, max-height 200ms ease;
  max-height: 200px;
  overflow: hidden;
}

.pyreon-toast--entering {
  opacity: 0;
  transform: translateY(-8px);
}

.pyreon-toast--exiting {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.pyreon-toast--info { border-left: 4px solid #3b82f6; }
.pyreon-toast--success { border-left: 4px solid #22c55e; }
.pyreon-toast--warning { border-left: 4px solid #f59e0b; }
.pyreon-toast--error { border-left: 4px solid #ef4444; }

.pyreon-toast__message { flex: 1; }

.pyreon-toast__action {
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  cursor: pointer;
  color: #3b82f6;
  white-space: nowrap;
}

.pyreon-toast__action:hover {
  background: #f3f4f6;
}

.pyreon-toast__dismiss {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 16px;
  color: #9ca3af;
  line-height: 1;
}

.pyreon-toast__dismiss:hover {
  color: #4b5563;
}
`
