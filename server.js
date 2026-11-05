
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

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api/", limiter);

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

  console.log("Database tables initialized");
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
      extra: value.extra ? JSON.stringify(value.extra) : null,
      addons: value.addons ? JSON.stringify(value.addons) : null
    };

    const [result] = await db.execute(
      `INSERT INTO submissions
      (form_type, source, account_type, name, email, phone,
       company, location, message, plan, product, subject,
       extra, addons, currency, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.form_type, data.source, data.account_type,
        data.name, data.email, data.phone, data.company,
        data.location, data.message, data.plan, data.product,
        data.subject, data.extra, data.addons, data.currency,
        clientIP(req)
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
