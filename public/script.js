const result = document.getElementById("result");

function showResult(message, isSuccess = true, insertId = null) {
  result.className = `status-alert ${isSuccess ? 'success' : 'error'}`;
  if (isSuccess && insertId) {
    result.innerHTML = `✅ ${message} (Record ID: #${insertId}) — <a href="http://localhost:8080/tables-records.html?table=submissions" target="_blank" style="color: inherit; text-decoration: underline; font-weight: bold;">View in Admin Dashboard ↗</a>`;
  } else {
    result.textContent = isSuccess ? `✅ ${message}` : `❌ ${message}`;
  }
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleForm(form, endpoint, multipart = false) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Submitting...";

    try {
      let bodyData;
      const headers = {};

      if (multipart) {
        bodyData = new FormData(form);
      } else {
        headers["Content-Type"] = "application/json";
        const raw = Object.fromEntries(new FormData(form));
        // Clean empty strings for optional fields
        const cleaned = {};
        for (const [key, val] of Object.entries(raw)) {
          if (val !== "") cleaned[key] = val;
        }
        bodyData = JSON.stringify(cleaned);
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyData
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(data.message || `Submission failed (${response.status})`);

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

handleForm(
  document.getElementById("submissionForm"),
  "/api/submissions"
);

handleForm(
  document.getElementById("careerForm"),
  "/api/careers",
  true
);

// Sample Data Fillers for easy testing
document.getElementById("fillSampleSubmission")?.addEventListener("click", () => {
  const ts = Math.floor(Math.random() * 900 + 100);
  document.getElementById("sub_name").value = `Sarah Connor ${ts}`;
  document.getElementById("sub_email").value = `sarah.connor${ts}@cyberdyne.org`;
  document.getElementById("sub_phone").value = `+1-555-01${ts}`;
  document.getElementById("sub_company").value = "Cyberdyne Systems";
  document.getElementById("sub_location").value = "Los Angeles, CA";
  document.getElementById("sub_account_type").value = "Enterprise";
  document.getElementById("sub_plan").value = "Enterprise Tier 1";
  document.getElementById("sub_product").value = "AI Neural Core";
  document.getElementById("sub_subject").value = `Inquiry regarding API Integration #${ts}`;
  document.getElementById("sub_currency").value = "USD";
  document.getElementById("sub_message").value = `We are testing the live form and database integration. Record reference: #${ts}`;
});

document.getElementById("fillSampleCareer")?.addEventListener("click", () => {
  const ts = Math.floor(Math.random() * 900 + 100);
  document.getElementById("career_email").value = `dev.applicant${ts}@example.org`;
  document.getElementById("career_phone").value = `+1-555-02${ts}`;
  document.getElementById("career_position").value = "Senior Full Stack Engineer";
  document.getElementById("career_position_type").value = "Full-time";
  document.getElementById("career_experience").value = "7 years in Node.js, MySQL, Cloud & React";
  document.getElementById("career_linkedin").value = `https://linkedin.com/in/applicant${ts}`;
  document.getElementById("career_github").value = `https://github.com/applicant${ts}`;
});
