const { BrowserWindow, shell } = require('electron');
const http = require('http');
const url = require('url');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// These should ideally be set by the user or dynamically
let clientId = '';
let clientSecret = '';

// Reusable OAuth Class
class GoogleOAuth {
  constructor() {
    this.port = 3000;
    this.redirectUri = `http://127.0.0.1:${this.port}/`;
    this.scopes = ['https://www.googleapis.com/auth/cloud-platform'];
  }

  setCredentials(id, secret) {
    clientId = id;
    clientSecret = secret;
  }

  getAuthUrl() {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline', // Request refresh token
      prompt: 'consent'       // Force consent to get refresh token
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async login(parentWindow) {
    if (!clientId || !clientSecret) {
      throw new Error("Client ID and Client Secret are not configured.");
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = url.parse(req.url, true);
          // Permitir recibir el código en la raíz
          if (reqUrl.pathname === '/') {
            const code = reqUrl.query.code;
            const error = reqUrl.query.error;

            if (error) {
              res.end('<h1>Authentication failed: ' + error + '</h1>');
              server.close();
              reject(new Error(error));
              return;
            }

            res.end('<h1>Authentication successful! You can now close this tab/window and return to Antigravity.</h1><script>window.close()</script>');
            server.close();

            // Intercambiar código por token
            const tokens = await this.exchangeCodeForToken(code);
            resolve(tokens);
          }
        } catch (e) {
          console.error(e);
          res.end('<h1>Server Error</h1>');
          server.close();
          reject(e);
        }
      });

      server.listen(this.port, '127.0.0.1', () => {
        const authUrl = this.getAuthUrl();
        
        // Open the user's default system browser (Chrome, Safari, etc.)
        shell.openExternal(authUrl);
      });
      
      server.on('error', (err) => {
          reject(err);
      });
    });
  }

  async exchangeCodeForToken(code) {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code'
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch tokens: ${errorText}`);
    }

    const data = await response.json();
    return data; // { access_token, refresh_token, expires_in, scope, token_type }
  }

  async refreshToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh token: ${errorText}`);
    }

    const data = await response.json();
    return data;
  }
}

module.exports = new GoogleOAuth();
