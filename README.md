# Database Console & Form Management System

A production-grade, containerized full-stack application featuring a **Public Form & Career Portal** and a secured, responsive **Admin Database Console Dashboard** built with Node.js, Express, MySQL 8, and Nginx.

---

## 🌟 Key Highlights

- **Dual-Portal Architecture**:
  - **Public Form Portal (`http://localhost:5000`)**: General inquiries, demo requests, enterprise leads, and career applications with resume file upload.
  - **Admin Database Console (`http://localhost:8080`)**: Secured web dashboard with real-time MySQL synchronization, visual table schema inspector, dynamic CRUD management, and profile customization.
- **Theme Engine**: Complete **Light**, **Dark**, and **System Default** modes with instant persistence across all pages.
- **Security & Reliability First**: Built with Scrypt password hashing, timing-safe equality checks, dual-layer rate limiting, MySQL connection keep-alive pooling, and file upload sanitization.

---

## 📂 Project Structure

```text
form-management/
│
├── admin-dashboard/                     # Production Nginx Admin Web App (Port 8080)
│   ├── css/
│   │   └── app.css                      # Unified styling, Light/Dark/System themes, animations
│   ├── js/
│   │   ├── api.js                       # Centralized API client & cookie/session helpers
│   │   ├── dashboard.js                 # Overview metrics, charts, live sync & stats
│   │   ├── database-crud.js             # Visual Table CRUD manager (Create/Drop Table, Add/Drop Col)
│   │   ├── database-details.js          # In-depth database schemas, storage allocation & engine metrics
│   │   ├── login.js                     # Admin authentication & account registration
│   │   ├── settings.js                  # Profile management, password change, avatar uploads & themes
│   │   ├── shell.js                     # Global sidebar navigation, theme switcher & profile pill
│   │   ├── table-details.js             # Detailed single-table inspector & row viewer
│   │   └── tables-records.js            # Tables & records manager, search, pagination & row deletion
│   ├── public/
│   │   ├── assets/                      # Icons, logos & visual media
│   │   │   ├── crud.png
│   │   │   ├── database.png
│   │   │   ├── overview.png
│   │   │   └── table-and-records.png
│   │   ├── dashboard.html               # Main dashboard overview
│   │   ├── database-crud.html           # Database CRUD & schema management interface
│   │   ├── database-details.html        # Database details & storage breakdown
│   │   ├── login.html                   # Admin authentication portal
│   │   ├── settings.html                # Admin settings, avatar & theme preferences
│   │   ├── table-details.html           # Single table records viewer
│   │   └── tables-records.html          # Interactive tables & records browser
│   ├── .dockerignore
│   ├── Dockerfile                       # Multi-stage Nginx Alpine build
│   └── nginx.conf                       # Reverse proxy (Port 8080 -> 5000), client limits & caching
│
├── Assests/                             # Source design assets & logos
│
├── public/                              # Public Form Submission Portal (Port 5000)
│   ├── index.html                       # General submissions & career application forms
│   ├── script.js                        # Client-side form validation & submission handling
│   └── style.css                        # Responsive styling for the public portal
│
├── uploads/                             # Persistent runtime upload storage
│   ├── avatars/                         # Admin profile pictures & avatars (20MB limit)
│   └── resumes/                         # Candidate resumes & cover letters (Protected)
│
├── .dockerignore                        # Docker build exclusion rules
├── .env                                 # Environment configuration (secrets, DB, SMTP, admin credentials)
├── docker-compose.yml                   # Multi-service stack (backend, admin-dashboard, mysql, mailhog)
├── Dockerfile                           # Node.js 22 Alpine production container
├── File_structure                       # Project directory layout & component map
├── package.json                         # Node.js dependencies & scripts
├── README.md                            # Complete system documentation, architecture & guide
└── server.js                            # Express API backend, MySQL pooling, security & business logic
```

---

## 🚀 Dashboard Modules & Capabilities

### 1. Dashboard Overview (`/dashboard.html`)
- **Real-Time Database Health Donut**: Interactive SVG chart dynamically visualizing storage, table counts, and records with hover tooltips.
- **Live Sync Engine**: Periodically polls and updates database statistics with a live status beacon and animated counters.
- **Table Storage Breakdown**: Visual horizontal distribution bars indicating data and index utilization per table.

### 2. Database Details (`/database-details.html`)
- Information Schema metadata: Engine type (InnoDB), charset, table row estimates, data size, and index size.
- Server metrics: Active MySQL version, connection latency, and storage allocations.

### 3. Tables & Records (`/tables-records.html`)
- Browse all tables in the connected database.
- Search rows, paginate records, view column datatypes, and delete individual records.

### 4. Database CRUD & Schema Manager (`/database-crud.html`)
- **Create Table**: Visual modal to define table name, column types (`INT`, `VARCHAR`, `TEXT`, `DATETIME`, etc.), primary keys, and auto-increment flags.
- **Add Column**: Safely alter existing tables with optional default values and positioning (`AFTER column`).
- **Drop Column & Drop Table**: Interactive deletion with confirmation safeguards (critical system tables like `admin_users` are locked against accidental drops).
- **Insert Records**: Dynamic form based on table schema for inserting test or production rows.

