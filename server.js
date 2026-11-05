
const express = require("express");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "admin-dashboard", "public")));
app.use("/css", express.static(path.join(__dirname, "admin-dashboard", "css")));
app.use("/js", express.static(path.join(__dirname, "admin-dashboard", "js")));
app.use("/uploads/avatars", express.static(path.join(__dirname, "uploads", "avatars")));

app.get("/login", (req, res) => res.redirect("/login.html"));
app.get("/dashboard", (req, res) => res.redirect("/dashboard.html"));
app.get("/admin", (req, res) => res.redirect("/login.html"));
app.get("/forms", (req, res) => res.redirect("/index.html"));
app.get("/settings", (req, res) => res.redirect("/settings.html"));
app.get("/database-crud", (req, res) => res.redirect("/database-crud.html"));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// Public form endpoints need abuse protection; dashboard reads refresh regularly.
app.use(["/api/submissions", "/api/careers"], limiter);

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map(item => item.trim()).filter(Boolean).map(item => {
      const separator = item.indexOf("=");
      return separator === -1
        ? [item, ""]
        : [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
    })
  );
}

function secureEqual(first, second) {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  const hashBuffer = Buffer.from(hash);
  const storedBuffer = Buffer.from(storedHash);
  return hashBuffer.length === storedBuffer.length && crypto.timingSafeEqual(hashBuffer, storedBuffer);
}

function verifySecretKey(providedKey) {
  const configuredKey = process.env.ADMIN_SECRET_KEY || "admin-secret-2026";
  const providedBuffer = Buffer.from(String(providedKey || ""));
  const configuredBuffer = Buffer.from(configuredKey);
  if (providedBuffer.length !== configuredBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, configuredBuffer);
}

function setAdminSessionCookie(res, token) {
  const secure = process.env.ADMIN_COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_TTL_MS / 1000}${secure}`
  );
}

function requireAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie).admin_session;
  const session = token && adminSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ message: "Please sign in to continue." });
  }
  req.admin = session;
  next();
}

function escapeIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, "``")}\``;
}

async function getAdminTables() {
  const [tables] = await db.execute(
    `SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_ROWS AS \`rows\`,
            DATA_LENGTH AS dataBytes, INDEX_LENGTH AS indexBytes
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );
  // Get live exact row counts for accurate dashboard metrics
  for (const table of tables) {
    try {
      const [[{ count }]] = await db.query(`SELECT COUNT(*) AS count FROM \`${table.name}\``);
      table.rows = Number(count);
    } catch {
      // keep information_schema row count
    }
  }
  return tables;
}

async function findAdminTable(name) {
  const tables = await getAdminTables();
  return tables.find(table => table.name === name);
}

// MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST || "mysql",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// MailHog SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mailhog",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: false
});

// Upload directory
const uploadDir = path.join(__dirname, "uploads", "resumes");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      return cb(new Error("Only PDF, DOC and DOCX files allowed"));
    }

    cb(null, true);
  }
});

// Admin Avatar Upload
const avatarDir = path.join(__dirname, "uploads", "avatars");
fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error("Only PNG, JPG, JPEG, WEBP, and GIF images are allowed."));
    }
    cb(null, true);
  }
});

