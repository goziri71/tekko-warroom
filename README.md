# Tekko Revenue War Room

Complete admin dashboard for Tekko fintech platform with real-time MRR monitoring, system guardian, and AI voice assistant.

## Features

- **Live Revenue Intelligence** — Real-time MRR, daily revenue, active users, churn tracking
- **4 Product Streams** — Swap, Gift Cards, Virtual Cards, Transfers fully wired
- **System Guardian** — Monitors stuck transactions, failed swaps, missing funds
- **AI Voice Assistant** — Ask anything about your revenue, get instant answers
- **SSE Live Updates** — Real-time data streaming from backend
- **Secure Auth** — JWT + 2FA required, 15-minute sessions

## Tech Stack

- Pure HTML/CSS/JavaScript (no framework)
- Chart.js for visualizations
- Web Speech API for voice
- Claude API for AI assistant

## Deployment

### Deploy to Vercel

1. Push this repo to GitHub
2. Import to Vercel
3. Deploy
4. Done — your war room is live

### Environment Variables

No environment variables needed. The backend URL is hardcoded to:
```
https://zxchange.onrender.com
```

To change it, edit `app.js` line 4:
```javascript
const BASE = 'https://your-backend-url.com';
```

## File Structure

```
tekko-warroom/
├── index.html       # Main HTML structure
├── style.css        # All styles
├── app.js           # Complete application logic
├── vercel.json      # Vercel deployment config
└── README.md        # This file
```

## Backend Requirements

Your Fastify backend must have these endpoints:

- `POST /auth/login` — Returns JWT + user
- `GET /api/v1/admin/metrics/overview` — Total MRR, revenue, users, churn
- `GET /api/v1/admin/metrics/swap` — Swap revenue & metrics
- `GET /api/v1/admin/metrics/giftcards` — Gift card revenue & metrics
- `GET /api/v1/admin/metrics/virtualcards` — Virtual card revenue & metrics
- `GET /api/v1/admin/metrics/transfers` — Transfer revenue & metrics
- `GET /api/v1/admin/metrics/wallet` — Wallet balances & flow
- `GET /api/v1/admin/metrics/users` — User growth & retention
- `GET /api/v1/admin/metrics/health` — System health check
- `GET /api/v1/admin/metrics/stream` — SSE live stream (query param: `access_token`)

All `/metrics/*` endpoints require:
- `Authorization: Bearer <token>` header
- Admin or super_admin role
- 2FA enabled on account

## Usage

1. Navigate to your deployed URL
2. Log in with admin credentials + 2FA code
3. War room loads with live data
4. Use voice or type to ask the AI questions
5. Click tabs to explore each product stream
6. Guardian tab shows system health and stuck transactions

## Voice Commands

- "What is my current MRR?"
- "Which product earns the most?"
- "Give me a full revenue summary"
- "Is churn a concern?"
- "Any stuck transactions?"

## License

Proprietary — Tekko internal use only.
