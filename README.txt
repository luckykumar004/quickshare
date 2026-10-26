# QuickShare All-in-One

## Run locally on Windows
1. Install Node.js.
2. Open this folder in CMD/Terminal.
3. Run `npm install`
4. Run `npm start`
5. On this laptop open `http://localhost:8787`. Other devices on the same Wi-Fi open the network URL shown in the terminal.

## Modes
- Same Wi-Fi: uploads files to the computer running this server.
- Direct P2P demo: open the page on two devices, enter the exact same room code, click Connect room on both, wait for "Direct peer connected", then choose a file under the P2P section.
- Internet use: deploy this Node app to a public host that supports WebSockets and HTTPS. Both devices must open that same HTTPS URL. STUN-only WebRTC may fail on restrictive NATs; reliable support may require a TURN service.

## Important limitations
This is a starter/demo, not production-ready public file-sharing software. Room codes are not authentication. Add authentication, authorization, rate limits, storage quotas, cleanup/expiry, logging, malware/abuse controls, and a TURN provider before public launch. Do not upload sensitive files to a public deployment until it is secured. Files uploaded in the local section are stored in `shared-files` on the server and are not automatically shared to another server.