// Database initialization
async function initializeDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      form_type VARCHAR(100),
      source VARCHAR(100),
      account_type VARCHAR(100),
      name VARCHAR(255),
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30),
      company VARCHAR(255),
      location VARCHAR(255),
      message TEXT,
      plan VARCHAR(100),
      product VARCHAR(255),
      subject VARCHAR(255),
      extra JSON,
      addons JSON,
      currency VARCHAR(10),
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_submission_email (email),
      INDEX idx_submission_created (created_at)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS career_applications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30),
      position VARCHAR(255) NOT NULL,
      position_type VARCHAR(100),
      experience VARCHAR(100),
      linkedin VARCHAR(500),
      github VARCHAR(500),
      source VARCHAR(100),
      resume_path VARCHAR(500) NOT NULL,
      resume_original_name VARCHAR(255),
      cover_letter_path VARCHAR(500),
      cover_letter_original_name VARCHAR(255),
      user_agent TEXT,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_career_email (email)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      avatar_url VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_admin_email (email)
    )
  `);

  try {
    await db.query("ALTER TABLE admin_users ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL");
  } catch (colErr) {
    // Column already exists or error ignored
  }

  console.log("Database tables initialized");

  try {
    const [[adminCount]] = await db.query("SELECT COUNT(*) AS count FROM admin_users");
    if (Number(adminCount.count) === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const { hash, salt } = hashPassword(process.env.ADMIN_PASSWORD);
      await db.execute(
        "INSERT INTO admin_users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)",
        ["Super Admin", process.env.ADMIN_EMAIL.trim().toLowerCase(), hash, salt]
      );
      console.log("Default admin account created in admin_users table");
    }

    const [[subCount]] = await db.query("SELECT COUNT(*) AS count FROM submissions");
    if (Number(subCount.count) === 0) {
      await db.query(`
        INSERT INTO submissions 
        (form_type, source, account_type, name, email, phone, company, location, message, plan, product, subject, extra, addons, currency, ip_address)
        VALUES 
        ('general', 'website', 'business', 'Alice Smith', 'alice.smith@acme.com', '+1-555-0101', 'Acme Corp', 'New York, USA', 'Interested in upgrading our enterprise software license.', 'Enterprise', 'Cloud Suite', 'Enterprise License Inquiry', '{"department": "Engineering", "team_size": 45}', '["priority_support", "dedicated_ip"]', 'USD', '127.0.0.1'),
        ('general', 'landing_page', 'individual', 'Bob Jones', 'bob.jones@techcorp.io', '+1-555-0102', 'TechCorp', 'San Francisco, USA', 'Looking for integration details with REST APIs and webhooks.', 'Pro', 'API Gateway', 'Webhook Integration', '{"lead_score": 85}', '["analytics"]', 'USD', '127.0.0.1'),
        ('general', 'referral', 'enterprise', 'Charlie Davis', 'charlie@globalcorp.org', '+44-20-7946-0919', 'Global Corp', 'London, UK', 'We would like to request a personalized product demo for our executive team.', 'Enterprise Plus', 'Full Platform', 'Executive Demo Request', '{"budget": "$50,000+"}', '["sla_guarantee", "24_7_phone"]', 'GBP', '127.0.0.1')
      `);
      console.log("Seed submissions created");
    }

    const [[careerCount]] = await db.query("SELECT COUNT(*) AS count FROM career_applications");
    if (Number(careerCount.count) === 0) {
      await db.query(`
        INSERT INTO career_applications
        (email, phone, position, position_type, experience, linkedin, github, source, resume_path, resume_original_name, user_agent, ip_address)
        VALUES
        ('diana.prince@example.org', '+1-555-0144', 'Senior Backend Engineer', 'Full-time', '6+ years', 'https://linkedin.com/in/dianaprince', 'https://github.com/dianaprince', 'careers_page', 'resumes/sample-diana-resume.pdf', 'Diana_Prince_Resume.pdf', 'Mozilla/5.0', '127.0.0.1'),
        ('evan.wright@example.org', '+1-555-0199', 'Full Stack Developer', 'Full-time', '4 years', 'https://linkedin.com/in/evanwright', 'https://github.com/evanwright', 'referral', 'resumes/sample-evan-resume.pdf', 'Evan_Wright_CV.pdf', 'Mozilla/5.0', '127.0.0.1')
      `);
      console.log("Seed career applications created");
    }
  } catch (seedErr) {
    console.warn("Could not seed initial data:", seedErr.message);
  }
}

const submissionSchema = Joi.object({
  form_type: Joi.string().max(100).default("general"),
  source: Joi.string().max(100).allow("", null),
  account_type: Joi.string().max(100).allow("", null),
  name: Joi.string().max(255).allow("", null),
  email: Joi.string().email().max(255).required(),
  phone: Joi.string().max(30).allow("", null),
  company: Joi.string().max(255).allow("", null),
  location: Joi.string().max(255).allow("", null),
  message: Joi.string().max(10000).allow("", null),
  plan: Joi.string().max(100).allow("", null),
  product: Joi.string().max(255).allow("", null),
  subject: Joi.string().max(255).allow("", null),
  extra: Joi.alternatives().try(Joi.object(), Joi.string()).allow(null),
  addons: Joi.alternatives().try(Joi.array(), Joi.string()).allow(null),
  currency: Joi.string().max(10).allow("", null)
}).unknown(false);

const careerSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  phone: Joi.string().max(30).allow("", null),
  position: Joi.string().max(255).required(),
  position_type: Joi.string().max(100).allow("", null),
  experience: Joi.string().max(100).allow("", null),
  linkedin: Joi.string().max(500).allow("", null),
  github: Joi.string().max(500).allow("", null),
  source: Joi.string().max(100).allow("", null)
}).unknown(false);

function clientIP(req) {
  // Do not trust arbitrary X-Forwarded-For headers.
  return req.ip || req.socket.remoteAddress || null;
}

async function sendNotification(subject, html) {
  return transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: process.env.ADMIN_EMAIL,
    subject,
    html
  });
}

// Health check
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

// Admin Registration with Secret Key
app.post("/api/admin/register", async (req, res) => {
  try {
    const { name, email, password, secret_key } = req.body || {};

    // 1. Strict Secret Key verification
    if (!secret_key || !verifySecretKey(secret_key)) {
      return res.status(403).json({
        success: false,
        message: "Invalid or missing Admin Secret Key. Registration cannot be completed."
      });
    }

    // 2. Validate input fields
    if (!email || !String(email).includes("@") || String(email).length > 255) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name || "Administrator").trim();

    // 3. Check for existing admin
    const [existing] = await db.execute("SELECT id FROM admin_users WHERE email = ?", [cleanEmail]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: "An admin account with this email already exists." });
    }

    // 4. Hash password with secure scrypt salt
    const { hash, salt } = hashPassword(password);
    const [result] = await db.execute(
      "INSERT INTO admin_users (name, email, password_hash, password_salt) VALUES (?, ?, ?, ?)",
      [cleanName, cleanEmail, hash, salt]
    );

    // 5. Establish authenticated admin session
    const token = crypto.randomBytes(32).toString("hex");
    adminSessions.set(token, {
      email: cleanEmail,
      name: cleanName,
      id: result.insertId,
      expiresAt: Date.now() + ADMIN_SESSION_TTL_MS
    });
    setAdminSessionCookie(res, token);

    res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      email: cleanEmail,
      name: cleanName
    });
  } catch (error) {
    console.error("Admin registration failed:", error);
    res.status(500).json({ success: false, message: "Failed to create admin account." });
  }
});

// Admin Login
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    let authenticatedUser = null;

    // Check database admin_users first
    const [users] = await db.execute(
      "SELECT id, name, email, password_hash, password_salt FROM admin_users WHERE email = ?",
      [cleanEmail]
    );

    if (users && users.length > 0) {
      const user = users[0];
      if (verifyPassword(password, user.password_hash, user.password_salt)) {
        authenticatedUser = { email: user.email, name: user.name, id: user.id };
      }
    } else {
      // Fallback check against configured environment variables
      const configuredEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
      const configuredPassword = process.env.ADMIN_PASSWORD || "";
      if (configuredEmail && secureEqual(cleanEmail, configuredEmail) && secureEqual(password, configuredPassword)) {
        authenticatedUser = { email: configuredEmail, name: "Super Admin", id: 0 };
      }
    }

    if (!authenticatedUser) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    adminSessions.set(token, {
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      id: authenticatedUser.id,
      expiresAt: Date.now() + ADMIN_SESSION_TTL_MS
    });
    setAdminSessionCookie(res, token);
    res.json({ email: authenticatedUser.email, name: authenticatedUser.name });
  } catch (error) {
    console.error("Login verification error:", error);
    res.status(500).json({ message: "Authentication service error." });
  }
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = parseCookies(req.headers.cookie).admin_session;
  if (token) adminSessions.delete(token);
  res.setHeader("Set-Cookie", "admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.status(204).end();
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ email: req.admin.email, name: req.admin.name || "Administrator" });
});

// Profile Management Endpoints
app.get("/api/admin/profile", requireAdmin, async (req, res, next) => {
  try {
    const cleanEmail = String(req.admin.email || "").trim().toLowerCase();
    const [users] = await db.execute(
      "SELECT id, name, email, avatar_url, created_at FROM admin_users WHERE email = ?",
      [cleanEmail]
    );
    if (users && users.length > 0) {
      res.json({
        id: users[0].id,
        name: users[0].name || req.admin.name || "Administrator",
        email: users[0].email,
        avatar_url: users[0].avatar_url || null,
        created_at: users[0].created_at
      });
    } else {
      res.json({
        id: 0,
        name: req.admin.name || "Super Admin",
        email: req.admin.email,
        avatar_url: null,
        created_at: new Date()
      });
    }
  } catch (error) {
    next(error);
  }
});

// Rename / Update Admin Name
app.put("/api/admin/profile", requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Display name cannot be empty." });
    }
    const cleanName = String(name).trim();
    const cleanEmail = String(req.admin.email || "").trim().toLowerCase();

    await db.execute(
      "UPDATE admin_users SET name = ? WHERE email = ?",
      [cleanName, cleanEmail]
    );

    req.admin.name = cleanName;

    res.json({
      success: true,
      message: "Profile name updated successfully.",
      name: cleanName
    });
  } catch (error) {
    next(error);
  }
});

// Change Admin Password
app.put("/api/admin/profile/password", requireAdmin, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: "Current password and new password are required." });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
    }

    const cleanEmail = String(req.admin.email || "").trim().toLowerCase();
    const [users] = await db.execute(
      "SELECT id, password_hash, password_salt FROM admin_users WHERE email = ?",
      [cleanEmail]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: "Admin user not found." });
    }

    const user = users[0];
    if (!verifyPassword(current_password, user.password_hash, user.password_salt)) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    const { hash, salt } = hashPassword(new_password);
    await db.execute(
      "UPDATE admin_users SET password_hash = ?, password_salt = ? WHERE id = ?",
      [hash, salt, user.id]
    );

    res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
});

// Upload Admin Avatar
app.post("/api/admin/profile/avatar", requireAdmin, avatarUpload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Please select an image file to upload." });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const cleanEmail = String(req.admin.email || "").trim().toLowerCase();

    await db.execute(
      "UPDATE admin_users SET avatar_url = ? WHERE email = ?",
      [avatarUrl, cleanEmail]
    );

    req.admin.avatar_url = avatarUrl;

    res.json({
      success: true,
      message: "Avatar uploaded successfully.",
      avatar_url: avatarUrl
    });
  } catch (error) {
    next(error);
  }
});

// Real-time Recent Entries Feed across ALL database tables
app.get("/api/admin/recent-entries", requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const tableFilter = String(req.query.table || req.query.type || "all").trim();
    const search = String(req.query.search || "").trim().toLowerCase();

    const allTables = await getAdminTables();
    let allEntries = [];

    const targetTables = (tableFilter && tableFilter !== "all")
      ? allTables.filter(t => t.name === tableFilter)
      : allTables;

    for (const table of targetTables) {
      try {
        const [colRows] = await db.execute(
          "SELECT COLUMN_NAME AS name, DATA_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
          [table.name]
        );
        if (!colRows.length) continue;

        const cols = colRows.map(c => c.name);
        const hasCreatedAt = cols.includes('created_at');
        const hasId = cols.includes('id');
        const orderCol = hasCreatedAt ? '`created_at` DESC' : (hasId ? '`id` DESC' : '1');

        const [records] = await db.query(
          `SELECT * FROM ${escapeIdentifier(table.name)} ORDER BY ${orderCol} LIMIT ?`,
          [limit]
        );

        for (const row of records) {
          const id = row.id ?? row[cols[0]] ?? null;
          const createdAt = row.created_at || row.updated_at || row.timestamp || null;

          let name = row.name || row.full_name || row.title || row.username || row.position || null;
          if (!name) {
            const stringCol = cols.find(c => !['id', 'password', 'password_hash', 'password_salt'].includes(c) && typeof row[c] === 'string' && row[c].length > 0);
            name = stringCol ? row[stringCol] : `#${id}`;
          }

          const email = row.email || row.user_email || row.admin_email || null;
          const company = row.company || row.organization || row.account_type || row.experience || null;

          let details = row.message || row.description || row.subject || row.notes || null;
          if (!details) {
            const exclude = new Set(['id', 'name', 'full_name', 'email', 'created_at', 'password', 'password_hash', 'password_salt']);
            const summaryParts = [];
            for (const col of cols) {
              if (!exclude.has(col) && row[col] !== null && row[col] !== undefined && row[col] !== '') {
                summaryParts.push(`${col}: ${String(row[col]).slice(0, 30)}`);
                if (summaryParts.length >= 2) break;
              }
            }
            details = summaryParts.join(' | ') || (email ? email : `Record in ${table.name}`);
          }

          allEntries.push({
            id,
            table_name: table.name,
            entry_type: table.name,
            form_type: row.form_type || row.position_type || table.name,
            name: String(name || 'Unnamed'),
            email: email ? String(email) : '—',
            company: company ? String(company) : '—',
            subject: row.subject || table.name,
            message: String(details),
            created_at: createdAt,
            raw_data: row
          });
        }
      } catch (tableErr) {
        // Continue if an individual table has query error
      }
    }

    // Sort newest first
    allEntries.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return Number(b.id || 0) - Number(a.id || 0);
    });

    if (search) {
      allEntries = allEntries.filter(e =>
        (e.name && String(e.name).toLowerCase().includes(search)) ||
        (e.email && String(e.email).toLowerCase().includes(search)) ||
        (e.company && String(e.company).toLowerCase().includes(search)) ||
        (e.message && String(e.message).toLowerCase().includes(search)) ||
        (e.table_name && String(e.table_name).toLowerCase().includes(search))
      );
    }

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const finalEntries = allEntries.slice(0, limit).map(e => ({
      ...e,
      isNew: e.created_at ? (new Date(e.created_at).getTime() > oneDayAgo) : true
    }));

    res.json({
      total: finalEntries.length,
      entries: finalEntries,
      tables: allTables.map(t => t.name)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/overview", requireAdmin, async (req, res, next) => {
  try {
    const tables = await getAdminTables();
    const [[database]] = await db.query("SELECT DATABASE() AS name, VERSION() AS version, @@default_storage_engine AS defaultEngine");
    res.json({
      database: database.name,
      version: database.version,
      defaultEngine: database.defaultEngine,
      totalTables: tables.length,
      totalRows: tables.reduce((sum, table) => sum + Number(table.rows || 0), 0),
      totalSizeBytes: tables.reduce((sum, table) => sum + Number(table.dataBytes || 0) + Number(table.indexBytes || 0), 0),
      tables
    });
  } catch (error) { next(error); }
});

