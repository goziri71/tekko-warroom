# DEPLOYMENT INSTRUCTIONS

## Quick Deploy to Vercel

### 1. Push to GitHub

```bash
cd tekko-warroom
git init
git add .
git commit -m "Initial commit: Tekko Revenue War Room"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/tekko-warroom.git
git push -u origin main
```

### 2. Deploy on Vercel

**Option A: Via Vercel Dashboard**
1. Go to https://vercel.com
2. Click "Add New Project"
3. Import your GitHub repo `tekko-warroom`
4. Click "Deploy"
5. Done! Your war room is live

**Option B: Via Vercel CLI**
```bash
npm install -g vercel
cd tekko-warroom
vercel
```

Follow the prompts:
- Set up and deploy? `Y`
- Which scope? Select your account
- Link to existing project? `N`
- Project name? `tekko-warroom`
- Directory? `./`
- Override settings? `N`

Your war room will deploy in ~30 seconds.

---

## File Structure

```
tekko-warroom/
├── index.html       # Main page with login + war room
├── style.css        # All CSS styling
├── app.js           # Complete JavaScript logic
├── vercel.json      # Vercel routing config
├── .gitignore       # Git ignore rules
└── README.md        # Documentation
```

---

## After Deployment

1. **Get your URL** — Vercel gives you `https://tekko-warroom.vercel.app` (or custom domain)

2. **Test the login** — Use your real admin credentials from `zxchange.onrender.com`

3. **Verify all tabs work** — Click through Overview, Swap, Gift Cards, Virtual Cards, Transfers, Wallet, Users, Guardian

4. **Check the voice** — Ask the AI a question and make sure it responds

5. **Confirm SSE is live** — Watch the health dots — SSE should turn green

---

## Troubleshooting

### Login fails with "Connection error"
- Check that `https://zxchange.onrender.com` is online
- Check CORS is enabled on your Fastify backend for your Vercel domain

### 404 on metrics endpoints
- Make sure you ran the Cursor prompt to build the `/metrics` routes
- Verify they're registered in your main Fastify app

### SSE not connecting
- Check `/api/v1/admin/metrics/stream?access_token=` endpoint exists
- Verify it's not blocked by CORS

### Voice not working
- Voice requires Chrome/Edge browser
- Allow microphone access when prompted

---

## Custom Domain (Optional)

In Vercel dashboard:
1. Go to your project
2. Click "Settings" → "Domains"
3. Add your custom domain (e.g. `warroom.tekko.com`)
4. Update your DNS records as shown
5. Wait ~30 seconds for SSL to provision

---

## Backend Changes Needed

If your backend URL is NOT `https://zxchange.onrender.com`, edit `app.js` line 4:

```javascript
const BASE = 'https://your-actual-backend.com';
```

Then commit and push:
```bash
git add app.js
git commit -m "Update backend URL"
git push
```

Vercel auto-deploys the change in ~20 seconds.

---

## Security Note

The war room requires:
- Valid admin or super_admin account
- 2FA enabled on the account
- JWT token (expires in 15 minutes)

Sessions auto-logout after 15 minutes. A warning fires at 13 minutes.

---

You're all set! 🚀
