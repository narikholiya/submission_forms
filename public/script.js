/**
 * ==============================================================================
 * Public Form Submission & Career Application Handler (script.js)
 * ==============================================================================
 * Manages front-end form validation, JSON payload construction, multipart/form-data
 * file uploads for resumes and cover letters, and live user feedback on Port 5000.
 * ==============================================================================
 */

// Global notification alert container
const result = document.getElementById("result");

/**
 * Displays user feedback alerts with smooth scrolling into view.
 * If the record was created successfully, provides a direct deep-link into the admin dashboard.
 *
 * @param {string} message - Feedback text to display
 * @param {boolean} [isSuccess=true] - Whether submission succeeded or failed
 * @param {number|string|null} [insertId=null] - Generated MySQL row ID
 */
function showResult(message, isSuccess = true, insertId = null) {
  result.className = `status-alert ${isSuccess ? 'success' : 'error'}`;
  if (isSuccess && insertId) {
    result.innerHTML = `✅ ${message} (Record ID: #${insertId}) — <a href="http://localhost:8080/tables-records.html?table=submissions" target="_blank" style="color: inherit; text-decoration: underline; font-weight: bold;">View in Admin Dashboard ↗</a>`;
  } else {
    result.textContent = isSuccess ? `✅ ${message}` : `❌ ${message}`;
  }
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Attaches a generic asynchronous submit listener to an HTML form element.
 * Supports both JSON payloads and multipart/form-data payloads (file uploads).
 *
 * @param {HTMLFormElement} form - Target form DOM node
 * @param {string} endpoint - API endpoint destination (e.g., '/api/submissions')
 * @param {boolean} [multipart=false] - True if form contains file inputs
 */
async function handleForm(form, endpoint, multipart = false) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Disable button to prevent accidental double-submissions
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Submitting...";

    try {
      let bodyData;
      const headers = {};

      if (multipart) {
        // Let browser handle boundary header automatically for multipart FormData
        bodyData = new FormData(form);
      } else {
        headers["Content-Type"] = "application/json";
        const raw = Object.fromEntries(new FormData(form));
        // Strip out empty string values for optional parameters
        const cleaned = {};
        for (const [key, val] of Object.entries(raw)) {
          if (val !== "") cleaned[key] = val;
        }
        bodyData = JSON.stringify(cleaned);
      }

      // Dispatch request to Express backend
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyData
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Submission failed (${response.status})`);
      }

      // Show success alert and reset input fields
      showResult(data.message || "Form submitted successfully!", true, data.id);
      form.reset();

    } catch (error) {
      showResult(error.message || "Something went wrong", false);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

// ==============================================================================
// Initialize Event Listeners for Public Forms
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. General Inquiry Form (JSON payload)
  const generalForm = document.getElementById("generalForm");
  if (generalForm) {
    handleForm(generalForm, "/api/submissions");
  }

  // 2. Demo Request Form (JSON payload)
  const demoForm = document.getElementById("demoForm");
  if (demoForm) {
    handleForm(demoForm, "/api/submissions");
  }

  // 3. Career Application Form (Multipart payload with resume file)
  const careerForm = document.getElementById("careerForm");
  if (careerForm) {
    handleForm(careerForm, "/api/careers", true);
  }
});