app.get("/api/admin/database", requireAdmin, async (req, res, next) => {
  try {
    const tables = await getAdminTables();
    const [[database]] = await db.query("SELECT DATABASE() AS name, VERSION() AS version");
    res.json({
      database: database.name,
      version: database.version,
      totalTables: tables.length,
      totalSizeBytes: tables.reduce((sum, table) => sum + Number(table.dataBytes || 0) + Number(table.indexBytes || 0), 0),
      tables
    });
  } catch (error) { next(error); }
});

app.get("/api/admin/tables", requireAdmin, async (req, res, next) => {
  try { res.json({ tables: await getAdminTables() }); } catch (error) { next(error); }
});

app.get("/api/admin/tables/:table/schema", requireAdmin, async (req, res, next) => {
  try {
    const table = await findAdminTable(req.params.table);
    if (!table) return res.status(404).json({ message: "Table not found." });
    const [columns] = await db.execute(
      `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE = 'YES' AS nullable,
              COLUMN_DEFAULT AS defaultValue, COLUMN_KEY AS \`key\`, EXTRA AS extra
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [table.name]
    );
    const [indexes] = await db.execute(
      `SELECT INDEX_NAME AS name, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS \`column\`,
              NON_UNIQUE = 0 AS \`unique\`, INDEX_TYPE AS type
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE ORDER BY INDEX_NAME`,
      [table.name]
    );
    res.json({ table: table.name, columns, indexes });
  } catch (error) { next(error); }
});

