// Token Interceptor - Transforms raw JWT token responses into a user-friendly UI
(function() {
    // Check if the page is just a raw token
    function isRawToken() {
        // If the page has a DOCTYPE or HTML tag, it's not raw
        if (document.doctype || document.querySelector('html')) {
            return false;
        }
        
        // Get the text content of the body
        const bodyText = document.body.textContent.trim();
        
        // Check if it looks like a JWT token (three parts separated by dots)
        return bodyText.includes('.') && bodyText.split('.').length === 3;
    }
    
    // Parse JWT token
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Error parsing JWT:', e);
            return null;
        }
    }
    
    // Format date from timestamp
    function formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    }
    
    // Add styles to the page
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #f5f7fa;
                color: #333;
                line-height: 1.6;
                margin: 0;
                padding: 20px;
            }
            
            .container {
                max-width: 800px;
                margin: 30px auto;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                padding: 30px;
            }
            
            .success-icon {
                width: 80px;
                height: 80px;
                background-color: rgba(16, 185, 129, 0.1);
                color: #10b981;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 40px;
                margin: 0 auto 24px;
            }
            
            h1, h2 {
                text-align: center;
                margin-top: 0;
            }
            
            h1 {
                color: #111827;
                margin-bottom: 8px;
            }
            
            .subtitle {
                text-align: center;
                color: #6b7280;
                margin-bottom: 30px;
            }
            
            .info-box {
                background-color: #f0fdf4;
                border-left: 4px solid #10b981;
                padding: 16px;
                margin-bottom: 24px;
                border-radius: 4px;
            }
            
            .details-container {
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 24px;
            }
            
            .detail-row {
                display: flex;
                border-bottom: 1px solid #e5e7eb;
            }
            
            .detail-row:last-child {
                border-bottom: none;
            }
            
            .detail-row:nth-child(odd) {
                background-color: #f9fafb;
            }
            
            .detail-label {
                flex: 1;
                font-weight: 500;
                padding: 12px 16px;
                color: #4b5563;
            }
            
            .detail-value {
                flex: 2;
                padding: 12px 16px;
            }
            
            .token-container {
                background-color: #f1f5f9;
                padding: 16px;
                border-radius: 8px;
                position: relative;
                margin-bottom: 24px;
            }
            
            .token-text {
                font-family: monospace;
                word-break: break-all;
                white-space: pre-wrap;
                margin: 0;
                padding-right: 40px;
            }
            
            .copy-button {
                position: absolute;
                top: 8px;
                right: 8px;
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: #6b7280;
            }
            
            .copy-button:hover {
                background-color: #f9fafb;
                color: #111827;
            }
            
            .button {
                display: inline-block;
                background-color: #2563eb;
                color: white;
                padding: 10px 20px;
                border-radius: 6px;
                text-decoration: none;
                font-weight: 500;
                border: none;
                cursor: pointer;
            }
            
            .button:hover {
                background-color: #1d4ed8;
            }
            
            .button-container {
                text-align: center;
            }
            
            .toast {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                border-left: 4px solid #10b981;
                padding: 16px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                border-radius: 4px;
                display: flex;
                align-items: center;
                transform: translateY(100px);
                opacity: 0;
                transition: all 0.3s ease;
            }
            
            .toast.show {
                transform: translateY(0);
                opacity: 1;
            }
            
            .toast-icon {
                margin-right: 12px;
                color: #10b981;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Copy text to clipboard
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(
            function() {
                showToast('Token copied to clipboard!');
            },
            function(err) {
                console.error('Failed to copy: ', err);
            }
        );
    }
    
    // Show toast notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <span class="toast-icon">✓</span>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        
        // Show the toast
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // Create token UI
    function createTokenUI(token) {
        // Parse token
        const payload = parseJwt(token);
        
        // Create UI elements
        const container = document.createElement('div');
        container.className = 'container';
        
        container.innerHTML = `
            <div class="success-icon">✓</div>
            <h1>Authentication Successful</h1>
            <p class="subtitle">Your Aadhaar identity has been verified</p>
            
            <div class="info-box">
                <p>Your authentication token has been generated. This token can be used to access secure services.</p>
            </div>
            
            <h2>Authentication Details</h2>
            <div class="details-container">
                <div class="detail-row">
                    <div class="detail-label">Aadhaar UID</div>
                    <div class="detail-value">${payload?.sub || 'Not available'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Authentication Time</div>
                    <div class="detail-value">${payload?.auth_time || payload?.iat ? formatDate(payload.auth_time || payload.iat) : 'Not available'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Transaction ID</div>
                    <div class="detail-value">${payload?.txn || payload?.aadhaarTxn || 'Not available'}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Token Expiry</div>
                    <div class="detail-value">${payload?.exp ? formatDate(payload.exp) : 'Not available'}</div>
                </div>
            </div>
            
            <h2>Authentication Token</h2>
            <div class="token-container">
                <pre class="token-text">${token}</pre>
                <button class="copy-button" title="Copy token">📋</button>
            </div>
            
            <div class="button-container">
                <a href="/" class="button">Return to Home</a>
            </div>
        `;
        
        // Add event listener for copy button
        const copyButton = container.querySelector('.copy-button');
        copyButton.addEventListener('click', () => copyToClipboard(token));
        
        return container;
    }
    
    // Main function to transform the page
    function transformPage() {
        if (isRawToken()) {
            const token = document.body.textContent.trim();
            
            // Set up the page
            document.body.innerHTML = '';
            document.title = 'Authentication Successful';
            
            // Create head elements
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0';
            document.head.appendChild(meta);
            
            // Add styles
            addStyles();
            
            // Add token UI
            document.body.appendChild(createTokenUI(token));
        }
    }
    
    // Initialize when the page is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', transformPage);
    } else {
        transformPage();
    }
})(); 