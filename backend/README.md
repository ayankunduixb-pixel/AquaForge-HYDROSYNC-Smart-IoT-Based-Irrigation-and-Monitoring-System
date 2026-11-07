# HYDROSYNC backend

Node.js 20+ (tested with Node.js 24), Express, MQTT, SQLite via
`better-sqlite3`, Socket.IO, and a locally vendored Chart.js dashboard.

```text
copy .env.example .env
npm install
npm test
npm start
```

Open `http://localhost:3000`. The server binds to `0.0.0.0` by default; set
`HOST=127.0.0.1` in `.env` to restrict it to this machine.

See `../documentation/INSTALLATION.md` for the full setup and
`../documentation/TEST_PLAN.md` for acceptance tests.