app.get("/api/admin/tables/:table/records", requireAdmin, async (req, res, next) => {
  try {
    const table = await findAdminTable(req.params.table);
    if (!table) return res.status(404).json({ message: "Table not found." });
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;
    const [columnRows] = await db.execute(
      "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [table.name]
    );
    const columns = columnRows.map(column => column.name);
    const search = String(req.query.search || "").trim();
    const where = search && columns.length
      ? ` WHERE ${columns.map(column => `CAST(${escapeIdentifier(column)} AS CHAR) LIKE ?`).join(" OR ")}`
      : "";
    const searchValues = search ? columns.map(() => `%${search}%`) : [];
    const identifier = escapeIdentifier(table.name);
    const [[count]] = await db.execute(`SELECT COUNT(*) AS total FROM ${identifier}${where}`, searchValues);
    const orderClause = columns.includes("id") ? " ORDER BY `id` DESC" : (columns.includes("created_at") ? " ORDER BY `created_at` DESC" : "");
    const [records] = await db.query(
      `SELECT * FROM ${identifier}${where}${orderClause} LIMIT ? OFFSET ?`,
      [...searchValues, limit, offset]
    );
    res.json({ table: table.name, columns, records, total: Number(count.total) });
  } catch (error) { next(error); }
});

// Helper for validating SQL column data types safely
function sanitizeDataType(type) {
  if (!type || typeof type !== 'string') return null;
  const t = type.trim();
  const simpleTypes = [
    'INT', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT',
    'FLOAT', 'DOUBLE', 'BOOLEAN', 'BOOL',
    'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR',
    'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT',
    'JSON', 'BLOB', 'LONGBLOB'
  ];
  if (simpleTypes.includes(t.toUpperCase())) {
    return t.toUpperCase();
  }
  if (/^VARCHAR\(\d+\)$/i.test(t)) {
    const len = parseInt(t.match(/\d+/)[0], 10);
    return len > 0 && len <= 65535 ? `VARCHAR(${len})` : null;
  }
  if (/^CHAR\(\d+\)$/i.test(t)) {
    const len = parseInt(t.match(/\d+/)[0], 10);
    return len > 0 && len <= 255 ? `CHAR(${len})` : null;
  }
  if (/^DECIMAL\(\d+,\s*\d+\)$/i.test(t)) {
    const nums = t.match(/\d+/g).map(Number);
    return nums[0] <= 65 && nums[1] <= 30 ? `DECIMAL(${nums[0]}, ${nums[1]})` : null;
  }
  if (/^INT\(\d+\)$/i.test(t)) {
    return 'INT';
  }
  return null;
}

