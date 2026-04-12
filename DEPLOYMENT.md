# Deployment Guide

This document covers deploying both the frontend and backend components of the Brownout Schedule Checker.

## Frontend (Vercel)

Frontend is already set up for Vercel. To redeploy with latest changes:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Find your brownout-schedule-checker project
3. Set environment variables:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-key
   VITE_API_BASE_URL=https://your-backend-domain.com  # Set after deploying backend
   VITE_ADMIN_KEY=your-secret-admin-key
   ```
4. Redeploy (Settings → Deployments → Deploy)

## Backend (Flask + Scraper)

### Option A: Deploy to Render (Recommended)

1. **Create Render account** at https://render.com

2. **Connect GitHub**
   - Click "New" → "Web Service"
   - Connect your GitHub account
   - Select the brownout-schedule-checker repository

3. **Configure deployment**
   - **Name**: brownout-schedule-checker-api
   - **Environment**: Python 3.11
   - **Build command**: `pip install -r backend/requirements.txt`
   - **Start command**: `cd backend && gunicorn app:app`
   - **Plan**: Free tier (fine for manual + scheduled usage)

4. **Set environment variables** in Render dashboard
   ```
   GEMINI_API_KEY=your-gemini-api-key
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   FLASK_ENV=production
   ```

5. **Update Vercel**: Set `VITE_API_BASE_URL` to your Render URL (e.g., https://brownout-schedule-checker-api.onrender.com)

### Option B: Deploy to Railway

1. **Create Railway account** at https://railway.app

2. **Connect GitHub**
   - Click "New Project" → "Deploy from GitHub repo"
   - Authorize and select repository

3. **Configure**
   - Railway will auto-detect Python/Flask
   - Set **start command**: `cd backend && gunicorn app:app`

4. **Set environment variables** (Railway dashboard)
   ```
   GEMINI_API_KEY=your-gemini-api-key
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   FLASK_ENV=production
   ```

5. **Update Vercel**: Set `VITE_API_BASE_URL` to your Railway URL

---

## GitHub Actions Scheduled Scraper (Automatic)

The repository now includes a GitHub Actions workflow that automatically scrapes notices at **12:00 AM UTC daily**.

### Setup

1. **Go to repository Settings** → **Secrets and variables** → **Actions**

2. **Add these secrets**:
   - `GEMINI_API_KEY`: Your Google Gemini API key
   - `SUPABASE_URL`: Your Supabase URL
   - `SUPABASE_KEY`: Your Supabase anon key

3. **Verify workflow**:
   - Go to **Actions** tab
   - See "Daily Brownout Notice Scraper" workflow
   - It will run automatically at 12 AM UTC
   - You can also click "Run workflow" to test manually

### Timezone Adjustment

The default schedule is 12:00 AM **UTC**. To adjust for your timezone:

Edit `.github/workflows/scraper.yml` line 10:
- **Manila (UTC+8)**: Change `0 0` to `16 0` (4 PM previous day in UTC)
- **Other timezones**: Use [crontab.guru](https://crontab.guru) to convert

---

## Admin Manual Trigger

The web app includes an admin panel accessible via:
```
https://your-vercel-app.vercel.app?admin=your-secret-admin-key
```

**To manually trigger a scrape:**
1. Visit the admin URL with your secret key
2. Click "Fetch New Notices" button
3. The app will call your deployed Flask backend to run the scraper

---

## Testing Deployments

### Test GitHub Actions Workflow
1. Go to repository **Actions** tab
2. Click "Daily Brownout Notice Scraper"
3. Click "Run workflow"
4. Monitor the run status

### Test Backend API
```bash
# Verify it's running
curl https://your-backend-domain.com/

# Manually trigger scraper (requires proper auth in production)
curl -X POST https://your-backend-domain.com/api/notices
```

### Test Admin Panel
1. Visit: `https://your-app.vercel.app?admin=your-secret-key`
2. You should see admin panel at bottom
3. Click "Fetch New Notices" to test manual triggering

---

## Troubleshooting

### GitHub Actions fails
- Check secrets are set correctly (Settings → Secrets)
- Review error logs in Actions tab
- Verify `GEMINI_API_KEY` is valid

### Backend won't start
- Ensure `Procfile` exists and has correct command
- Check environment variables are set on your platform
- Review deployment logs for errors

### Admin panel doesn't appear
- Verify `VITE_ADMIN_KEY` is set in Vercel env vars
- Double-check URL parameter: `?admin=` matches `VITE_ADMIN_KEY` value
- Redeploy after changing env vars

### Scraper doesn't fetch new notices
- Verify Supabase credentials in backend env vars
- Check ZANECO website is accessible (not blocked)
- Review backend logs for errors

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Vercel (frontend) | Free tier included |
| Render/Railway (backend) | Free tier (~1 GB RAM, auto-sleep) |
| GitHub Actions | Free for public repos |
| Supabase | Free tier (includes 1GB storage) |
| Google Gemini | Pay-per-use (~$0.01-0.05 per image) |
| **Total** | **~$0-5/month** (if only using free tiers + minimal Gemini) |

---

## Next Steps

1. Deploy backend to Render or Railway
2. Add GitHub secrets for automated scraper
3. Update Vercel environment variables
4. Test admin panel with manual trigger
5. Verify GitHub Actions runs at 12 AM

Good luck! 🚀
