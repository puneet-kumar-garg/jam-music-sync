# 🚀 Deploy JAM Music Sync for FREE

## 📋 Prerequisites
- GitHub account
- Vercel account (free)
- Netlify account (free)

## 🔧 Step 1: Prepare for Deployment

### Update Server CORS
```bash
cd server
```
Edit `index.js` and update CORS origin:
```javascript
cors: {
  origin: ["https://your-app-name.netlify.app", "http://localhost:3000"],
  methods: ["GET", "POST"]
}
```

## 🌐 Step 2: Deploy Server (Vercel)

1. **Push to GitHub:**
```bash
cd JAM
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/jam-music-sync.git
git push -u origin main
```

2. **Deploy Server:**
- Go to [vercel.com](https://vercel.com)
- Import your GitHub repo
- Set root directory to `server`
- Deploy

3. **Get Server URL:**
- Copy your Vercel URL (e.g., `https://jam-server-xyz.vercel.app`)

## 🎨 Step 3: Deploy Client (Netlify)

1. **Update Client Environment:**
```bash
cd client
```
Edit `.env.production`:
```
REACT_APP_SERVER_URL=https://your-vercel-server-url.vercel.app
```

2. **Build Client:**
```bash
npm run build
```

3. **Deploy to Netlify:**
- Go to [netlify.com](https://netlify.com)
- Drag & drop the `build` folder
- Or connect GitHub repo with build settings:
  - Build command: `cd client && npm run build`
  - Publish directory: `client/build`

## 🔄 Step 4: Update CORS

Update server CORS with your Netlify URL:
```javascript
cors: {
  origin: ["https://your-app.netlify.app"],
  methods: ["GET", "POST"]
}
```

## 🎵 Step 5: Test Live App

1. **Visit your Netlify URL**
2. **Create session as Puneet**
3. **Share system audio**
4. **Share link with friends**
5. **Everyone can join and listen together!**

## 💡 Alternative: Railway (Server)

Instead of Vercel, use Railway for better WebSocket support:

1. **Go to [railway.app](https://railway.app)**
2. **Connect GitHub repo**
3. **Set root directory to `server`**
4. **Deploy**

## 🔧 Environment Variables

### Server (Vercel/Railway):
- `PORT` (auto-set)

### Client (Netlify):
- `REACT_APP_SERVER_URL=https://your-server-url`

## 📱 Features Available:
- ✅ Real-time music sync
- ✅ System audio capture
- ✅ User management
- ✅ Mobile responsive
- ✅ Free hosting
- ✅ Custom domain support

Your JAM app is now live and free for everyone to use! 🎉