### 5. Admin Settings (`/settings.html`)
- **Theme Switcher**: One-click toggling between **Light**, **Dark**, and **System** themes.
- **Profile Picture / Avatar**: Upload custom avatars up to 20MB with client and server-side validation.
- **Password Management**: Update account credentials with password confirmation and current password verification.
- **Session Control**: Single-click sign-out with instant cookie invalidation.

---

## 🛡️ Security & Reliability Architecture

| Feature | Implementation Details |
| :--- | :--- |
| **Password Hashing** | Uses Node.js native `crypto.scryptSync` with unique 16-byte random salts per user. |
| **Timing-Safe Checks** | `crypto.timingSafeEqual` prevents timing attacks on secrets and passwords. |
| **Session Protection** | High-entropy 256-bit session tokens stored in memory, delivered via `HttpOnly; SameSite=Strict` cookies. |
| **Dual Rate Limiting** | Strict `authLimiter` (15 req / 15 min) on login/register endpoints, plus general `limiter` on public submissions. |
| **Session Pruning** | Automatic background interval clears expired sessions to prevent memory leaks. |
| **HTTP Security Headers** | `helmet` configured with `x-powered-by` suppressed. |
| **SQL Injection Prevention** | All dynamic queries use prepared statements (`?` parameters) and strict identifier quoting (`escapeIdentifier`). |
| **File Upload Hardening** | Extension and MIME validation (`png`, `jpg`, `webp`, `gif`). Raw SVGs excluded to prevent Stored XSS. |
| **Private Resumes** | Candidate CVs in `uploads/resumes` are restricted and not exposed as public static files. |
| **Connection Pooling** | MySQL pool with `enableKeepAlive: true` and `keepAliveInitialDelay: 10000` prevents broken pipe disconnects. |
| **Graceful Shutdown** | Captures `SIGTERM` and `SIGINT` to cleanly drain the database pool and stop HTTP listeners. |

---

## 🛠️ Port & Service Mapping

| Container | Image / Tech | Port Mapping | Purpose |
| :--- | :--- | :--- | :--- |
| **form_admin_dashboard** | Nginx 1.27 Alpine | `8080:80` | Serves dashboard frontend & reverse proxies `/api/` & `/uploads/` |
| **form_backend** | Node.js 22 Alpine | `5000:5000` | Core Express REST API & Public Submission Portal |
| **form_mysql** | MySQL 8.0 | `3306:3306` | Relational database storage |
| **form_mailhog** | MailHog | `8025:8025` / `1025` | SMTP capture and web inbox for testing notifications |

---

## 🏁 Quick Start & Deployment

### 1. Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose installed.

### 2. Environment Configuration
Verify your `.env` file in the root directory:
```env
PORT=5000
DB_HOST=mysql
DB_USER=form_user
DB_PASSWORD=form_password
DB_NAME=form_management
MYSQL_ROOT_PASSWORD=root_password
SMTP_HOST=mailhog
SMTP_PORT=1025
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin-password-2026
ADMIN_SECRET_KEY=admin-secret-2026
ADMIN_COOKIE_SECURE=false
```

### 3. Launch Services
```bash
docker compose up -d --build
```

### 4. Access the Application
- **Admin Dashboard**: Open [http://localhost:8080/dashboard.html](http://localhost:8080/dashboard.html)
  - Default Admin: `kholiya.narendra@gmail.com` (or create a new account via the register tab using your `ADMIN_SECRET_KEY`)
- **Public Form Portal**: Open [http://localhost:5000/index.html](http://localhost:5000/index.html)
- **MailHog Webmail**: Open [http://localhost:8025](http://localhost:8025) to view outbound notification emails.

---

## 🔌 API Reference Summary

### Authentication & Profile
- `POST /api/admin/login` - Authenticate admin credentials and set session cookie.
- `POST /api/admin/register` - Create new admin account (requires `secretKey`).
- `POST /api/admin/logout` - Invalidate session and clear cookie.
- `GET /api/admin/me` - Retrieve authenticated admin profile details.
- `POST /api/admin/change-password` - Update admin password.
- `POST /api/admin/avatar` - Upload and set custom profile avatar.

### Dashboard & Database Metadata
- `GET /api/health` - Check database connectivity and backend health.
- `GET /api/admin/overview` - Complete dashboard metrics (counts, sizes, distribution).
- `GET /api/admin/database` - Deep schema, storage engines, and charset metrics.
- `GET /api/admin/tables` - List all tables and live row counts.
- `GET /api/admin/tables/:table` - Table schema and paginated rows.

### Visual Schema & CRUD Operations
- `POST /api/admin/schema/create-table` - Create new table with custom columns.
- `DELETE /api/admin/schema/drop-table/:table` - Drop non-critical table.
- `POST /api/admin/schema/add-column` - Add column to an existing table.
- `DELETE /api/admin/schema/drop-column` - Drop column from a table.
- `POST /api/admin/tables/:table/records` - Insert a new row into a table.
- `DELETE /api/admin/tables/:table/records/:id` - Delete a specific row by primary key.

### Public Ingestion
- `POST /api/submissions` - Ingest general/demo inquiry form.
- `POST /api/careers` - Ingest career application with multipart resume upload.