// 1. Create a new database table
app.post("/api/admin/schema/create-table", requireAdmin, async (req, res, next) => {
  try {
    const { tableName, columns } = req.body;
    if (!tableName || !/^[a-zA-Z0-9_]{1,64}$/.test(tableName)) {
      return res.status(400).json({ message: "Invalid table name. Use letters, numbers, and underscores (max 64 chars)." });
    }
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ message: "At least one column is required." });
    }

    const columnDefs = [];
    const primaryKeys = [];

    for (const col of columns) {
      const colName = String(col.name || '').trim();
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(colName)) {
        return res.status(400).json({ message: `Invalid column name "${colName}".` });
      }

      const colType = sanitizeDataType(col.type);
      if (!colType) {
        return res.status(400).json({ message: `Invalid or unsupported data type for column "${colName}".` });
      }

      let def = `${escapeIdentifier(colName)} ${colType}`;
      if (col.autoIncrement) {
        def += " AUTO_INCREMENT";
        if (!primaryKeys.includes(escapeIdentifier(colName))) {
          primaryKeys.push(escapeIdentifier(colName));
        }
      }
      if (col.nullable === false || col.notNull) {
        def += " NOT NULL";
      } else {
        def += " NULL";
      }
      if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== "") {
        if (String(col.defaultValue).toUpperCase() === "CURRENT_TIMESTAMP") {
          def += " DEFAULT CURRENT_TIMESTAMP";
        } else {
          def += ` DEFAULT ${db.escape(col.defaultValue)}`;
        }
      }
      if (col.isPrimary && !primaryKeys.includes(escapeIdentifier(colName))) {
        primaryKeys.push(escapeIdentifier(colName));
      }
      columnDefs.push(def);
    }

    if (primaryKeys.length > 0) {
      columnDefs.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
    }

    const sql = `CREATE TABLE ${escapeIdentifier(tableName)} (\n  ${columnDefs.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
    await db.query(sql);

    res.json({ success: true, message: `Table "${tableName}" created successfully!` });
  } catch (error) {
    if (error.code === 'ER_TABLE_EXISTS_ERROR') {
      return res.status(400).json({ message: `Table "${req.body.tableName}" already exists.` });
    }
    next(error);
  }
});

// 2. Drop / Delete a table
app.delete("/api/admin/schema/drop-table/:table", requireAdmin, async (req, res, next) => {
  try {
    const tableName = String(req.params.table || '').trim();
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(tableName)) {
      return res.status(400).json({ message: "Invalid table name." });
    }
    if (tableName === 'admin_users') {
      return res.status(403).json({ message: "Security restriction: The 'admin_users' table cannot be dropped." });
    }

    const table = await findAdminTable(tableName);
    if (!table) return res.status(404).json({ message: `Table "${tableName}" not found.` });

    await db.query(`DROP TABLE ${escapeIdentifier(tableName)}`);
    res.json({ success: true, message: `Table "${tableName}" has been dropped successfully.` });
  } catch (error) {
    next(error);
  }
});

// 3. Add column to existing table
app.post("/api/admin/schema/add-column", requireAdmin, async (req, res, next) => {
  try {
    const { tableName, columnName, columnType, nullable, defaultValue, afterColumn } = req.body;
    if (!tableName || !/^[a-zA-Z0-9_]{1,64}$/.test(tableName)) {
      return res.status(400).json({ message: "Invalid table name." });
    }
    if (!columnName || !/^[a-zA-Z0-9_]{1,64}$/.test(columnName)) {
      return res.status(400).json({ message: "Invalid column name." });
    }

    const table = await findAdminTable(tableName);
    if (!table) return res.status(404).json({ message: `Table "${tableName}" not found.` });

    const sanitizedType = sanitizeDataType(columnType);
    if (!sanitizedType) {
      return res.status(400).json({ message: "Invalid or unsupported data type." });
    }

    let sql = `ALTER TABLE ${escapeIdentifier(tableName)} ADD COLUMN ${escapeIdentifier(columnName)} ${sanitizedType}`;
    if (nullable === false) {
      sql += " NOT NULL";
    } else {
      sql += " NULL";
    }
    if (defaultValue !== undefined && defaultValue !== null && defaultValue !== "") {
      if (String(defaultValue).toUpperCase() === "CURRENT_TIMESTAMP") {
        sql += " DEFAULT CURRENT_TIMESTAMP";
      } else {
        sql += ` DEFAULT ${db.escape(defaultValue)}`;
      }
    }
    if (afterColumn && /^[a-zA-Z0-9_]{1,64}$/.test(afterColumn)) {
      sql += ` AFTER ${escapeIdentifier(afterColumn)}`;
    }

    await db.query(sql);
    res.json({ success: true, message: `Column "${columnName}" added to "${tableName}" successfully!` });
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      return res.status(400).json({ message: `Column "${req.body.columnName}" already exists in table "${req.body.tableName}".` });
    }
    next(error);
  }
});

// 4. Drop column from table
app.delete("/api/admin/schema/drop-column", requireAdmin, async (req, res, next) => {
  try {
    const { tableName, columnName } = req.body;
    if (!tableName || !/^[a-zA-Z0-9_]{1,64}$/.test(tableName)) {
      return res.status(400).json({ message: "Invalid table name." });
    }
    if (!columnName || !/^[a-zA-Z0-9_]{1,64}$/.test(columnName)) {
      return res.status(400).json({ message: "Invalid column name." });
    }

    if (tableName === 'admin_users' && ['id', 'email', 'password_hash', 'password_salt'].includes(columnName)) {
      return res.status(403).json({ message: `Cannot delete critical column "${columnName}" from admin_users.` });
    }

    const table = await findAdminTable(tableName);
    if (!table) return res.status(404).json({ message: `Table "${tableName}" not found.` });

    await db.query(`ALTER TABLE ${escapeIdentifier(tableName)} DROP COLUMN ${escapeIdentifier(columnName)}`);
    res.json({ success: true, message: `Column "${columnName}" removed from table "${tableName}".` });
  } catch (error) {
    next(error);
  }
});

// 5. Insert new record into table
app.post("/api/admin/tables/:table/records", requireAdmin, async (req, res, next) => {
  try {
    const table = await findAdminTable(req.params.table);
    if (!table) return res.status(404).json({ message: "Table not found." });

    const data = req.body || {};
    const [columnRows] = await db.execute(
      "SELECT COLUMN_NAME AS name, EXTRA as extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [table.name]
    );
    const validCols = new Set(columnRows.map(c => c.name));
    const autoCols = new Set(columnRows.filter(c => String(c.extra).includes('auto_increment')).map(c => c.name));

    const keys = Object.keys(data).filter(k => validCols.has(k) && !autoCols.has(k) && data[k] !== undefined);
    if (keys.length === 0) {
      return res.status(400).json({ message: "No valid column values provided." });
    }

    const colsSql = keys.map(k => escapeIdentifier(k)).join(", ");
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map(k => (data[k] === "" ? null : data[k]));

    const [result] = await db.query(
      `INSERT INTO ${escapeIdentifier(table.name)} (${colsSql}) VALUES (${placeholders})`,
      values
    );

    res.json({ success: true, insertId: result.insertId, message: "Record inserted successfully!" });
  } catch (error) {
    next(error);
  }
});

// 6. Delete record from table
app.delete("/api/admin/tables/:table/records/:id", requireAdmin, async (req, res, next) => {
  try {
    const table = await findAdminTable(req.params.table);
    if (!table) return res.status(404).json({ message: "Table not found." });

    const [pks] = await db.execute(
      "SELECT COLUMN_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'",
      [table.name]
    );
    const pkName = pks.length ? pks[0].name : "id";

    const [result] = await db.query(
      `DELETE FROM ${escapeIdentifier(table.name)} WHERE ${escapeIdentifier(pkName)} = ? LIMIT 1`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Record not found or already deleted." });
    }

    res.json({ success: true, message: `Record deleted successfully.` });
  } catch (error) {
    next(error);
  }
});

// General form submission
app.post("/api/submissions", async (req, res) => {
  try {
    const { error, value } = submissionSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const data = {
      ...value,
      extra: value.extra ? (typeof value.extra === 'object' ? JSON.stringify(value.extra) : value.extra) : null,
      addons: value.addons ? (typeof value.addons === 'object' ? JSON.stringify(value.addons) : value.addons) : null
    };

    const [result] = await db.execute(
      `INSERT INTO submissions
      (form_type, source, account_type, name, email, phone,
       company, location, message, plan, product, subject,
       extra, addons, currency, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.form_type || "general",
        data.source || null,
        data.account_type || null,
        data.name || null,
        data.email,
        data.phone || null,
        data.company || null,
        data.location || null,
        data.message || null,
        data.plan || null,
        data.product || null,
        data.subject || null,
        data.extra || null,
        data.addons || null,
        data.currency || null,
        clientIP(req) || null
      ]
    );

    // Email failure should not undo a successful DB submission.
    try {
      await sendNotification(
        "New Form Submission",
        `<h2>New submission received</h2>
         <p>Name: ${escapeHTML(data.name || "")}</p>
         <p>Email: ${escapeHTML(data.email)}</p>
         <p>Form: ${escapeHTML(data.form_type)}</p>`
      );
    } catch (mailError) {
      console.error("Notification email failed:", mailError.message);
    }

    res.status(201).json({
      success: true,
      message: "Form submitted successfully",
      id: result.insertId
    });

  } catch (error) {
    console.error("Submission error:", error);
    res.status(500).json({
      success: false,
      message: "Unable to submit form"
    });
  }
});

