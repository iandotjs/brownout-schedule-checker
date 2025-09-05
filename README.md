# 📢 Zaneco Scheduled Power Interruption Checker

This project provides a simple system to **scrape notices**, save them in **Supabase**, and display them on a **React + Vite frontend**.  
It is divided into two parts:

1. **Backend** – Flask API for scraping and storing notices.
2. **Frontend** – React app to fetch and display notices.

---

## 🚀 Setup Instructions

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/notice-scraper.git
cd notice-scraper
```

---

### 2️⃣ Backend (Flask API)

#### 📌 Requirements

- Python 3.10+
- pip (Python package manager)
- Supabase project + API keys

```bash
git clone https://github.com/your-username/notice-scraper.git
cd notice-scraper
```

#### 📌 Environment Variables

- Create a **.env** file inside the backend/ folder:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

#### 📌 Install Dependencies

```bash
cd backend
python -m venv venv
# Activate venv
# macOS/Linux:
source venv/bin/activate
# Windows (PowerShell):
venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

#### 📌 Run Flask Server

```bash
python app.py
```

#### 👉 Flask will run at:

```bash
http://127.0.0.1:5000
```

---

### 3️⃣ Frontend (React + Vite)

#### 📌 Requirements

- Node.js (>=18)
- npm

#### 📌 Install Dependencies

```bash
cd frontend
npm install
```

#### 📌 Run Dev Server

```bash
npm run dev
```

#### 👉 Vite will run at:

```bash
http://localhost:5173
```

---
