# Brownout Schedule Checker

Brownout Schedule Checker is a web app for residents of Zamboanga del Norte to quickly check if their city/municipality and barangay has a scheduled power interruption.

The system:
- Scrapes official ZANECO notice images
- Uses Gemini OCR + extraction to structure schedule data
- Saves normalized notices to Supabase
- Lets users search schedules from a mobile-friendly frontend
- Supports both scheduled daily scraping and admin-triggered manual scraping

## What This Project Does

- Reads official power interruption posts from ZANECO
- Extracts dates, times, municipality, and barangay coverage from notice images
- Stores structured notice data in Supabase
- Displays matched schedules for user-selected city and barangay
- Provides admin access to trigger immediate fetch of new notices

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Framer Motion
- Backend: Python, Flask, Gunicorn
- Data: Supabase (PostgreSQL + REST)
- AI/OCR: Google Gemini API
- Scraping/Parsing: Requests, BeautifulSoup, Pillow, RapidFuzz
- Hosting:
	- Frontend: Vercel
	- Backend API: Render (free tier)
- Automation: GitHub Actions (daily 12:00 AM Philippine Time)
- Analytics: Vercel Analytics

## Project Structure

```text
backend/
	app.py                 # Flask API (/api/notices)
	logic.py               # Scraper + OCR + extraction pipeline
	db.py                  # Supabase read/write utilities
	run_scraper.py         # Scheduled/manual scraper entry point
	requirements.txt
	frontend/              # React + Vite frontend app
```

## Environment Strategy (Dev and Prod)

Use one codebase for both development and production. Separate environments are handled by branch + environment variables.

- Local development defaults to Dev/Test values
- `dev` branch targets Dev services
- `main` branch targets Production services

### Branch to Environment Mapping

- `dev` branch:
	- Render Dev backend
	- Vercel Preview deployment
	- Dev Supabase project
- `main` branch:
	- Render Prod backend
	- Vercel Production deployment
	- Prod Supabase project

### Why This Setup

- No duplicate repositories or code copies
- Safe testing without touching production data
- Same deployment workflow you already use

### Local Development Rule

Before running locally, set your local env files to Dev values:

- `backend/.env` -> Dev Supabase + backend keys
- `backend/frontend/.env` -> Dev Vite/Supabase/backend URL values

Use `backend/.env.example` as the template for backend variables.

## Local Setup

### 1. Clone Repository

```bash
git clone https://github.com/iandotjs/brownout-schedule-checker.git
cd brownout-schedule-checker
```

### 2. Backend Setup (Python/Flask)

```bash
cd backend
python -m venv venv
```

Activate virtual environment:

- Windows PowerShell:

```powershell
venv\Scripts\Activate.ps1
```

- macOS/Linux:

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create backend `.env` file in `backend/`:

```dotenv
GEMINI_API_KEY=your-gemini-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Run backend API:

```bash
python app.py
```

Backend runs at:

```text
http://127.0.0.1:5000
```

### 3. Frontend Setup (React/Vite)

```bash
cd backend/frontend
npm install
```

Create frontend `.env` file in `backend/frontend/`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_API_BASE_URL=http://127.0.0.1:5000
VITE_ADMIN_KEY=your-secret-admin-key
```

Run frontend dev server:

```bash
npm run dev
```

Frontend runs at:

```text
http://localhost:5173
```

## Running the Scraper

- Manual run (local or CI):

```bash
cd backend
python run_scraper.py
```

- Admin web trigger:
	- Open your app with `?admin=your-secret-admin-key`
	- Click Fetch New Notices

## Deployment Summary

- Frontend deploys to Vercel
- Backend deploys to Render
- Nightly scraper runs via GitHub Actions at 12:00 AM Philippine Time

For full deployment steps and environment variables, see `DEPLOYMENT.md`.