// Escape user input before putting it into email HTML.
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Career application
app.post(
  "/api/careers",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "cover_letter", maxCount: 1 }
  ]),
  async (req, res) => {
    const files = req.files || {};
    const resume = files.resume?.[0];
    const cover = files.cover_letter?.[0];

    try {
      const { error, value } = careerSchema.validate(req.body);

      if (error || !resume) {
        throw new Error(
          error?.details[0].message || "Resume is required"
        );
      }

      const [result] = await db.execute(
        `INSERT INTO career_applications
        (email, phone, position, position_type, experience,
         linkedin, github, source, resume_path,
         resume_original_name, cover_letter_path,
         cover_letter_original_name, user_agent, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          value.email,
          value.phone || null,
          value.position,
          value.position_type || null,
          value.experience || null,
          value.linkedin || null,
          value.github || null,
          value.source || null,
          `resumes/${resume.filename}`,
          resume.originalname,
          cover ? `resumes/${cover.filename}` : null,
          cover ? cover.originalname : null,
          req.get("user-agent") || null,
          clientIP(req)
        ]
      );

      try {
        await sendNotification(
          "New Career Application",
          `<h2>New career application</h2>
           <p>Position: ${escapeHTML(value.position)}</p>
           <p>Email: ${escapeHTML(value.email)}</p>`
        );
      } catch (mailError) {
        console.error("Career email failed:", mailError.message);
      }

      res.status(201).json({
        success: true,
        message: "Application submitted successfully",
        id: result.insertId
      });

    } catch (error) {
      // Clean up files when application cannot be saved.
      for (const file of [...(files.resume || []), ...(files.cover_letter || [])]) {
        fs.unlink(file.path, () => {});
      }

      console.error("Career application error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Application failed"
      });
    }
  }
);

// Do not expose uploaded files as public static assets.
app.use((err, req, res, next) => {
  console.error("Request error:", err.message);
  res.status(400).json({
    success: false,
    message: err.message || "Invalid request"
  });
});

async function startServer() {
  try {
    await initializeDatabase();
    await transporter.verify();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

startServer();
